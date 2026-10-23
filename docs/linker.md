# Module linker

The linker resolves local module specifiers, builds file indexes, and resolves
exports through
[`backend/linker/Linker.js`](../backend/linker/Linker.js).

For isolated usage, create a `Linker` with its own `IndexMaps` instance:

```js
import { IndexMaps } from "../backend/indexes/IndexMaps.js";
import { Linker } from "../backend/linker/Linker.js";

const linker = new Linker(new IndexMaps());
```

The complete project pipeline is composed by
[`CodeFlow`](../backend/CodeFlow.js). It creates and coordinates the scanner,
parser, analyzer, and linker classes:

```js
import CodeFlow from "../backend/CodeFlow.js";

const codeFlow = new CodeFlow();
const result = await codeFlow.analyze(projectRoot);
const functionId = codeFlow.resolveExport("src/utils.js", "formatDate");
```

## `Linker.resolveModule(fromFile, source, fileSet)`

`resolveModule` accepts the path of the file containing an import, the module
specifier, and a `Set` containing the project-relative paths found by the
scanner:

```js
import linker from "../backend/linker/Linker.js";

const fileSet = new Set([
  "src/index.js",
  "src/utils/readFile.js",
  "src/config/index.js",
]);

linker.resolveModule("src/index.js", "./utils/readFile", fileSet);
// "src/utils/readFile.js"
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `fromFile` | `string` | Normalized project-relative path of the importing file. |
| `source` | `string` | Import or `require` module specifier. |
| `fileSet` | `Set<string>` | Project-relative JavaScript files discovered by the scanner. |

### Resolution behavior

Only relative sources are resolved. A source that does not begin with `.`,
such as `"express"` or `"node:path"`, is treated as an external package and
returns `null`.

For a relative source, the resolver:

1. Uses the directory containing `fromFile` as the base directory.
2. Joins that directory with `source` using POSIX-style project paths.
3. Checks for an exact file path.
4. Checks the path with each supported extension:
   - `.js`
   - `.mjs`
   - `.cjs`
5. Checks for `index.js` inside the resolved directory.

The first matching path is returned. If no path matches, the resolver returns
`null`.

For example:

```js
const fileSet = new Set([
  "src/main.js",
  "src/helpers.mjs",
  "src/config/index.js",
]);

linker.resolveModule("src/main.js", "./helpers", fileSet);
// "src/helpers.mjs"

linker.resolveModule("src/main.js", "./config", fileSet);
// "src/config/index.js"

linker.resolveModule("src/main.js", "express", fileSet);
// null

linker.resolveModule("src/main.js", "./missing", fileSet);
// null
```

The resolver only identifies the target file. It does not parse the target,
resolve its exports, or connect imported names to exported declarations.

## `Linker.buildIndexes(fileResults)`

[`backend/linker/Linker.js`](../backend/linker/Linker.js) builds two reusable,
per-file lookup indexes from the analyzer's `fileResults`
array. The maps are encapsulated by the [`IndexMaps`](../backend/indexes/IndexMaps.js)
class. Its singleton exposes operations such as `clear`, `setExports`,
`setFunctions`, `getExport`, and `getFunction`, so callers do not depend on
the internal map layout:

```js
import indexMaps from "../backend/indexes/IndexMaps.js";

indexMaps.getExport("src/utils.js", "formatDate");
indexMaps.getFunction("src/utils.js", "formatDate");
```

The builder and resolver use this same singleton, giving the maps one
centralized implementation and keeping their representation private:

- `exportsByFile`: `Map<filePath, Map<exportedName, exportRecord>>`
- `functionsByFile`: `Map<filePath, Map<name, functionRecord>>`

The outer map selects a file. The inner map then provides a fast lookup by
export or function name. Keeping the file path as the first key prevents
same-named declarations in different files from overwriting one another.

For example, given these analyzer results:

```js
const fileResults = [
  {
    file: "src/utils.js",
    exports: [
      { exportedName: "formatDate", localName: "formatDate" },
    ],
    functions: [
      {
        name: "formatDate",
        owner: null,
        kind: "function",
        id: "src/utils.js#formatDate",
      },
      {
        name: "format",
        owner: "DateFormatter",
        kind: "method",
        id: "src/utils.js#DateFormatter.format",
      },
    ],
  },
];
```

Internally, the class keeps the following structure:

```js
exportsByFile = new Map([
  [
    "src/utils.js",
    new Map([
      [
        "formatDate",
        { exportedName: "formatDate", localName: "formatDate" },
      ],
    ]),
  ],
]);

functionsByFile = new Map([
  [
    "src/utils.js",
    new Map([
      [
        "formatDate",
        {
          name: "formatDate",
          owner: null,
          kind: "function",
          id: "src/utils.js#formatDate",
        },
      ],
    ]),
  ],
]);
```

The class method `format` is not included in `functionsByFile` because only
records with `owner: null` are indexed. If duplicate top-level functions have
the same name in one file, the first record is retained.

The maps are private implementation details. After calling
`linker.buildIndexes(fileResults)`, callers use the class API:

```js
const exportRecord = indexMaps.getExport("src/utils.js", "formatDate");

const functionRecord = indexMaps.getFunction("src/utils.js", "formatDate");
```

## Class-based project architecture

The backend exposes one class per subsystem through
[`backend/index.js`](../backend/index.js):

| Class | Responsibility |
|---|---|
| `Scanner` | Finds supported source files below a root directory. |
| `Parser` | Reads a source file and creates its AST. |
| `Analyzer` | Visits an AST and produces functions, calls, imports, and exports. |
| `RuleSet` | Supplies analyzer rules without exposing rule-table storage. |
| `IndexMaps` | Owns the shared export and function indexes. |
| `Linker` | Builds indexes and resolves modules and exports. |
| `CodeFlow` | Orchestrates the complete scanner → parser → analyzer → linker pipeline. |
| `Utilities` | Provides shared AST and file operations. |

`CodeFlow` accepts subsystem instances through its constructor, making a
single implementation easy to replace or test:

```js
import CodeFlow from "../backend/CodeFlow.js";
import { Linker } from "../backend/linker/Linker.js";

const codeFlow = new CodeFlow({ linker: new Linker() });
const analysis = await codeFlow.analyze(projectRoot);
```