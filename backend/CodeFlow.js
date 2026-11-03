import path from "path";

import Analyzer from "./analyzer/Analyzer.js";
import { Linker } from "./linker/Linker.js";
import Parser from "./parser/Parser.js";
import Scanner from "./scanner/Scanner.js";
import RuleSet from "./analyzer/rules/RuleSet.js";
import Utilities from "./utils/Utilities.js";

/**
 * CodeFlow is the front door of the backend. It wires the pieces together:
 *
 *   Scanner  -> lists the project's JavaScript files
 *   Parser   -> turns each file into a syntax tree (AST)
 *   Analyzer -> finds functions, calls, imports and exports in each tree
 *   Linker   -> connects those findings across files
 *
 * Every piece can be swapped through the constructor (handy for tests).
 */
class CodeFlow {
  #scanner;
  #parser;
  #analyzer;
  #linker;

  constructor({
    scanner = new Scanner(),
    parser = new Parser(),
    rules = new RuleSet(),
    utilities = new Utilities(),
    analyzer = new Analyzer({ rules, utilities }),
    linker = new Linker(),
  } = {}) {
    this.#scanner = scanner;
    this.#parser = parser;
    this.#analyzer = analyzer;
    this.#linker = linker;
  }

  /**
   * Analyze a whole project folder.
   *
   * @param {string} rootPath Absolute path of the project folder.
   * @returns {Promise<{files: string[], fileResults: object[], errors: object[]}>}
   *   files:       every project-relative JS file found
   *   fileResults: per-file findings (functions, calls, imports, exports)
   *   errors:      files that could not be parsed, as { file, error }
   */
  async analyze(rootPath) {
    // 1. Find the files.
    const relativeFiles = await this.#scanner.scan(rootPath, rootPath);
    const fileResults = [];
    const errors = [];

    // 2. Parse and analyze each file on its own.
    for (const relativePath of relativeFiles) {
      const parsed = await this.#parser.parse(
        path.join(rootPath, relativePath),
      );

      // A file with a syntax error has no AST. Record why and carry on,
      // so one bad file does not stop the rest of the project.
      if (!parsed?.ast) {
        errors.push({ file: relativePath, error: parsed?.error });
        continue;
      }

      fileResults.push({
        file: relativePath,
        ...this.#analyzer.analyze(parsed.ast, relativePath),
      });
    }

    // 3. Let the linker index everything so cross-file lookups work.
    this.#linker.buildIndexes(fileResults);

    return { files: relativeFiles, fileResults, errors };
  }

  /** Which project file does `import ... from source` (written in `fromFile`) point at? */
  resolveModule(fromFile, source, fileSet) {
    return this.#linker.resolveModule(fromFile, source, fileSet);
  }

  /** Which function id does `file` expose under `exportedName`? */
  resolveExport(file, exportedName) {
    return this.#linker.resolveExport(file, exportedName);
  }

  /** Connect every call to the function it reaches. Pass `fileResults` from analyze(). */
  linkCalls(fileResults) {
    return this.#linker.linkCalls(fileResults);
  }
}

export default CodeFlow;
export { CodeFlow };
