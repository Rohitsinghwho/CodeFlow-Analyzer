import express from "express";
import CodeFlow from "../CodeFlow.js";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import ProjectStore from "./ProjectStore.js";
import RateLimiter from "./RateLimiter.js";
import RepoCloner, { RepoError } from "./RepoCloner.js";
import Scanner from "../scanner/Scanner.js";

// Split a setting like "a;b" into ["a", "b"], ignoring empty parts.
// Returns `fallback` when the setting is not set.
function splitList(text, separator, fallback = []) {
  if (text === undefined) return fallback;
  return text.split(separator).map((part) => part.trim()).filter(Boolean);
}

// Read a positive number from an environment variable, or use `fallback`.
function readEnvNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MINUTE = 60 * 1000;
const MEGABYTE = 1024 * 1024;

/**
 * Build the Express app (it does not start listening).
 *
 * Every option can also be set with an environment variable (see docs/api.md
 * and docs/deployment.md). An option passed here wins over the environment.
 *
 * @param {object} [options]
 * @param {string[]} [options.allowedRoots] Folders that may be analyzed (ALLOWED_ROOTS).
 *   Empty means any folder.
 * @param {boolean} [options.allowLocalPaths] Whether `{ "path": "<folder>" }` may be used
 *   (ALLOW_LOCAL_PATHS, default on). Turn it off on a public server.
 * @param {boolean} [options.allowGithub] Whether `{ "repo": "<github link>" }` may be used
 *   (ALLOW_GITHUB, default on).
 * @param {string[]} [options.corsOrigins] Web page addresses allowed to call the API
 *   from a browser (CORS_ORIGIN). Default: the Vite dev server.
 * @param {number} [options.maxProjects] Projects kept in memory at once (MAX_PROJECTS, 20).
 * @param {number} [options.projectTtlMs] Forget a project unused for this long
 *   (PROJECT_TTL_MINUTES, 30 minutes).
 * @param {number} [options.maxFiles] Refuse projects with more JavaScript files (MAX_FILES, 3000).
 * @param {number} [options.maxDownloads] GitHub downloads running at the same time
 *   (MAX_DOWNLOADS, 2).
 * @param {{max: number, windowMs: number}|false} [options.rateLimit] How many analyze
 *   requests one visitor may make (RATE_LIMIT_MAX per RATE_LIMIT_WINDOW_MINUTES,
 *   30 per 10 minutes). `false` turns the limit off.
 * @param {RepoCloner} [options.cloner] Downloads repositories (tests replace it).
 */
function createApp(options = {}) {
  dotenv.config();

  // ---- Settings ----

  // ALLOWED_ROOTS uses ";" on Windows and ":" elsewhere, like the PATH variable.
  const allowedRoots = options.allowedRoots
    ?? splitList(process.env.ALLOWED_ROOTS, path.delimiter);
  const corsOrigins = options.corsOrigins
    ?? splitList(process.env.CORS_ORIGIN, ",", [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);
  const allowLocalPaths = options.allowLocalPaths ?? process.env.ALLOW_LOCAL_PATHS !== "false";
  const allowGithub = options.allowGithub ?? process.env.ALLOW_GITHUB !== "false";
  const maxFiles = options.maxFiles ?? readEnvNumber("MAX_FILES", 3000);
  const maxDownloads = options.maxDownloads ?? readEnvNumber("MAX_DOWNLOADS", 2);

  const cloner = options.cloner ?? new RepoCloner({
    maxBytes: readEnvNumber("MAX_REPO_MB", 200) * MEGABYTE,
  });

  const rateLimitSettings = options.rateLimit ?? {
    max: readEnvNumber("RATE_LIMIT_MAX", 30),
    windowMs: readEnvNumber("RATE_LIMIT_WINDOW_MINUTES", 10) * MINUTE,
  };
  const limiter = rateLimitSettings === false ? null : new RateLimiter(rateLimitSettings);

  // ---- Shared objects ----

  const codeFlow = new CodeFlow();
  const scanner = new Scanner();

  // One project per visitor. A project that leaves the store may be a downloaded
  // repository, so its folder is deleted too.
  const projects = new ProjectStore({
    maxProjects: options.maxProjects ?? readEnvNumber("MAX_PROJECTS", 20),
    ttlMs: options.projectTtlMs ?? readEnvNumber("PROJECT_TTL_MINUTES", 30) * MINUTE,
    onRemove: (project) => (project.downloadedFolder ? cloner.remove(project.downloadedFolder) : undefined),
  });
  // Forget expired projects now and then, even when nobody calls the API.
  // unref() lets the program exit normally instead of waiting for this timer.
  setInterval(() => projects.sweep(), MINUTE).unref();

  let activeDownloads = 0;

  const app = express();
  app.locals.cloner = cloner; // server.js uses it to clean up leftover downloads
  app.disable("x-powered-by"); // do not tell strangers which framework we use
  app.set("trust proxy", 1); // behind a host's proxy (like Render), so visitor addresses are read correctly

  // ---- CORS: let a web page on another address (like the frontend) call the API ----
  // Browsers block this by default. We answer only for the origins we trust.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Project-Id");
    }
    // Before a POST with JSON, the browser first sends an OPTIONS "preflight" question.
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json({ limit: "10kb" }));

  // ---- Small helpers used by the routes below ----

  // Is this folder inside one of the allowed roots?
  // Real paths are compared, so "..", shortcuts and symbolic links cannot sneak out.
  const isAllowedFolder = async (folder) => {
    if (allowedRoots.length === 0) {
      return true; // no limit configured
    }
    const real = await fs.realpath(folder).catch(() => path.resolve(folder));
    for (const root of allowedRoots) {
      const realRoot = await fs.realpath(root).catch(() => path.resolve(root));
      const relative = path.relative(realRoot, real);
      // Inside means: same folder, or a path below it that never steps up with "..".
      const staysInside = relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative);
      if (staysInside) {
        return true;
      }
    }
    return false;
  };

  // The project of the visitor who made this request, found by the id they send in
  // the X-Project-Id header. When there is none, the 409 reply is sent and null returned.
  const projectFor = (req, res) => {
    const id = req.get("x-project-id");
    if (!id) {
      res.status(409).json({ error: "Analyze a project first" });
      return null;
    }
    const project = projects.get(id);
    if (!project) {
      res.status(409).json({ error: "Project not found or expired. Analyze it again" });
      return null;
    }
    return project;
  };

  // Find a function by its id in a project. Returns { ...function, file } or null.
  const findFunction = (project, id) => {
    for (const fileResult of project.fileResults) {
      const fn = fileResult.functions.find((candidate) => candidate.id === id);
      if (fn) {
        return { ...fn, file: fileResult.file };
      }
    }
    return null;
  };

  // Read a number from a query value (they arrive as text).
  // Missing or invalid values give `fallback`; the result is kept between min and max.
  const readNumber = (value, fallback, min, max) =>
    Math.min(Math.max(Number(value) || fallback, min), max);

  // Is `value` a non-empty piece of text?
  const isText = (value) => typeof value === "string" && value !== "";

  // Analyze a folder and store it as the visitor's project. If the visitor already
  // had a project (`previousId`), it is replaced. Returns what the client is told.
  const openProject = async (folder, { downloadedFolder = null, repo = null, previousId = null } = {}) => {
    // Refuse huge projects before spending time on them.
    const files = await scanner.scan(folder, folder);
    if (files.length > maxFiles) {
      throw new RepoError(`too many files (${files.length}). the limit is ${maxFiles}`, 413);
    }

    const result = await codeFlow.analyze(folder);
    const projectId = projects.add({
      rootPath: folder,
      downloadedFolder,
      ...result,
      graph: codeFlow.buildGraph(result.fileResults),
    });

    // The old project of this visitor is not needed any more.
    if (previousId) {
      projects.delete(previousId);
    }

    return {
      projectId,
      files: result.files.length,
      functions: result.fileResults.reduce((total, r) => total + r.functions.length, 0),
      errors: result.errors,
      ...(repo ? { repo } : {}),
    };
  };

  // ---- Routes ----

  // Hosting platforms call this to see that the server is alive.
  app.get("/api/health", (req, res) => {
    res.json({ ok: true });
  });

  // What this server allows, so the web interface can show the right options.
  app.get("/api/config", (req, res) => {
    res.json({ allowLocalPaths, allowGithub });
  });

  app.post("/api/analyze", async (req, res) => {
    // Each visitor may only analyze so often (downloads and analysis cost time and memory).
    const verdict = limiter?.check(req.ip);
    if (verdict && !verdict.allowed) {
      res.set("Retry-After", String(verdict.retryAfterSeconds));
      return res.status(429).json({
        error: `too many analyses. try again in ${verdict.retryAfterSeconds} seconds`,
      });
    }

    const previousId = req.get("x-project-id") ?? null;

    // A GitHub link: download the repository, then analyze the downloaded folder.
    if (req.body?.repo !== undefined) {
      const link = req.body.repo;
      if (!allowGithub) {
        return res.status(403).json({ error: "Downloading from GitHub is turned off" });
      }
      if (typeof link !== "string" || !cloner.parse(link)) {
        return res.status(400).json({ error: "repo must be a link like https://github.com/owner/name" });
      }
      if (activeDownloads >= maxDownloads) {
        return res.status(429).json({ error: "the server is busy downloading other repositories. try again in a minute" });
      }

      let downloaded;
      activeDownloads += 1;
      try {
        downloaded = await cloner.clone(link);
      } catch (error) {
        if (error instanceof RepoError) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      } finally {
        activeDownloads -= 1;
      }

      try {
        const reply = await openProject(downloaded.folder, {
          downloadedFolder: downloaded.folder,
          repo: downloaded.display,
          previousId,
        });
        return res.status(200).json(reply);
      } catch (error) {
        await cloner.remove(downloaded.folder).catch(() => {});
        throw error;
      }
    }

    // Otherwise: a folder on the server's computer.
    if (!allowLocalPaths) {
      return res.status(403).json({ error: "Analyzing folders on the server is turned off. Use a GitHub link" });
    }
    const folder = req.body?.path;
    if (typeof folder !== "string" || folder.trim() === "") {
      return res.status(400).json({ error: "path must be a folder path" });
    }
    if (!(await isAllowedFolder(folder))) {
      return res.status(403).json({ error: "Folder is not allowed" });
    }

    let stats;
    try {
      stats = await fs.stat(folder); // await, so a missing folder throws here
    } catch {
      return res.status(400).json({ error: "Folder not found" });
    }
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: "path must be a folder, not a file" });
    }
    res.status(200).json(await openProject(folder, { previousId }));
  });

  app.get("/api/functions", async (req, res) => {
    const project = projectFor(req, res);
    if (!project) return;

    const all = project.fileResults.flatMap((r) =>
      r.functions.map((fn) => ({ ...fn, file: r.file })),
    );

    const search = String(req.query.search ?? "").toLowerCase();
    const file = String(req.query.file ?? "");
    const limit = readNumber(req.query.limit, 50, 1, 200);
    const offset = readNumber(req.query.offset, 0, 0, Infinity);

    const matches = all.filter((fn) => {
      const matchesSearch = fn.id.toLowerCase().includes(search);
      const matchesFile = fn.file.startsWith(file);
      return matchesSearch && matchesFile;
    });

    res.json({
      total: matches.length,
      items: matches.slice(offset, offset + limit),
    });
  });

  app.get("/api/function", async (req, res) => {
    // 1. The id must be given, and the visitor must have a project.
    const id = req.query.id;
    if (!isText(id)) {
      return res.status(400).json({ error: "id is required" });
    }
    const project = projectFor(req, res);
    if (!project) return;

    // 2. Find the function with this id, and remember which file it is in.
    const found = findFunction(project, id);
    if (!found) {
      return res.status(404).json({ error: "Function not found" });
    }

    // 3. Read the file and keep only the lines of this function.
    //    `line` and `endLine` start at 1, but array positions start at 0.
    const text = await fs.readFile(path.join(project.rootPath, found.file), "utf-8");
    const source = text
      .split(/\r?\n/)
      .slice(found.line - 1, found.endLine)
      .join("\n");

    // 4. Send the function with its source code.
    res.json({ ...found, source });
  });

  // What does this function call? (directly, and further down up to `depth` levels)
  app.get("/api/callees", (req, res) => {
    const id = req.query.id;
    if (!isText(id)) {
      return res.status(400).json({ error: "id is required" });
    }
    const project = projectFor(req, res);
    if (!project) return;
    if (!findFunction(project, id)) {
      return res.status(404).json({ error: "Function not found" });
    }

    const depth = readNumber(req.query.depth, 1, 1, 5);
    res.json({ id, depth, items: project.graph.getCallees(id, depth) });
  });

  // Who calls this function? (directly, and further up to `depth` levels)
  app.get("/api/callers", (req, res) => {
    const id = req.query.id;
    if (!isText(id)) {
      return res.status(400).json({ error: "id is required" });
    }
    const project = projectFor(req, res);
    if (!project) return;
    if (!findFunction(project, id)) {
      return res.status(404).json({ error: "Function not found" });
    }

    const depth = readNumber(req.query.depth, 1, 1, 5);
    res.json({ id, depth, items: project.graph.getCallers(id, depth) });
  });

  // What is the shortest chain of calls from one function to another?
  app.get("/api/path", (req, res) => {
    const { from, to } = req.query;
    if (!isText(from) || !isText(to)) {
      return res.status(400).json({ error: "from and to are required" });
    }
    const project = projectFor(req, res);
    if (!project) return;
    if (!findFunction(project, from) || !findFunction(project, to)) {
      return res.status(404).json({ error: "Function not found" });
    }

    const maxDepth = readNumber(req.query.maxDepth, 10, 1, 20);
    res.json({ from, to, path: project.graph.findPath(from, to, maxDepth) });
  });

  // Walk the call graph from a function outward (BFS) and return the steps
  // in the order they would be visited. The frontend animates these as the
  // "electricity flow". When `to` is given, only the shortest-path steps are returned.
  app.get("/api/trace", (req, res) => {
    const from = req.query.from;
    if (!isText(from)) {
      return res.status(400).json({ error: "from is required" });
    }
    const project = projectFor(req, res);
    if (!project) return;
    if (!findFunction(project, from)) {
      return res.status(404).json({ error: "Start function not found" });
    }

    const to = req.query.to;
    if (to && !findFunction(project, to)) {
      return res.status(404).json({ error: "Target function not found" });
    }

    const maxDepth = readNumber(req.query.maxDepth, 10, 1, 20);
    const steps = project.graph.getTrace(from, to || undefined, maxDepth);
    res.json({ from, to: to || null, steps });
  });

  // Anything that goes wrong in a route ends up here.
  app.use((err, req, res, next) => {
    // Errors with a status (too many files, repository too large...) are safe to show.
    if (err instanceof RepoError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err); // show the real error in the terminal, but not to the visitor
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}

export default createApp;
