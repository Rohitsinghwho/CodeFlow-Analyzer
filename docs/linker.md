# Linker

`Linker` (`backend/linker/Linker.js`) connects the per-file results of the
`Analyzer` across files. Each `Linker` owns its own `IndexMaps`
(`backend/indexes/IndexMaps.js`), so separate instances never share data.
`new Linker(indexes)` accepts an `IndexMaps` if you want to inspect it.

Exports: `{ Linker }` (named) and a default shared instance with its own indexes.

## `buildIndexes(fileResults)`

Clears the indexes, then stores, for every `{ file, exports, functions }`:

- exports by exported name,
- **top-level** functions (owner `null`) by name. Methods are not indexed,
  because other files cannot import them directly.

Entries without a `file` are skipped. Call it before `resolveExport`
(`CodeFlow.analyze()` does this).

## `resolveModule(fromFile, source, fileSet)`

Maps an import path to a project file. Returns `null` for packages (not starting
with `.`) and unknown paths. Tries, in order: the exact path, the path plus
`.js` / `.mjs` / `.cjs`, then `<path>/index.js`.

## `resolveExport(file, exportedName)`

Returns the function id that `file` exposes as `exportedName`, or `null`.
Aliases work: `export { helper as e }` -> `resolveExport("b.js", "e") === "b.js#helper"`.
Classes, constants and unknown names give `null`.

## `linkCalls(fileResults)`

Returns one edge per resolvable call:

```js
{ caller, callee, line, kind, confidence, file }
```

`confidence` is `"certain"` or `"guess"`; `file` is where the call is written.
It rebuilds the indexes from `fileResults` first. Rules, first match wins:

1. Plain `name()` atching a top-level function in the msame file: certain.
2. Plain `name()` matching an import of a project file: resolved with
   `resolveModule` + `resolveExport`: certain.
3. `this.name()` or `this.#name()` where the caller's class/object also has a
   method `name`: certain.
4. `obj.name()`, including calls through a stored object like
   `this.#linker.name()`: every method called `name` in the project: guess.
5. Otherwise the call is skipped.

`CodeFlow.linkCalls(fileResults)` forwards to this method. To search the edges
(callers, callees, paths) see [graph.md](graph.md).

Known gaps: `new SomeClass()` is not linked to the class (only functions are
indexed), and a call made inside a callback (for example inside `.map(...)`)
belongs to the callback, not to the surrounding method.
