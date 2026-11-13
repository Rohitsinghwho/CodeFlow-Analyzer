import express from "express";
import CodeFlow from "../CodeFlow.js";
import fs from "fs/promises";
import path from "path";
import dotenv from 'dotenv'


function createApp() {
  dotenv.config();
  const codeFlow = new CodeFlow();
  let project = null;
  const app = express();
  app.use(express.json());
  app.post("/api/analyze", async (req, res) => {
    const folder = req.body?.path;
    if (typeof folder !== "string" || folder.trim() === "") {
      return res.status(400).json({ error: "path must be a folder path" });
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
    const result = await codeFlow.analyze(folder);
    project = {
      rootPath: folder,
      ...result,
      graph: codeFlow.buildGraph(result.fileResults),
    };

    res.status(200).json({
      files: result.files.length,
      functions: result.fileResults.reduce(
        (total, r) => total + r.functions.length,
        0,
      ),
      errors: result.errors,
    });
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
  app.use((err, req, res, next) => {
    console.error(err); // show the real error in the terminal
    res.status(500).json({ error: "Something went wrong" });
  });

  return app;
}

export default createApp;
