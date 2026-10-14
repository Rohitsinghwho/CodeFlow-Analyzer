# Parser

The parser converts a JavaScript source file into an
[Abstract Syntax Tree (AST)](https://en.wikipedia.org/wiki/Abstract_syntax_tree).
The AST is a structured representation of the source code. Later analysis can
use it to inspect declarations, imports, calls, and other language constructs
without trying to interpret the source with regular expressions.

The parser is implemented in
[`backend/parser/parser.js`](../backend/parser/parser.js). It uses the
[`acorn`](../backend/node_modules/acorn) package, which is declared as a
backend dependency in [`backend/package.json`](../backend/package.json).

## Parsing flow

The parser exposes one default-exported asynchronous function, `Parse(path)`.
Its setup and execution flow is:

1. `Parse` receives the path of one JavaScript file.
2. It calls the `Read` utility from
   [`backend/helper/readFile.js`](../backend/helper/readFile.js).
3. If the file contents are available, it creates the Acorn parser options.
4. It calls `acorn.parse(contents, options)` to create the AST.
5. It returns the AST inside a result object: `{ ast }`.

The parser handles one file at a time. File discovery is a separate concern
handled by the scanner documented in [`docs/scanner.md`](./scanner.md).

## `Parse(path)`

### Input

| Parameter | Description |
|---|---|
| `path` | Path to the JavaScript source file to read and parse. |

### Successful result

When the file is read and parsed successfully, `Parse` resolves to an object
with the following shape:

```js
{
  ast: /* Acorn AST */
}
```

The root AST node is a `Program` node. Acorn adds `start` and `end` offsets to
nodes, and the `locations: true` option adds source location information such
as line and column numbers.

### Read failure

If `Read(path)` returns `null`, `Parse` logs `Failed to Read the file`, adds an
`error` property, and resolves to:

```js
{
  error: "Failed to Read the file"
}
```

### Parse failure

If Acorn throws because the source contains invalid or unsupported syntax,
`Parse` catches the exception and logs the file name, error message, and
location (`error.loc`). The current implementation does not return an error
object from this catch branch, so callers should not assume that every failed
parse has the same result shape as a read failure.

## Acorn configuration

The parser passes these options to Acorn:

```js
const options = {
  ecmaVersion: "latest",
  locations: true,
  sourceType: "module"
};
```

- **`ecmaVersion: "latest"`** enables the newest ECMAScript syntax supported
  by the installed Acorn version.
- **`locations: true`** makes Acorn include line and column locations on AST
  nodes. These locations are needed when analysis results are associated with
  source lines.
- **`sourceType: "module"`** parses files as ES modules, allowing syntax such
  as `import` and `export`.

The parser currently targets JavaScript modules. TypeScript, JSX, and other
syntax extensions are not enabled by these options.

## Utility functions used by the parser

### `Read(path)`

`Read` is the default export from
[`backend/helper/readFile.js`](../backend/helper/readFile.js). It reads a file
as UTF-8 text using `fs/promises`:

```js
const contents = await fs.readFile(path, { encoding: "utf-8" });
```

Its behavior is:

- returns `null` immediately when no path is provided;
- returns the file contents when the read succeeds; and
- logs the filesystem error and returns `null` when the read fails.

Keeping file I/O in this helper leaves `Parse` responsible for parsing rather
than for opening files directly.

### `visit(ast)`

`visit` is the default export from
[`backend/helper/visitChild.js`](../backend/helper/visitChild.js). It performs
a recursive depth-first traversal of an AST and returns an array containing the
`type` of every visited AST node:

```js
const nodeTypes = visit(ast);
```

For each node, the internal `visitChilds` function:

1. records the current node's `type`;
2. examines every property with `Object.values`;
3. recursively visits AST nodes inside arrays; and
4. recursively visits direct AST-node properties.

This allows the traversal to work with Acorn's nested node structure without
hard-coding fields such as `body`, `declarations`, or `expression`.

`visit` is a general inspection utility. It currently records node types only;
it does not extract functions, resolve imports, or build call-graph edges.

### `isNode(value)`

`isNode` is the default export from
[`backend/helper/checkNode.js`](../backend/helper/checkNode.js). It guards
recursive traversal by checking that a value is:

1. not `null`;
2. an object; and
3. an object whose `type` property is a string.

The check prevents traversal from treating primitive AST properties,
metadata, or `null` values as child nodes. Both direct child properties and
items inside child arrays are passed through `isNode` before recursion.

## Example

The parser and traversal utility can be used together as follows:

```js
import Parse from "./backend/parser/parser.js";
import visit from "./backend/helper/visitChild.js";

const result = await Parse("./src/index.js");

if (result.ast) {
  const nodeTypes = visit(result.ast);
  console.log(nodeTypes);
}
```

The scanner can first provide the set of JavaScript files, after which each
file can be passed to `Parse`. The resulting AST can then be traversed with
`visit` or with more specialized analysis code.

## Maintenance notes

When changing parser behavior, update this document together with
[`backend/parser/parser.js`](../backend/parser/parser.js). In particular,
document changes to Acorn options, supported syntax, result shapes, and error
handling. Changes to `Read`, `visit`, or `isNode` should also be reflected in
the corresponding utility sections above.