import express from "express";
import CodeFlow from "../CodeFlow.js";
import fs from "fs/promises";
import path from "path";
import dotenv from 'dotenv'
import RepoCloner, { RepoError } from "./RepoCloner.js";


// Split a setting like "a;b" into ["a", "b"], ignoring empty parts.
// Returns `fallback` when the setting is not set.
function splitList(text, separator, fallback = []) {
  if (text === undefined) return fallback;
  return text.split(separator).map((part) => part.trim()).filter(Boolean);
}

/**
 * Build the Express app (it does not start listening).
 *
 * @param {object} [options]
 * @param {string[]} [options.allowedRoots] Folders that may be analyzed. A request
 *   for any other folder gets 403. Default: the ALLOWED_ROOTS setting, and when
 *   that is empty or missing, every folder is allowed (fine on your own computer,
 *   not fine on a shared server).
 * @param {string[]} [options.corsOrigins] Web page addresses allowed to call the
 *   API from a browser. Default: the CORS_ORIGIN setting, or the Vite dev server.
 * @param {boolean} [options.allowGithub] Whether `{ "repo": "<github link>" }` may be
 *   used to download and analyze a GitHub repository. Default: on, unless the
 *   ALLOW_GITHUB setting is "false".
 * @param {RepoCloner} [options.cloner] Downloads repositories (tests replace it).
 */
function createApp(options = {}) {
  dotenv.config();

  // Settings come from the options (used by tests) or from the environment (.env).
  // ALLOWED_ROOTS uses ";" on Windows and ":" elsewhere, like the PATH variable.
  const allowedRoots = options.allowedRoots
    ?? splitList(process.env.ALLOWED_ROOTS, path.delimiter);
  const corsOrigins = options.corsOrigins
    ?? splitList(process.env.CORS_ORIGIN, ",", [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]);

  const allowGithub = options.allowGithub ?? process.env.ALLOW_GITHUB !== "false";
  const cloner = options.cloner ?? new RepoCloner();

  const codeFlow = new CodeFlow();
  let project = null;
  const app = express();

  // ---- CORS: let a web page on another address (like the frontend) call the API ----
  // Browsers block this by default. We answer only for the origins we trust.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    // Before a POST with JSON, the browser first sends an OPTIONS "preflight" question.
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(express.json());

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

  // ---- Small helpers used by the callees, callers and path routes ----

  // Find a function by its id. Returns { ...function, file } or null.
  const findFunction = (id) => {
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

  // Analyze a folder and make it the project every other route reads.
  // `downloadedFolder` is set when the folder is a downloaded GitHub repository,
  // so it can be deleted when it is replaced. Returns what the client is told.
  const openProject = async (folder, { downloadedFolder = null, repo = null } = {}) => {
    const result = await codeFlow.analyze(folder);
    const previous = project;
    project = {
      rootPath: folder,
      downloadedFolder,
      ...result,
      graph: codeFlow.buildGraph(result.fileResults),
    };

    // The old project may have been a download that nobody needs any more.
    if (previous?.downloadedFolder) {
      await cloner.remove(previous.downloadedFolder).catch(() => {});
    }

    return {
      files: result.files.length,
      functions: result.fileResults.reduce((total, r) => total + r.functions.length, 0),
      errors: result.errors,
      ...(repo ? { repo } : {}),
    };
  };

  app.post("/api/analyze", async (req, res) => {
    // A GitHub link: download the repository, then analyze the downloaded folder.
    if (req.body?.repo !== undefined) {
      const link = req.body.repo;
      if (!allowGithub) {
        return res.status(403).json({ error: "Downloading from GitHub is turned off" });
      }
      if (typeof link !== "string" || !cloner.parse(link)) {
        return res.status(400).json({ error: "repo must be a link like https://github.com/owner/name" });
      }

      let downloaded;
      try {
        downloaded = await cloner.clone(link);
      } catch (error) {
        if (error instanceof RepoError) {
          return res.status(error.status).json({ error: error.message });
        }
        throw error;
      }

      try {
        const reply = await openProject(downloaded.folder, {
          downloadedFolder: downloaded.folder,
          repo: downloaded.display,
        });
        return res.status(200).json(reply);
      } catch (error) {
        await cloner.remove(downloaded.folder).catch(() => {});
        throw error;
      }
    }

    // Otherwise: a folder on the server's computer.
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
      return res
        .status(400)
        .json({ error: "path must be a folder, not a file" });
    }
    res.status(200).json(await openProject(folder));
  });

  app.get("/api/functions", async (req, res) => {
    if (project === null || !project) {
      return res.status(409).json({ error: "Analyze a project first" });
    }
    const all = project.fileResults.flatMap((r) =>
      r.functions.map((fn) => ({ ...fn, file: r.file })),
    );

    const search = String(req.query.search ?? "").toLowerCase();
    const file = String(req.query.file ?? "");
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

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
    // 1. The id must be given, and a project must be analyzed.
    const id = req.query.id;
    if (typeof id !== "string" || id === "") {
      return res.status(400).json({ error: "id is required" });
    }
    if (!project) {
      return res.status(409).json({ error: "Analyze a project first" });
    }

    // 2. Find the function with this id, and remember which file it is in.
    let found = null;
    for (const fileResult of project.fileResults) {
      const fn = fileResult.functions.find((candidate) => candidate.id === id);
      if (fn) {
        found = { ...fn, file: fileResult.file };
        break;
      }
    }
    if (!found) {
      return res.status(404).json({ error: "Function not found" });
    }

    // 3. Read the file and keep only the lines of this function.
    //    `line` and `endLine` start at 1, but array positions start at 0.
    const text = await fs.readFile(
      path.join(project.rootPath, found.file),
      "utf-8",
    );
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
    if (!project) {
      return res.status(409).json({ error: "Analyze a project first" });
    }
    if (!findFunction(id)) {
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
    if (!project) {
      return res.status(409).json({ error: "Analyze a project first" });
    }
    if (!findFunction(id)) {
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
    if (!project) {
      return res.status(409).json({ error: "Analyze a project first" });
    }
    if (!findFunction(from) || !findFunction(to)) {
      return res.status(404).json({ error: "Function not found" });
    }

    const maxDepth = readNumber(req.query.maxDepth, 10, 1, 20);
    res.json({ from, to, path: project.graph.findPath(from, to, maxDepth) });
  });



  app.use((err, req, res, next) => {
    console.error(err); // show the real error in the terminal
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}

export default createApp;
