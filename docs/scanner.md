# Scanner

`Scanner` (`backend/scanner/Scanner.js`) lists the JavaScript files of a project
folder. It is the first step of the pipeline:
`Scanner -> Parser -> Analyzer -> Linker`.

## `new Scanner({ maxFileBytes })`

`maxFileBytes` (default 1 MB) is the biggest file that is listed. Larger files are
almost always bundled or minified code, which is slow to parse and not useful to read, so they are skipped.

## `scan(directory, rootPath = directory)`

Walks `directory` and all sub-folders, depth first, and returns the source files.

| Parameter   | Meaning                                                      |
| ----------- | ------------------------------------------------------------ |
| `directory` | Folder to walk.                                              |
| `rootPath`  | Returned paths are relative to this folder (default: `directory`). |

### Return value

A promise of a **sorted** array of project-relative paths. Separators are always
`/`, even on Windows, so ids look the same on every machine.

```js
await new Scanner().scan(root, root);
// ["b.js", "c.js", "main.js"]
```

### What is included and ignored

- Included extensions: `.js`, `.mjs`, `.cjs`.
- Ignored names (files or folders, at any depth): `node_modules`, `.git`,
  `dist`, `build`, `coverage`, `.gitignore`, `test`.

### Errors

`scan` does not catch errors. If a folder cannot be read, the promise rejects
with the error from `fs.readdir`.
