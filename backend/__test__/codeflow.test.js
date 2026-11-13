// All backend tests live in this one file, in sections:
//   1. Small fixture projects   - each piece (parser, analyzer, linker...) on tiny files
//   2. Whole pipeline           - CodeFlow end to end, errors, separate instances
//   3. Call linking             - linkCalls rules on small fixtures
//   4. CodeFlow on its own code - checks the real "who calls whom" of this repo
//   5. HTTP API                 - the Express endpoints, called over a real local port
//   6. GitHub links             - parsing links, downloading a repository (offline), the API option
// Run with `npm test` from the backend/ folder.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import Analyzer from "../analyzer/Analyzer.js";
import createApp from "../api/createApp.js";
import RepoCloner, { RepoError } from "../api/RepoCloner.js";
import CodeFlow from "../CodeFlow.js";
import indexMaps, { IndexMaps } from "../indexes/IndexMaps.js";
import { Linker } from "../linker/Linker.js";
import Parser from "../parser/Parser.js";
import Scanner from "../scanner/Scanner.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const testFolder = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(testFolder, "..");

// Path of a fixture project, e.g. fixture("project") -> .../__test__/fixtures/project
const fixture = (name) => path.join(testFolder, "fixtures", name);

// The small fixture project used by most tests: b.js, c.js and main.js.
const fixtureRoot = fixture("project");

// Parse and analyze one fixture file the same way CodeFlow does.
async function analyzeFile(relativePath) {
  const parsed = await new Parser().parse(path.join(fixtureRoot, relativePath));
  return {
    file: relativePath,
    ...new Analyzer().analyze(parsed.ast, relativePath),
  };
}

// Print a table of checks, then fail if any check is false.
function assertRows(rows) {
  console.table(rows.map(([feature, passed]) => ({ feature, passed })));
  for (const [, passed] of rows) assert.equal(passed, true);
}

// Find the edge "caller -> callee" in a list of edges (or undefined).
function findEdge(edges, caller, callee) {
  return edges.find((edge) => edge.caller === caller && edge.callee === callee);
}

// ---------------------------------------------------------------------------
// 1. Small fixture projects
// ---------------------------------------------------------------------------

test("parser parses the fixture module from its real file path", async () => {
  const result = await new Parser().parse(path.join(fixtureRoot, "b.js"));

  assertRows([
    ["result contains an AST", Boolean(result.ast)],
    ["AST is a Program", result.ast?.type === "Program"],
    ["module source type is preserved", result.ast?.sourceType === "module"],
    ["fixture has export declarations", result.ast?.body.some(
      (node) => node.type === "ExportNamedDeclaration",
    )],
  ]);
});

test("analyzer finds functions, imports and exports in the fixture files", async () => {
  const result = await analyzeFile("b.js");
  const mainResult = await analyzeFile("main.js");

  assertRows([
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
  ]);
});

test("indexes are built from real analyzer results", async () => {
  const linker = new Linker(indexMaps);
  linker.buildIndexes([await analyzeFile("b.js"), await analyzeFile("c.js")]);

  assertRows([
    ["b.js export lookup", indexMaps.getExport("b.js", "init")?.localName === "init"],
    ["b.js alias lookup", indexMaps.getExport("b.js", "e")?.localName === "helper"],
    ["b.js function lookup", indexMaps.getFunction("b.js", "init")?.id === "b.js#init"],
    ["class methods excluded", !indexMaps.hasFunction("b.js", "run")],
    ["same function name is file-scoped", indexMaps.getFunction("c.js", "init")?.id === "c.js#init"],
  ]);
});

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

  assertRows([
    ["scanner finds b.js", relativeFiles.includes("b.js")],
    ["scanner finds c.js", relativeFiles.includes("c.js")],
    ["scanner finds main.js", relativeFiles.includes("main.js")],
    ["parser and visitor produce results for every file", fileResults.length === 3],
    ["direct export resolves", linker.resolveExport("b.js", "init") === "b.js#init"],
    ["aliased export resolves", linker.resolveExport("b.js", "e") === "b.js#helper"],
    ["default export resolves", linker.resolveExport("b.js", "default") === "b.js#helper"],
    ["missing export returns null", linker.resolveExport("b.js", "missing") === null],
    ["class method is not imported as a top-level function", linker.resolveExport("b.js", "run") === null],
  ]);
});

// ---------------------------------------------------------------------------
// 2. Whole pipeline (CodeFlow)
// ---------------------------------------------------------------------------

test("CodeFlow composes the class-based project pipeline", async () => {
  const codeFlow = new CodeFlow();
  const result = await codeFlow.analyze(fixtureRoot);

  assertRows([
    ["scanner returned fixture files", result.files.length === 3],
    ["parser and analyzer produced file results", result.fileResults.length === 3],
    ["linker resolves direct exports", codeFlow.resolveExport("b.js", "init") === "b.js#init"],
    ["linker resolves aliased exports", codeFlow.resolveExport("b.js", "e") === "b.js#helper"],
    ["linker resolves relative modules", codeFlow.resolveModule(
      "main.js",
      "./c",
      new Set(result.files),
    ) === "c.js"],
  ]);
});

test("parse failures are reported while other files are still analyzed", async () => {
  const result = await new CodeFlow().analyze(fixture("broken"));

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].file, "bad.js");
  assert.match(result.errors[0].error, /line \d+/);
  assert.deepEqual(result.fileResults.map((fileResult) => fileResult.file), ["ok.js"]);
});

test("two CodeFlow instances do not share indexes", async () => {
  const first = new CodeFlow();
  const second = new CodeFlow();
  await first.analyze(fixtureRoot);
  await second.analyze(fixture("other"));

  assert.equal(first.resolveExport("b.js", "init"), "b.js#init");
  assert.equal(second.resolveExport("b.js", "init"), null);
  assert.equal(second.resolveExport("b.js", "onlyHere"), "b.js#onlyHere");
  assert.equal(first.resolveExport("b.js", "onlyHere"), null);
});

// ---------------------------------------------------------------------------
// 3. Call linking
// ---------------------------------------------------------------------------

test("linkCalls resolves same-file and imported calls as certain", async () => {
  const codeFlow = new CodeFlow();
  const { fileResults } = await codeFlow.analyze(fixtureRoot);
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
  const { fileResults } = await codeFlow.analyze(fixture("calls"));
  const edges = codeFlow.linkCalls(fileResults);

  assert.equal(findEdge(edges, "box.js#Box.open", "box.js#Box.close")?.confidence, "certain");
  assert.equal(findEdge(edges, "box.js#use", "box.js#Box.close")?.confidence, "guess");
});

// ---------------------------------------------------------------------------
// 4. CodeFlow on its own source code
//
// These tests run CodeFlow on this very backend/ folder and check the
// functions and "who calls whom" relationships that we can see by reading the
// code. If someone changes how one function calls another, a test here tells them.
// ---------------------------------------------------------------------------

// Analyze once and share the result between all tests in this section.
const selfCodeFlow = new CodeFlow();
const selfAnalysis = await selfCodeFlow.analyze(backendRoot);

// Only look at the real source code, not at the tests and their fixtures.
const sourceResults = selfAnalysis.fileResults.filter(
  (fileResult) => !fileResult.file.startsWith("__test__/"),
);
const selfEdges = selfCodeFlow.linkCalls(sourceResults);
const graph = selfCodeFlow.buildGraph(sourceResults);

// Short helpers to write function ids: id("graph/Graph.js", "Graph.findPath").
const id = (file, name) => `${file}#${name}`;
const ruleSetId = (name) => id("analyzer/rules/RuleSet.js", `RuleSet.${name}`);
const scannerId = (name) => id("scanner/Scanner.js", name);
const analyzerId = (name) => id("analyzer/Analyzer.js", name);

test("the scanner finds every backend source file", () => {
  const expectedFiles = [
    "CodeFlow.js",
    "index.js",
    "analyzer/Analyzer.js",
    "analyzer/rules/RuleSet.js",
    "graph/Graph.js",
    "indexes/IndexMaps.js",
    "linker/Linker.js",
    "parser/Parser.js",
    "scanner/Scanner.js",
    "utils/Utilities.js",
  ];

  for (const file of expectedFiles) {
    assert.ok(selfAnalysis.files.includes(file), `${file} should be found`);
  }
});

test("the only file that fails to parse is the intentionally broken fixture", () => {
  assert.deepEqual(
    selfAnalysis.errors.map((error) => error.file),
    ["__test__/fixtures/broken/bad.js"],
  );
});

test("functions are found in each file, with the right owner", () => {
  const expectedFunctions = [
    // [file, function name, owner]
    ["CodeFlow.js", "CodeFlow.analyze", "CodeFlow"],
    ["CodeFlow.js", "CodeFlow.buildGraph", "CodeFlow"],
    ["analyzer/Analyzer.js", "Analyzer.analyze", "Analyzer"],
    ["analyzer/rules/RuleSet.js", "RuleSet.findFunctions", "RuleSet"],
    ["graph/Graph.js", "Graph.getCallees", "Graph"],
    ["graph/Graph.js", "Graph.getCallers", "Graph"],
    ["graph/Graph.js", "Graph.findPath", "Graph"],
    ["indexes/IndexMaps.js", "IndexMaps.getExport", "IndexMaps"],
    ["linker/Linker.js", "Linker.resolveModule", "Linker"],
    ["linker/Linker.js", "Linker.resolveExport", "Linker"],
    ["linker/Linker.js", "Linker.linkCalls", "Linker"],
    ["parser/Parser.js", "Parser.parse", "Parser"],
    ["scanner/Scanner.js", "Scanner.scan", "Scanner"],
    ["utils/Utilities.js", "Utilities.childNodes", "Utilities"],
  ];

  for (const [file, name, owner] of expectedFunctions) {
    const fileResult = sourceResults.find((result) => result.file === file);
    const found = fileResult.functions.find((fn) => fn.id === id(file, name));
    assert.ok(found, `${id(file, name)} should be found`);
    assert.equal(found.owner, owner);
    assert.equal(found.kind, "method");
  }
});

test("a function declared inside a method is a plain function with no owner", () => {
  // Scanner.scan defines `const visit = async (...) => {...}` inside itself.
  const scannerResult = sourceResults.find((result) => result.file === "scanner/Scanner.js");
  const visit = scannerResult.functions.find((fn) => fn.id === scannerId("visit"));

  assert.ok(visit, "visit should be found");
  assert.equal(visit.owner, null);
  assert.equal(visit.kind, "function");
});

test("every backend file exports what we expect", () => {
  const expectedExports = [
    ["CodeFlow.js", ["default", "CodeFlow"]],
    ["graph/Graph.js", ["default"]],
    ["linker/Linker.js", ["Linker", "default"]],
    ["indexes/IndexMaps.js", ["IndexMaps", "default"]],
  ];

  for (const [file, names] of expectedExports) {
    const fileResult = sourceResults.find((result) => result.file === file);
    const exported = fileResult.exports.map((record) => record.exportedName);
    for (const name of names) {
      assert.ok(exported.includes(name), `${file} should export ${name}`);
    }
  }
});

test("imports are recorded, with packages marked external", () => {
  const parserResult = sourceResults.find((result) => result.file === "parser/Parser.js");
  const acornImport = parserResult.imports.find((record) => record.localName === "acorn");

  assert.equal(acornImport.source, "acorn");
  assert.equal(acornImport.importedName, "*");
  assert.equal(acornImport.external, true);

  const codeFlowResult = sourceResults.find((result) => result.file === "CodeFlow.js");
  const scannerImport = codeFlowResult.imports.find((record) => record.localName === "Scanner");

  assert.equal(scannerImport.source, "./scanner/Scanner.js");
  assert.equal(scannerImport.importedName, "default");
  assert.equal(scannerImport.external, false);
});

test("method calls we can see in the code are linked as certain", () => {
  // Each row reads: "<caller> calls <callee>".
  const expectedCalls = [
    [id("CodeFlow.js", "CodeFlow.buildGraph"), id("CodeFlow.js", "CodeFlow.linkCalls")],
    [id("linker/Linker.js", "Linker.linkCalls"), id("linker/Linker.js", "Linker.buildIndexes")],
    [ruleSetId("findFunctions"), ruleSetId("isFunctionNode")],
    [ruleSetId("findCalls"), ruleSetId("describeCallee")],
    [ruleSetId("findCalls"), ruleSetId("isFunctionNode")],
    [ruleSetId("findImports"), ruleSetId("findRequires")],
    // (findImports calls makeImport inside a .map(...) callback, so that call
    // belongs to the callback and not to findImports itself.)
    [ruleSetId("findRequires"), ruleSetId("requirePath")],
    [ruleSetId("findRequires"), ruleSetId("makeImport")],
    [ruleSetId("findExports"), ruleSetId("findNamedExports")],
    [ruleSetId("findExports"), ruleSetId("findDefaultExport")],
    [scannerId("Scanner.scan"), scannerId("visit")],
    [id("utils/Utilities.js", "Utilities.isFunctionNode"), id("utils/Utilities.js", "Utilities.isNode")],
  ];

  for (const [caller, callee] of expectedCalls) {
    const edge = findEdge(selfEdges, caller, callee);
    assert.ok(edge, `${caller} should call ${callee}`);
    assert.equal(edge.confidence, "certain");
  }
});

test("private methods like #visit are found as functions of their class", () => {
  const analyzerResult = sourceResults.find((result) => result.file === "analyzer/Analyzer.js");

  for (const name of ["#visit", "#saveFunction", "#ownerInside", "#makeId"]) {
    const found = analyzerResult.functions.find((fn) => fn.id === analyzerId(`Analyzer.${name}`));
    assert.ok(found, `${name} should be found`);
    assert.equal(found.owner, "Analyzer");
  }
});

test("calls to private methods (this.#name()) are linked as certain", () => {
  const expectedCalls = [
    [analyzerId("Analyzer.analyze"), analyzerId("Analyzer.#visit")],
    [analyzerId("Analyzer.#visit"), analyzerId("Analyzer.#saveFunction")],
    [analyzerId("Analyzer.#visit"), analyzerId("Analyzer.#ownerInside")],
    [analyzerId("Analyzer.#visit"), analyzerId("Analyzer.#visit")], // recursion
    [analyzerId("Analyzer.#saveFunction"), analyzerId("Analyzer.#makeId")],
  ];

  for (const [caller, callee] of expectedCalls) {
    const edge = findEdge(selfEdges, caller, callee);
    assert.ok(edge, `${caller} should call ${callee}`);
    assert.equal(edge.confidence, "certain");
  }
});

test("Analyzer.#visit is linked to the RuleSet methods it uses, as guesses", () => {
  // `this.#rules.findFunctions(...)` goes through a stored object, so it is a guess.
  const edge = findEdge(selfEdges, analyzerId("Analyzer.#visit"), ruleSetId("findFunctions"));

  assert.ok(edge, "the guessed link should exist");
  assert.equal(edge.confidence, "guess");
});

test("a recursive function calls itself", () => {
  // Scanner's `visit` walks folders by calling itself for every sub-folder.
  assert.ok(findEdge(selfEdges, scannerId("visit"), scannerId("visit")));
});

test("every edge says which file the call was written in", () => {
  for (const edge of selfEdges) {
    assert.ok(edge.file, "edge should have a file");
    assert.ok(edge.caller.startsWith(`${edge.file}#`), `${edge.caller} should be in ${edge.file}`);
  }
});

test("a call through a stored object is a guess, never certain", () => {
  // CodeFlow.linkCalls runs `this.#linker.linkCalls(...)`. We cannot be sure
  // `this.#linker` is a Linker, so the link is only a guess.
  const edge = findEdge(
    selfEdges,
    id("CodeFlow.js", "CodeFlow.linkCalls"),
    id("linker/Linker.js", "Linker.linkCalls"),
  );

  assert.ok(edge, "the guessed link should exist");
  assert.equal(edge.confidence, "guess");
});

test("graph: getCallees follows calls down to the requested depth", () => {
  // findImports -> findRequires -> requirePath
  const directOnly = graph.getCallees(ruleSetId("findImports"), 1).map((edge) => edge.callee);
  assert.ok(directOnly.includes(ruleSetId("findRequires")));
  assert.ok(!directOnly.includes(ruleSetId("requirePath")));

  const twoLevels = graph.getCallees(ruleSetId("findImports"), 2);
  const requirePathEdge = twoLevels.find((edge) => edge.callee === ruleSetId("requirePath"));
  assert.equal(requirePathEdge.depth, 2);
});

test("graph: getCallers finds who uses a helper", () => {
  const callers = graph.getCallers(ruleSetId("isFunctionNode"), 1).map((edge) => edge.caller);

  assert.ok(callers.includes(ruleSetId("findFunctions")));
  assert.ok(callers.includes(ruleSetId("findCalls")));
});

test("graph: recursion does not loop forever", () => {
  const callees = graph.getCallees(scannerId("visit"), 10);

  assert.ok(callees.length > 0);
  assert.ok(callees.length < 10, "the visit -> visit edge should not be repeated");
});

test("graph: findPath returns the shortest chain of calls", () => {
  assert.deepEqual(
    graph.findPath(scannerId("Scanner.scan"), scannerId("visit")),
    [scannerId("Scanner.scan"), scannerId("visit")],
  );
  assert.deepEqual(
    graph.findPath(ruleSetId("findImports"), ruleSetId("requirePath")),
    [ruleSetId("findImports"), ruleSetId("findRequires"), ruleSetId("requirePath")],
  );
});

test("graph: findPath returns null when nothing connects the two functions", () => {
  assert.equal(
    graph.findPath(id("utils/Utilities.js", "Utilities.isNode"), id("CodeFlow.js", "CodeFlow.analyze")),
    null,
  );
});

// ---------------------------------------------------------------------------
// Known gaps. The code DOES contain these relationships, but CodeFlow cannot
// see them yet. They are marked `todo`, so they are reported but do not fail
// the test run. When a gap is fixed, remove `todo` and the test must pass.
// ---------------------------------------------------------------------------

test("`new Scanner()` in CodeFlow is linked to the Scanner class", {
  todo: "classes are not indexed, only functions",
}, () => {
  const constructorId = id("CodeFlow.js", "CodeFlow.constructor");
  const callees = graph.getCallees(constructorId, 1).map((edge) => edge.callee);

  assert.ok(callees.some((callee) => callee.startsWith("scanner/Scanner.js#")));
});

// ---------------------------------------------------------------------------
// 5. HTTP API
//
// The app runs on a free local port and is called with Node's built-in fetch.
// All tests below share ONE app, and the app remembers the last project it
// analyzed. So the order matters: first the "nothing analyzed yet" checks, then
// the analyze checks, then the endpoints that read the analyzed project.
// ---------------------------------------------------------------------------

// Start the app on any free port (port 0 = let the system choose).
// (allowedRoots: [] means "no folder limit", so the tests do not depend on a local .env file.)
const apiServer = await new Promise((resolve) => {
  const started = createApp({ allowedRoots: [] }).listen(0, () => resolve(started));
});
const apiBase = `http://127.0.0.1:${apiServer.address().port}`;

// Stop the server when the tests finish, or the test run would never end.
after(() => apiServer.close());

// Call the API and return { status, body } (body is the parsed JSON).
async function callApi(urlPath, jsonBody) {
  const options = jsonBody === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jsonBody),
  };
  const response = await fetch(`${apiBase}${urlPath}`, options);
  return { status: response.status, body: await response.json() };
}

// Function ids contain "#", which must be written as %23 inside a URL.
const functionUrl = (functionId) => `/api/function?id=${encodeURIComponent(functionId)}`;

test("api: reading endpoints answer 409 before any project is analyzed", async () => {
  for (const url of ["/api/functions", functionUrl("b.js#init")]) {
    const { status, body } = await callApi(url);
    assert.equal(status, 409, url);
    assert.equal(body.error, "Analyze a project first");
  }
});

test("api: analyze rejects a missing, non-text, missing-folder or file path with 400", async () => {
  const badPaths = [
    {},
    { path: 5 },
    { path: "" },
    { path: fixture("does-not-exist") },
    { path: path.join(fixtureRoot, "b.js") }, // a file, not a folder
  ];

  for (const badBody of badPaths) {
    const { status, body } = await callApi("/api/analyze", badBody);
    assert.equal(status, 400, JSON.stringify(badBody));
    assert.equal(typeof body.error, "string");
  }
});

test("api: analyze a project returns counts", async () => {
  const { status, body } = await callApi("/api/analyze", { path: fixtureRoot });

  assert.equal(status, 200);
  assert.equal(body.files, 3);
  assert.equal(body.functions, 6); // b.js: 3, c.js: 2, main.js: 1
  assert.deepEqual(body.errors, []);
});

test("api: functions lists everything, and search finds functions by name", async () => {
  const all = await callApi("/api/functions");
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 6);

  const search = await callApi("/api/functions?search=INIT"); // not case sensitive
  assert.equal(search.body.total, 2);
  assert.deepEqual(search.body.items.map((fn) => fn.id).sort(), ["b.js#init", "c.js#init"]);

  const noMatch = await callApi("/api/functions?search=zzz");
  assert.deepEqual(noMatch.body, { total: 0, items: [] });
});

test("api: functions items have the file and line range", async () => {
  const { body } = await callApi("/api/functions?search=Svc.run");

  assert.equal(body.total, 1);
  assert.deepEqual(body.items[0], {
    id: "b.js#Svc.run",
    name: "run",
    owner: "Svc",
    kind: "method",
    line: 13,
    endLine: 15,
    file: "b.js",
  });
});

test("api: functions can be filtered by file and paged with limit and offset", async () => {
  const byFile = await callApi("/api/functions?file=c.js");
  assert.equal(byFile.body.total, 2);
  assert.ok(byFile.body.items.every((fn) => fn.file === "c.js"));

  // `total` is the count before paging, `items` is only one page.
  const firstPage = await callApi("/api/functions?file=c.js&limit=1");
  const secondPage = await callApi("/api/functions?file=c.js&limit=1&offset=1");
  assert.equal(firstPage.body.total, 2);
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(secondPage.body.items.length, 1);
  assert.notEqual(firstPage.body.items[0].id, secondPage.body.items[0].id);
});

test("api: bad limit and offset values fall back to the defaults", async () => {
  const { status, body } = await callApi("/api/functions?limit=abc&offset=-5");

  assert.equal(status, 200);
  assert.equal(body.items.length, 6);
});

test("api: function returns the details and the source code", async () => {
  const init = await callApi(functionUrl("b.js#init"));
  assert.equal(init.status, 200);
  assert.equal(init.body.name, "init");
  assert.equal(init.body.file, "b.js");
  assert.equal(init.body.source, "export function init() {\n  return helper();\n}");

  // A method: only its own lines are returned, not the whole class.
  const run = await callApi(functionUrl("b.js#Svc.run"));
  assert.equal(run.body.owner, "Svc");
  assert.match(run.body.source, /^ {2}run\(\) \{/);
  assert.ok(!run.body.source.includes("class Svc"));
});

test("api: function answers 404 for an unknown id and 400 without an id", async () => {
  const unknown = await callApi(functionUrl("nope.js#nothing"));
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, "Function not found");

  const missing = await callApi("/api/function");
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, "id is required");
});

test("api: callees lists what a function calls, with the depth of each call", async () => {
  const { status, body } = await callApi(`/api/callees?id=${encodeURIComponent("main.js#main")}`);

  assert.equal(status, 200);
  assert.equal(body.id, "main.js#main");
  assert.equal(body.depth, 1);
  assert.deepEqual(body.items.map((edge) => edge.callee).sort(), ["c.js#helper", "c.js#init"]);
  for (const edge of body.items) {
    assert.equal(edge.confidence, "certain");
    assert.equal(edge.file, "main.js");
    assert.equal(edge.depth, 1);
  }
});

test("api: callers lists who calls a function", async () => {
  const { status, body } = await callApi(`/api/callers?id=${encodeURIComponent("c.js#init")}`);

  assert.equal(status, 200);
  assert.deepEqual(body.items.map((edge) => edge.caller), ["main.js#main"]);
});

test("api: depth is capped, and a bad depth falls back to 1", async () => {
  const big = await callApi(`/api/callees?id=${encodeURIComponent("main.js#main")}&depth=99`);
  assert.equal(big.body.depth, 5);

  const bad = await callApi(`/api/callees?id=${encodeURIComponent("main.js#main")}&depth=abc`);
  assert.equal(bad.body.depth, 1);
});

test("api: path returns the shortest chain, or null when there is none", async () => {
  const from = encodeURIComponent("b.js#init");
  const to = encodeURIComponent("b.js#helper");
  const found = await callApi(`/api/path?from=${from}&to=${to}`);
  assert.equal(found.status, 200);
  assert.deepEqual(found.body.path, ["b.js#init", "b.js#helper"]);

  // c.js#init calls nothing, so it cannot reach main.
  const none = await callApi(`/api/path?from=${encodeURIComponent("c.js#init")}&to=${encodeURIComponent("main.js#main")}`);
  assert.equal(none.status, 200);
  assert.equal(none.body.path, null);
});

test("api: callees, callers and path check their input", async () => {
  const known = encodeURIComponent("b.js#init");

  for (const url of ["/api/callees", "/api/callers"]) {
    assert.equal((await callApi(url)).status, 400, `${url} without id`);
    assert.equal((await callApi(`${url}?id=nope`)).status, 404, `${url} unknown id`);
  }

  assert.equal((await callApi(`/api/path?from=${known}`)).status, 400);
  assert.equal((await callApi(`/api/path?from=${known}&to=nope`)).status, 404);
  assert.equal((await callApi(`/api/path?from=nope&to=${known}`)).status, 404);
});

test("api: callees, callers and path answer 409 before a project is analyzed", async () => {
  // A separate app that has not analyzed anything.
  const freshServer = await new Promise((resolve) => {
    const started = createApp().listen(0, () => resolve(started));
  });
  const freshBase = `http://127.0.0.1:${freshServer.address().port}`;

  try {
    for (const url of ["/api/callees?id=x", "/api/callers?id=x", "/api/path?from=x&to=y"]) {
      const response = await fetch(`${freshBase}${url}`);
      assert.equal(response.status, 409, url);
    }
  } finally {
    freshServer.close();
  }
});

// Start a separate app with its own settings. Returns { base, close }.
async function startApi(options) {
  const server = await new Promise((resolve) => {
    const started = createApp(options).listen(0, () => resolve(started));
  });
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

// POST /api/analyze on an app made by startApi, and return the status code.
async function analyzeStatus(base, folder) {
  const response = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: folder }),
  });
  return response.status;
}

test("api: only the allowed web page origins may call the API from a browser", async () => {
  const api = await startApi({ allowedRoots: [], corsOrigins: ["http://localhost:5173"] });

  try {
    // An allowed origin gets the CORS headers.
    const allowed = await fetch(`${api.base}/api/functions`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");

    // Any other origin gets none, so the browser blocks the answer.
    const stranger = await fetch(`${api.base}/api/functions`, {
      headers: { Origin: "http://evil.example" },
    });
    assert.equal(stranger.headers.get("access-control-allow-origin"), null);

    // The browser's "preflight" question before a JSON POST is answered with 204.
    const preflight = await fetch(`${api.base}/api/analyze`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
    assert.match(preflight.headers.get("access-control-allow-headers"), /Content-Type/);
  } finally {
    api.close();
  }
});

test("api: analyze only reads folders inside the allowed roots", async () => {
  const api = await startApi({ allowedRoots: [fixture("project")] });

  try {
    // The root itself is fine.
    assert.equal(await analyzeStatus(api.base, fixture("project")), 200);

    // A sibling folder is not allowed.
    assert.equal(await analyzeStatus(api.base, fixture("calls")), 403);

    // Using ".." to climb out of the root is caught too.
    const sneaky = path.join(fixture("project"), "..", "calls");
    assert.equal(await analyzeStatus(api.base, sneaky), 403);

    // A folder far away is not allowed either.
    assert.equal(await analyzeStatus(api.base, backendRoot), 403);
  } finally {
    api.close();
  }
});

test("api: folders below an allowed root are allowed", async () => {
  // fixtures/ holds project, calls, broken... so each one is below this root.
  const api = await startApi({ allowedRoots: [path.join(testFolder, "fixtures")] });

  try {
    assert.equal(await analyzeStatus(api.base, fixture("calls")), 200);
    assert.equal(await analyzeStatus(api.base, fixture("project")), 200);
    assert.equal(await analyzeStatus(api.base, testFolder), 403); // the parent is not
  } finally {
    api.close();
  }
});

test("api: analyze reports files that fail to parse, and replaces the old project", async () => {
  // Last on purpose: this replaces the project the earlier tests read.
  const { status, body } = await callApi("/api/analyze", { path: fixture("broken") });

  assert.equal(status, 200);
  assert.equal(body.files, 2);
  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].file, "bad.js");

  const { body: list } = await callApi("/api/functions");
  assert.deepEqual(list.items.map((fn) => fn.id), ["ok.js#fine"]);
});

// ---------------------------------------------------------------------------
// 6. GitHub links
//
// No test touches the internet. Link parsing is plain text work, the download
// is tested against a small git repository created in a temp folder, and the
// API tests use a fake downloader.
// ---------------------------------------------------------------------------

const git = promisify(execFile);

test("github: links are understood, and anything else is refused", () => {
  const cloner = new RepoCloner();

  const accepted = [
    ["https://github.com/octo/demo", { owner: "octo", name: "demo", ref: null, display: "octo/demo" }],
    ["github.com/octo/demo", { owner: "octo", name: "demo", ref: null, display: "octo/demo" }],
    ["  HTTPS://www.GitHub.com/octo/demo.git/  ", { owner: "octo", name: "demo", ref: null, display: "octo/demo" }],
    ["https://github.com/octo/demo?tab=readme#top", { owner: "octo", name: "demo", ref: null, display: "octo/demo" }],
    ["https://github.com/octo/demo/tree/main", { owner: "octo", name: "demo", ref: "main", display: "octo/demo@main" }],
    ["https://github.com/octo/demo/tree/feature/login", { owner: "octo", name: "demo", ref: "feature/login", display: "octo/demo@feature/login" }],
    ["https://github.com/octo/my.repo_1-x", { owner: "octo", name: "my.repo_1-x", ref: null, display: "octo/my.repo_1-x" }],
  ];
  for (const [link, expected] of accepted) {
    assert.deepEqual(cloner.parse(link), expected, link);
  }

  const refused = [
    "",
    "not a link",
    "https://example.com/octo/demo", // not github.com
    "https://github.com.evil.com/octo/demo", // looks like github.com but is not
    "https://evil.com/github.com/octo/demo",
    "git@github.com:octo/demo.git", // ssh links are not supported
    "https://github.com/octo", // no repository
    "https://github.com/octo/demo/issues", // not a repository root or branch link
    "https://github.com/octo/demo/tree", // no branch name
    "https://github.com/octo/de mo",
    "https://github.com/octo/demo;touch-x",
    "https://github.com/../demo",
    "https://github.com/octo/demo/tree/--upload-pack=evil", // would look like a git option
    "https://github.com/octo/demo/tree/a..b",
    "https://github.com/octo/demo/tree/x.lock",
    5,
    null,
    undefined,
  ];
  for (const link of refused) {
    assert.equal(cloner.parse(link), null, String(link));
  }
});

// Make a small git repository in a temp folder, with a main branch and a "dev" branch.
async function makeLocalRepo(root) {
  const repo = path.join(root, "source");
  await fs.mkdir(repo, { recursive: true });
  const run = (...args) => git(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: repo },
  );

  await run("init", "--quiet", "--initial-branch=main");
  await fs.writeFile(path.join(repo, "a.js"), "export function fromMain() {}\n");
  await run("add", ".");
  await run("commit", "--quiet", "-m", "first");
  await run("checkout", "--quiet", "-b", "dev");
  await fs.writeFile(path.join(repo, "b.js"), "export function fromDev() {}\n");
  await run("add", ".");
  await run("commit", "--quiet", "-m", "dev");
  await run("checkout", "--quiet", "main");
  return repo;
}

test("github: a repository is downloaded into its own folder and removed again", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeflow-test-"));

  try {
    const source = await makeLocalRepo(root);
    // The downloader normally uses github.com. Here it clones the local repository.
    const cloner = new RepoCloner({
      baseFolder: path.join(root, "downloads"),
      cloneUrlFor: () => pathToFileURL(source).href,
    });

    // Default branch: only main's files.
    const main = await cloner.clone("https://github.com/octo/demo");
    assert.equal(main.display, "octo/demo");
    assert.deepEqual((await fs.readdir(main.folder)).filter((name) => name.endsWith(".js")), ["a.js"]);

    // A /tree/<branch> link downloads that branch.
    const dev = await cloner.clone("https://github.com/octo/demo/tree/dev");
    assert.ok((await fs.readdir(dev.folder)).includes("b.js"));
    assert.notEqual(main.folder, dev.folder);

    // The downloaded files can be analyzed like any folder.
    const { files } = await new CodeFlow().analyze(dev.folder);
    assert.deepEqual(files, ["a.js", "b.js"]);

    // remove() deletes the download.
    await cloner.remove(main.folder);
    await assert.rejects(fs.stat(main.folder));

    // ...but refuses to touch a folder it did not create.
    const outside = path.join(root, "keep-me");
    await fs.mkdir(path.join(outside, "inner"), { recursive: true });
    await cloner.remove(path.join(outside, "inner"));
    assert.ok((await fs.stat(path.join(outside, "inner"))).isDirectory());
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

test("github: a failed download throws a RepoError and leaves no folder behind", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeflow-test-"));

  try {
    const downloads = path.join(root, "downloads");
    const cloner = new RepoCloner({
      baseFolder: downloads,
      cloneUrlFor: () => pathToFileURL(path.join(root, "does-not-exist")).href,
    });

    await assert.rejects(
      cloner.clone("https://github.com/octo/demo"),
      (error) => error instanceof RepoError && error.status === 502,
    );
    assert.deepEqual(await fs.readdir(downloads), []);

    // A link that is not a github link is refused before anything is downloaded.
    await assert.rejects(
      cloner.clone("https://example.com/octo/demo"),
      (error) => error instanceof RepoError && error.status === 400,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

// A downloader that does not use the internet: every "download" is the fixture project.
function fakeCloner({ failWith } = {}) {
  const realParser = new RepoCloner();
  const removed = [];
  return {
    removed,
    parse: (link) => realParser.parse(link),
    clone: async () => {
      if (failWith) throw failWith;
      return { folder: fixtureRoot, display: "octo/demo" };
    },
    remove: async (folder) => {
      removed.push(folder);
    },
  };
}

async function postAnalyze(base, body) {
  const response = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("api: a github link is downloaded and analyzed like a folder", async () => {
  const api = await startApi({ allowedRoots: [], cloner: fakeCloner() });

  try {
    const analyzed = await postAnalyze(api.base, { repo: "https://github.com/octo/demo" });
    assert.equal(analyzed.status, 200);
    assert.deepEqual(analyzed.body, { files: 3, functions: 6, errors: [], repo: "octo/demo" });

    // The other endpoints now work on the downloaded project.
    const list = await (await fetch(`${api.base}/api/functions?search=main`)).json();
    assert.deepEqual(list.items.map((fn) => fn.id), ["main.js#main"]);
  } finally {
    api.close();
  }
});

test("api: a downloaded project is deleted when another project replaces it", async () => {
  const cloner = fakeCloner();
  const api = await startApi({ allowedRoots: [], cloner });

  try {
    await postAnalyze(api.base, { repo: "https://github.com/octo/demo" });
    assert.deepEqual(cloner.removed, []); // still in use

    await postAnalyze(api.base, { path: fixture("calls") });
    assert.deepEqual(cloner.removed, [fixtureRoot]); // the old download was cleaned up

    // A normal folder is never "removed".
    await postAnalyze(api.base, { path: fixture("project") });
    assert.deepEqual(cloner.removed, [fixtureRoot]);
  } finally {
    api.close();
  }
});

test("api: bad github links are refused with 400", async () => {
  const api = await startApi({ allowedRoots: [], cloner: fakeCloner() });

  try {
    for (const repo of ["https://example.com/octo/demo", "https://github.com/octo", "nonsense", "", 5, null]) {
      const { status, body } = await postAnalyze(api.base, { repo });
      assert.equal(status, 400, String(repo));
      assert.match(body.error, /github\.com\/owner\/name/);
    }
  } finally {
    api.close();
  }
});

test("api: download problems are reported with the right status", async () => {
  const cases = [
    [new RepoError("repository (or branch) not found. private repositories are not supported", 404), 404],
    [new RepoError("downloading took longer than 60 seconds", 504), 504],
    [new Error("something unexpected"), 500],
  ];

  for (const [failWith, expectedStatus] of cases) {
    const api = await startApi({ allowedRoots: [], cloner: fakeCloner({ failWith }) });
    try {
      const { status, body } = await postAnalyze(api.base, { repo: "https://github.com/octo/demo" });
      assert.equal(status, expectedStatus);
      assert.equal(typeof body.error, "string");
      // An unexpected error must not leak its message.
      if (expectedStatus === 500) assert.equal(body.error, "Something went wrong");
    } finally {
      api.close();
    }
  }
});

test("api: github downloads can be turned off", async () => {
  const api = await startApi({ allowedRoots: [], allowGithub: false, cloner: fakeCloner() });

  try {
    const { status } = await postAnalyze(api.base, { repo: "https://github.com/octo/demo" });
    assert.equal(status, 403);

    // Folders still work.
    assert.equal((await postAnalyze(api.base, { path: fixtureRoot })).status, 200);
  } finally {
    api.close();
  }
});
