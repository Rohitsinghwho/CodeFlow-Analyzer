import fs from "fs/promises";
import path from "path";

/**
 * Finds the JavaScript files of a project folder.
 */
class Scanner {
  /**
   * Walk `directory` (including sub-folders) and list its JS files.
   *
   * @param {string} directory Folder to walk.
   * @param {string} [rootPath=directory] Paths in the result are relative to this.
   * @returns {Promise<string[]>} Sorted, project-relative paths using "/" on every OS,
   *   e.g. ["main.js", "utils/helpers.js"].
   */
  async scan(directory, rootPath = directory) {
    // Folders and files we never look inside (dependencies, build output, tests).
    const ignored = new Set([
      "node_modules", ".git", "dist", "build", "coverage", ".gitignore", "test",
    ]);
    // Only these file types count as source files.
    const extensions = new Set([".js", ".mjs", ".cjs"]);
    const files = [];

    // Visits one folder, then calls itself for every sub-folder.
    const visit = async (currentDirectory) => {
      const entries = await fs.readdir(currentDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (ignored.has(entry.name)) continue;
        const fullPath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
          await visit(fullPath);
        } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
          // Store the path relative to the project root, with "/" even on Windows,
          // so ids look the same on every machine.
          files.push(path.relative(rootPath, fullPath).split(path.sep).join("/"));
        }
      }
    };

    await visit(directory);
    // Sort so results do not depend on the order the OS lists files in.
    return files.sort();
  }
}

export default Scanner;
export { Scanner };
