# Scanner

The scanner is implemented by the [`Scanner`](../backend/scanner/Scanner.js)
class and exported by [`backend/scanner/index.js`](../backend/scanner/index.js).
It recursively
walks a source directory and returns the JavaScript files that should be
processed by CodeFlow.

## `Scanner.scan(dirPath, rootPath)`

`scan` returns a promise that resolves to a sorted array of relative file
paths.

| Parameter | Description |
|---|---|
| `dirPath` | The directory where the recursive scan starts. |
| `rootPath` | The base directory used to calculate paths in the result. |

For a scan of a complete project, `dirPath` and `rootPath` can be the same
directory. If `rootPath` is a parent directory, the returned paths are
relative to that parent instead.

## Scan behavior

The scanner:

1. Reads each directory using `fs.readdir` with directory-entry metadata.
2. Recursively visits directories that are not ignored.
3. Skips ignored files and directories before attempting further processing.
4. Checks file extensions case-insensitively.
5. Converts matching paths to use `/` separators, including on Windows.
6. Sorts the complete result once before returning it.

Only the following JavaScript extensions are included:

- `.js`
- `.mjs`
- `.cjs`

## Ignored names

Entries with any of the following names are skipped:

- `node_modules`
- `.git`
- `dist`
- `build`
- `coverage`
- `.gitignore`
- `test`

The ignored-name check applies to both directories and files. For example, a
directory named `node_modules` is not traversed, and a file named `.gitignore`
is not returned.

## Return value

The returned array contains normalized paths relative to `rootPath`, sorted in
ascending order. For example:

```js
[
  "src/index.js",
  "src/parser/parse.mjs",
  "src/utils/helper.cjs"
]
```

The scanner does not read or parse the contents of the files. It only locates
the files; parsing is handled by later parts of the backend.

## Why the scanner uses depth-first search

The scanner uses **depth-first search (DFS)** because a project directory is
naturally represented as a tree: directories are branches and files are
leaves. DFS follows one directory branch as far as possible before returning
to the parent directory and visiting the next branch.

This approach fits the scanner because each directory can be handled
independently and recursively. It also lets the scanner skip an ignored
directory before entering it, so entries such as `node_modules` are never
traversed. The scanner does not need breadth-by-breadth ordering; it only
needs to visit every relevant entry and return the final list in sorted order.

A normal recursive DFS over a tree looks like this:

```js
function depthFirstSearch(node) {
  visit(node);

  for (const child of node.children) {
    depthFirstSearch(child);
  }
}
```

In `scanner.js`, `recurse` is the DFS function and each directory entry is a
child of the current directory:

```js
async function recurse(currentDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  let result = [];

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      result = result.concat(await recurse(fullPath));
    } else if (entry.isFile() && EXTENSIONS.has(
      path.extname(entry.name).toLowerCase()
    )) {
      result.push(path.relative(rootPath, fullPath));
    }
  }

  return result;
}
```

For example, when the scanner encounters `src`, it recursively scans `src`
and all of its non-ignored subdirectories before continuing with the next
entry in the parent directory. The recursive calls collect matching JavaScript
files, and `listJsFiles` sorts the complete collection once after the DFS
finishes.

## Errors

Filesystem errors from `fs.readdir`, such as a missing directory or an
inaccessible directory, are not swallowed by the scanner. The returned
promise rejects with the original error so that the caller can handle or log
it.

## Documentation maintenance

Any future updates to `backend/scanner/scanner.js` should also be documented
in this file so that the scanner's behavior and implementation notes remain
up to date.