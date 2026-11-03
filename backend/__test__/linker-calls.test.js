import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import CodeFlow from "../CodeFlow.js";

// Finds the edge from `caller` to `callee`, or undefined.
function findEdge(edges, caller, callee) {
  return edges.find((edge) => edge.caller === caller && edge.callee === callee);
}

test("linkCalls resolves same-file and imported calls as certain", async () => {
  const codeFlow = new CodeFlow();
  const { fileResults } = await codeFlow.analyze(path.resolve("__test__/fixtures/project"));
  const edges = codeFlow.linkCalls(fileResults);

  // main.js: start() is `init` from c.js, helperAlias() is `helper` from c.js.
  const toInit = findEdge(edges, "main.js#main", "c.js#init");
  const toHelper = findEdge(edges, "main.js#main", "c.js#helper");
  assert.equal(toInit?.confidence, "certain");
  assert.equal(toInit?.file, "main.js");
  assert.equal(toHelper?.confidence, "certain");

  // b.js: init() calls helper() in the same file.
  assert.equal(findEdge(edges, "b.js#init", "b.js#helper")?.confidence, "certain");
});

test("linkCalls links this.method() as certain and obj.method() as a guess", async () => {
  const codeFlow = new CodeFlow();
  const { fileResults } = await codeFlow.analyze(path.resolve("__test__/fixtures/calls"));
  const edges = codeFlow.linkCalls(fileResults);

  assert.equal(findEdge(edges, "box.js#Box.open", "box.js#Box.close")?.confidence, "certain");
  assert.equal(findEdge(edges, "box.js#use", "box.js#Box.close")?.confidence, "guess");
});
