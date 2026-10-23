import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import Scanner from "../scanner/Scanner.js";
import Parser from "../parser/Parser.js";
import Analyzer from "../analyzer/Analyzer.js";
import { Linker } from "../linker/Linker.js";
import { IndexMaps } from "../indexes/IndexMaps.js";

const fixtureRoot = path.resolve("__test__/fixtures/project");

test("full fixture flow scans, parses, visits, indexes, and resolves", async () => {
  const linker = new Linker(new IndexMaps());
  const scanner = new Scanner();
  const parser = new Parser();
  const analyzer = new Analyzer();
  const relativeFiles = await scanner.scan(fixtureRoot, fixtureRoot);
  const fileResults = [];

  for (const relativePath of relativeFiles) {
    const parsed = await parser.parse(path.join(fixtureRoot, relativePath));
    fileResults.push({
      file: relativePath,
      ...analyzer.analyze(parsed.ast, relativePath),
    });
  }

  linker.buildIndexes(fileResults);

  const rows = [
    ["scanner finds b.js", relativeFiles.includes("b.js")],
    ["scanner finds c.js", relativeFiles.includes("c.js")],
    ["scanner finds main.js", relativeFiles.includes("main.js")],
    ["parser and visitor produce results for every file", fileResults.length === 3],
    ["direct export resolves", linker.resolveExport("b.js", "init") === "b.js#init"],
    ["aliased export resolves", linker.resolveExport("b.js", "e") === "b.js#helper"],
    ["default export resolves", linker.resolveExport("b.js", "default") === "b.js#helper"],
    ["missing export returns null", linker.resolveExport("b.js", "missing") === null],
    ["class method is not imported as a top-level function", linker.resolveExport("b.js", "run") === null],
  ];
  console.table(rows.map(([feature, passed]) => ({ feature, passed })));

  for (const [, passed] of rows) assert.equal(passed, true);
});
