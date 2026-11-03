import * as acorn from "acorn";
import fs from "fs/promises";

/**
 * Turns one JavaScript file into a syntax tree (AST) using Acorn.
 */
class Parser {
  /**
   * Read and parse a file.
   *
   * It never throws. On success the result is `{ ast }`. On failure (missing
   * file or invalid syntax) it is `{ file, error }`, where `error` is a
   * readable message such as "Unexpected token (line 3, column 5)".
   *
   * @param {string} filePath Path of the file on disk.
   */
  async parse(filePath) {
    try {
      const contents = await fs.readFile(filePath, { encoding: "utf-8" });
      return {
        ast: acorn.parse(contents, {
          ecmaVersion: "latest", // understand the newest syntax
          locations: true, // keep line numbers on every node
          sourceType: "module", // allow import / export
        }),
      };
    } catch (error) {
      // Build a friendly message and include the position when Acorn gives one.
      const message = error instanceof Error ? error.message : String(error);
      const line = error?.loc?.line;
      const column = error?.loc?.column;
      const location = line === undefined ? "" : ` (line ${line}, column ${column ?? 0})`;
      return { file: filePath, error: `${message}${location}` };
    }
  }
}

export default Parser;
export { Parser };
