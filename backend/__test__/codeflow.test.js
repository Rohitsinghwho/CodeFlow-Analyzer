import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import CodeFlow from "../CodeFlow.js";

const fixtureRoot = path.resolve("__test__/fixtures/project");

test("CodeFlow composes the class-based project pipeline", async () => {
  const codeFlow = new CodeFlow();
  const result = await codeFlow.analyze(fixtureRoot);

  const rows = [
    ["scanner returned fixture files", result.files.length === 3],
    ["parser and analyzer produced file results", result.fileResults.length === 3],
    ["linker resolves direct exports", codeFlow.resolveExport("b.js", "init") === "b.js#init"],
    ["linker resolves aliased exports", codeFlow.resolveExport("b.js", "e") === "b.js#helper"],
    ["linker resolves relative modules", codeFlow.resolveModule(
      "main.js",
      "./c",
      new Set(result.files),
    ) === "c.js"],
  ];
  console.table(rows.map(([feature, passed]) => ({ feature, passed })));

  for (const [, passed] of rows) assert.equal(passed, true);
});

test("parse failures are reported while other files are still analyzed", async () => {
  const result = await new CodeFlow().analyze(path.resolve("__test__/fixtures/broken"));

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].file, "bad.js");
  assert.match(result.errors[0].error, /line \d+/);
  assert.deepEqual(result.fileResults.map((fileResult) => fileResult.file), ["ok.js"]);
});

test("two CodeFlow instances do not share indexes", async () => {
  const first = new CodeFlow();
  const second = new CodeFlow();
  await first.analyze(fixtureRoot);
  await second.analyze(path.resolve("__test__/fixtures/other"));

  assert.equal(first.resolveExport("b.js", "init"), "b.js#init");
  assert.equal(second.resolveExport("b.js", "init"), null);
  assert.equal(second.resolveExport("b.js", "onlyHere"), "b.js#onlyHere");
  assert.equal(first.resolveExport("b.js", "onlyHere"), null);
});
