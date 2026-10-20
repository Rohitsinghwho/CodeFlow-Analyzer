import { visit } from "../backend/analyzer/index.js";
import { Parse } from "../backend/parser/index.js";
import { listJsFiles } from "../backend/utils/index.js";
import path from "node:path";
const rootPath = "D:/JavaScript-Projects";
const sourcePath = "D:/JavaScript-Projects/url-shortner/";

const files = await listJsFiles(sourcePath, rootPath);

console.table(
  files.map((file, index) => ({
    no: index + 1,
    file,
  })),
);

const analysisRows = [];
const allFunctions = [];

for (const [index, relativePath] of files.entries()) {
  const fullPath = path.join(rootPath, relativePath);
  const parsedResult = await Parse(fullPath);

  if (!parsedResult?.ast) {
    analysisRows.push({
      no: index + 1,
      file: relativePath,
      status: "FAILED",
      functions: 0,
      error: parsedResult?.error ?? "Parse failed",
    });
    continue;
  }

  const functions = visit(parsedResult.ast, relativePath);
  allFunctions.push(...functions);
  analysisRows.push({
    no: index + 1,
    file: relativePath,
    status: "OK",
    functions: functions.length,
    error: "",
  });
}

console.log("Files processed:\n");
console.table(analysisRows);

console.log("Functions found:\n");
console.table(allFunctions);

const uniqueIds = new Set(allFunctions.map(({ id }) => id));

if (uniqueIds.size === allFunctions.length) {
  console.log("All function IDs are unique.");
} else {
  const idCounts = new Map();
  for (const { id } of allFunctions) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  const duplicateIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));

  console.log("Duplicate function IDs found:\n");
  console.table(duplicateIds);
}