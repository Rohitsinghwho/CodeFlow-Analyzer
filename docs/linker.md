# Module linker

The linker resolves local module specifiers to files discovered by the
scanner. Its resolver is implemented in
[`backend/linker/resolveModule.js`](../backend/linker/resolveModule.js).

## `resolveModule(fromFile, source, fileSet)`

`resolveModule` accepts the path of the file containing an import, the module
specifier, and a `Set` containing the project-relative paths found by the
scanner:

```js
import resolveModule from "../backend/linker/resolveModule.js";

const fileSet = new Set([
  "src/index.js",
  "src/utils/readFile.js",
  "src/config/index.js",
]);

resolveModule("src/index.js", "./utils/readFile", fileSet);
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

resolveModule("src/main.js", "./helpers", fileSet);
// "src/helpers.mjs"

resolveModule("src/main.js", "./config", fileSet);
// "src/config/index.js"

resolveModule("src/main.js", "express", fileSet);
// null

resolveModule("src/main.js", "./missing", fileSet);
// null
```

The resolver only identifies the target file. It does not parse the target,
resolve its exports, or connect imported names to exported declarations.