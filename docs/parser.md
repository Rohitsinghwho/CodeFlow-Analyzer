# Parser and Analyzer

Two classes turn a source file into data about its functions:

1. `Parser` (`backend/parser/Parser.js`) reads a file and builds a syntax tree (AST) with Acorn.
2. `Analyzer` (`backend/analyzer/Analyzer.js`) walks that tree and collects
   functions, calls, imports and exports. It asks `RuleSet`
   (`backend/analyzer/rules/RuleSet.js`) what each node means and uses
   `Utilities` (`backend/utils/Utilities.js`) to walk the tree.

## `Parser.parse(filePath)`

Never throws. Returns one of:

```js
{ ast }                       // success
{ file: filePath, error }     // missing file or invalid syntax
```

`error` is a readable message; when Acorn reports a position it ends with
`(line N, column M)`. `CodeFlow.analyze()` collects these into its `errors` list.

Acorn options: `ecmaVersion: "latest"`, `sourceType: "module"`, `locations: true`
(every node keeps its line numbers).

## `Analyzer.analyze(ast, relativePath)`

Returns `{ functions, calls, imports, exports }` for one file.

| List        | Record shape                                              |
| ----------- | --------------------------------------------------------- |
| `functions` | `{ id, name, owner, kind, line, endLine }`                |
| `calls`     | `{ caller, calleeName, objectName, kind, viaThis, line }` |
| `imports`   | `{ localName, importedName, source, external }`           |
| `exports`   | `{ exportedName, localName }`                             |

### Function ids and kinds

- Id: `<file>#<name>` for functions, `<file>#<Owner>.<name>` for methods.
  Duplicates get the line appended: `<id>@<line>`.
- `kind`: `function` (declaration, or arrow/function expression assigned to a
  variable), `method` (class method or object property function), `callback`
  (inline function passed as an argument, named `anonymous@<line>`).
- `owner`: the class or object name for methods, otherwise `null`.
- Code outside any function is credited to the caller `<file>#<top-level>`.

### Calls

`kind` is `call` (`foo()`), `new` (`new Foo()`) or `ref` (a function passed by
name, as in `arr.map(transform)`). `objectName` is the name before the dot
(`obj.save()` -> `obj`); `viaThis` is true for `this.save()`. Computed or deeper
member calls (`a[b]()`, `a.b.c()`) have no `objectName`/name and are skipped when
the callee cannot be named.

### Imports and exports

- Imports: ES `import` (default -> `importedName: "default"`, namespace -> `"*"`)
  and CommonJS `require` (whole module, destructured, or `require(...).member`).
  `external` is true when the path does not start with `.`.
- Exports: `export function/class/const`, `export { a as b }`,
  `export default ...`. Re-exports with `from` are not handled yet.

## `RuleSet`

Recognises things in one AST node. The Analyzer calls four methods on every
node, and each returns a list (empty when the node is not what it looks for):
`findFunctions(node)`, `findCalls(node)`, `findImports(node)` and
`findExports(node)`.

## `Utilities`

- `isNode(value)`: object with a string `type`.
- `childNodes(node)`: direct child nodes, flattening arrays.
- `isFunctionNode(node)`: arrow function or function expression.
