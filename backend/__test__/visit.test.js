import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import Parser from "../parser/Parser.js";
import Analyzer from "../analyzer/Analyzer.js";

const fixtureRoot = path.resolve("__test__/fixtures/project");

test("visitor analyzes the parsed fixture file", async () => {
  const parser = new Parser();
  const analyzer = new Analyzer();
  const parsed = await parser.parse(path.join(fixtureRoot, "b.js"));
  const result = analyzer.analyze(parsed.ast, "b.js");
  const mainParsed = await parser.parse(path.join(fixtureRoot, "main.js"));
  const mainResult = analyzer.analyze(mainParsed.ast, "main.js");

  const rows = [
    ["top-level init function", result.functions.some(
      ({ name, owner }) => name === "init" && owner === null,
    )],
    ["top-level helper function", result.functions.some(
      ({ name, owner }) => name === "helper" && owner === null,
    )],
    ["class method has its owner", result.functions.some(
      ({ name, owner }) => name === "run" && owner === "Svc",
    )],
    ["aliased import is recorded", mainResult.imports.some(
      ({ localName, importedName, source }) =>
        localName === "helperAlias" &&
        importedName === "helper" &&
        source === "./c.js",
    )],
    ["export alias is recorded", result.exports.some(
      ({ exportedName, localName }) =>
        exportedName === "e" && localName === "helper",
    )],
  ];
  console.table(rows.map(([feature, passed]) => ({ feature, passed })));

  for (const [, passed] of rows) assert.equal(passed, true);
});
