import path from "path";
import { Parse } from "./parser/index.js";
import { visit } from "./analyzer/index.js";
import listJsFiles from "./scanner/scanner.js";
import resolveModule from "./linker/resolveModule.js";

const rootPath = "D:/JavaScript-Projects";
const sourcePath = "D:/JavaScript-Projects/url-shortner/";

const files = await listJsFiles(sourcePath, rootPath);

const fileResults = [];
const rows = [];

for (const [index, relativePath] of files.entries()) {
  const fullPath = path.join(rootPath, relativePath);
  const parsed = await Parse(fullPath);

  if (!parsed?.ast) {
    rows.push({ no: index + 1, file: relativePath, status: "Failed" });
    continue;
  }

  const { functions, calls, imports, exports } = visit(parsed.ast, relativePath);
  fileResults.push({ file: relativePath, functions, calls, imports, exports });
  rows.push({
    no: index + 1,
    file: relativePath,
    status: "Ok",
    functions: functions.length,
    calls: calls.length,
    imports: imports.length,
    exports: exports.length,
  });
}

console.table(rows);

// ---- second test: unresolved local imports ----
const fileSet = new Set(fileResults.map((r) => r.file));
const unresolved = [];
let checked = 0;

for (const { file, imports } of fileResults) {
  for (const imp of imports) {
    if (imp.external) continue;
    checked++;
    if (resolveModule(file, imp.source, fileSet) === null) {
      unresolved.push({ file, source: imp.source, name: imp.localName });
    }
  }
}

console.log(`Local imports checked: ${checked}`);
console.log(`Unresolved local imports: ${unresolved.length}`);
console.table(unresolved);