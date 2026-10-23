import * as acorn from "acorn";
import fs from "fs/promises";

class Parser {
  async parse(filePath) {
    try {
      const contents = await fs.readFile(filePath, { encoding: "utf-8" });
      return {
        ast: acorn.parse(contents, {
          ecmaVersion: "latest",
          locations: true,
          sourceType: "module",
        }),
      };
    } catch (error) {
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
