import path from "path";

import Analyzer from "./analyzer/Analyzer.js";
import { Linker } from "./linker/Linker.js";
import Parser from "./parser/Parser.js";
import Scanner from "./scanner/Scanner.js";
import RuleSet from "./analyzer/rules/RuleSet.js";
import Utilities from "./utils/Utilities.js";

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

  async analyze(rootPath) {
    const relativeFiles = await this.#scanner.scan(rootPath, rootPath);
    const fileResults = [];

    for (const relativePath of relativeFiles) {
      const parsed = await this.#parser.parse(
        path.join(rootPath, relativePath),
      );

      if (!parsed?.ast) {
        continue;
      }

      fileResults.push({
        file: relativePath,
        ...this.#analyzer.analyze(parsed.ast, relativePath),
      });
    }

    this.#linker.buildIndexes(fileResults);

    return { files: relativeFiles, fileResults };
  }

  resolveModule(fromFile, source, fileSet) {
    return this.#linker.resolveModule(fromFile, source, fileSet);
  }

  resolveExport(file, exportedName) {
    return this.#linker.resolveExport(file, exportedName);
  }
}

export default CodeFlow;
export { CodeFlow };
