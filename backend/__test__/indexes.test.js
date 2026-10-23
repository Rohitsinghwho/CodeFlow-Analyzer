import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import Analyzer from "../analyzer/Analyzer.js";
import { Linker } from "../linker/Linker.js";
import indexMaps from "../indexes/IndexMaps.js";
import Parser from "../parser/Parser.js";

const fixtureRoot = path.resolve("__test__/fixtures/project");

async function analyze(relativePath) {
  const parsed = await new Parser().parse(path.join(fixtureRoot, relativePath));
  return {
    file: relativePath,
    ...new Analyzer().analyze(parsed.ast, relativePath),
  };
}

test("indexes are built from real analyzer results", async () => {
  const linker = new Linker(indexMaps);
  linker.buildIndexes([await analyze("b.js"), await analyze("c.js")]);

  const rows = [
    ["b.js export lookup", indexMaps.getExport("b.js", "init")?.localName === "init"],
    ["b.js alias lookup", indexMaps.getExport("b.js", "e")?.localName === "helper"],
    ["b.js function lookup", indexMaps.getFunction("b.js", "init")?.id === "b.js#init"],
    ["class methods excluded", !indexMaps.hasFunction("b.js", "run")],
    ["same function name is file-scoped", indexMaps.getFunction("c.js", "init")?.id === "c.js#init"],
  ];
  console.table(rows.map(([feature, passed]) => ({ feature, passed })));

  for (const [, passed] of rows) assert.equal(passed, true);
});
