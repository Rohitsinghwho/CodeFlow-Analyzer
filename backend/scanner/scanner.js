import fs from "fs/promises";
import path from "path";

class Scanner {
  async scan(directory, rootPath = directory) {
    const ignored = new Set([
      "node_modules", ".git", "dist", "build", "coverage", ".gitignore", "test",
    ]);
    const extensions = new Set([".js", ".mjs", ".cjs"]);
    const files = [];

    const visit = async (currentDirectory) => {
      const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (ignored.has(entry.name)) continue;
        const fullPath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
          await visit(fullPath);
        } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
          files.push(path.relative(rootPath, fullPath).split(path.sep).join("/"));
        }
      }
    };

    await visit(directory);
    return files.sort();
  }
}

export default Scanner;
export { Scanner };
