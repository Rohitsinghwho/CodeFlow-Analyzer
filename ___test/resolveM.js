import resolveModule from '../backend/linker/resolveModule.js';

const fileSet = new Set([
  "index.js",
  "src/index.js",
  "src/routes/url.js",
  "src/controllers/url.js",
  "src/utils/index.js",
  "src/utils/hash.js",
  "src/config/db.mjs",
]);

// [fromFile, source, expected]
const cases = [
  ["src/routes/url.js", "../controllers/url.js", "src/controllers/url.js"],
  ["src/routes/url.js", "../controllers/url", "src/controllers/url.js"],
  ["src/routes/url.js", "../utils", "src/utils/index.js"],
  ["src/routes/url.js", "../utils/hash", "src/utils/hash.js"],
  ["src/routes/url.js", "../config/db", "src/config/db.mjs"],
  ["src/routes/url.js", "..", "src/index.js"],
  ["src/index.js", "..", "index.js"],
  ["src/index.js", "./routes/url", "src/routes/url.js"],
  ["src/routes/url.js", "express", null],
  ["src/routes/url.js", "../missing.js", null],
  ["src/routes/url.js", "../../../outside.js", null],
];

let failed = 0;

const rows = cases.map(([fromFile, source, expected], i) => {
  const actual = resolveModule(fromFile, source, fileSet);
  const pass = actual === expected;
  if (!pass) failed++;
  return {
    no: i + 1,
    from: fromFile,
    source,
    expected,
    actual,
    result: pass ? "PASS" : "FAIL",
  };
});

console.table(rows);
console.log(
  failed === 0
    ? `All ${cases.length} tests passed.`
    : `${failed} of ${cases.length} tests FAILED.`,
);