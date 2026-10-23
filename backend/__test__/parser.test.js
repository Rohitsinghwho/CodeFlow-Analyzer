import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import Parser from "../parser/Parser.js";

const fixtureRoot = path.resolve("__test__/fixtures/project");

test("parser parses the fixture module from its real file path", async () => {
  const filePath = path.join(fixtureRoot, "b.js");
  const result = await new Parser().parse(filePath);

  const rows = [
    ["result contains an AST", Boolean(result.ast)],
    ["AST is a Program", result.ast?.type === "Program"],
    ["module source type is preserved", result.ast?.sourceType === "module"],
    ["fixture has export declarations", result.ast?.body.some(
      (node) => node.type === "ExportNamedDeclaration",
    )],
  ];
  console.table(rows.map(([feature, passed]) => ({ feature, passed })));

  for (const [, passed] of rows) assert.equal(passed, true);
});
