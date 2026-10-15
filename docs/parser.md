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

If `Read(path)` returns `null`, `Parse` returns a structured error result:

```js
{
  file: "src/index.js",
  error: "Failed to read the file"
}
```

### Parse failure

If Acorn throws because the source contains invalid or unsupported syntax,
`Parse` returns the file path and the parser message, including the line and
column when Acorn provides them:

```js
{
  file: "src/routes/url.js",
  error: "Unexpected token (line 4, column 12)"
}
```

Callers can use the presence of `ast` to identify successful parses and the
`file` and `error` fields to report failed files clearly.

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

## Current analysis coverage

Acorn parses the complete JavaScript module into an AST. The current analysis
step, implemented by `visit(ast)`, extracts only selected function-like
declarations from that AST. It currently handles:

| AST construct | `kind` | What is recorded |
|---|---|---|
| `FunctionDeclaration` | `"function"` | The function name, a `null` owner, and the declaration start and end lines. Anonymous functions use `"default"` as the name. |
| `VariableDeclarator` with an `ArrowFunctionExpression` initializer | `"function"` | The variable name, a `null` owner, and the arrow-function start and end lines. |
| `VariableDeclarator` with a `FunctionExpression` initializer | `"function"` | The variable name, a `null` owner, and the function-expression start and end lines. |
| Non-computed `MethodDefinition` with an identifier key | `"method"` | The method name, its enclosing class as `owner`, and the method value start and end lines. |
| Non-computed object `Property` with an identifier key and function value | `"method"` | The property name, its enclosing object variable as `owner` when available, and the function value start and end lines. |

Variable declarations are included only when the declared name is a simple
identifier. Destructuring patterns, variables initialized with values other
than arrow or function expressions, and variables with no initializer are not
recorded. Computed method and object-property names are also not recorded.

The traversal is recursive and visits nested functions, classes, arrays, and
other AST child nodes in depth-first order. It records source line ranges but
does not currently extract imports, function calls, parameters, return values,
class fields, or call-graph relationships. These constructs remain available
in the Acorn AST for future analysis.

The sample input
[`sample-project/tiny.js`](../sample-project/tiny.js) demonstrates these
cases with named functions, arrow functions, function expressions, an
`async` function, class methods, object methods, a default-exported anonymous
function, a non-function variable, and nested functions.

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

### `visit(ast, relativePath)`

`visit` is the default export from
[`backend/helper/visitChild.js`](../backend/helper/visitChild.js). It performs
a recursive depth-first traversal of an AST and returns an array describing
the function-like declarations listed in
[Current analysis coverage](#current-analysis-coverage):

```js
const functions = visit(ast, relativePath);
```

`relativePath` is the normalized path of the source file relative to the
analysis root. It is used as the first part of each result ID so declarations
from different files can be distinguished.

For each node, the internal `visitChilds` function:

1. records `FunctionDeclaration` nodes, using `"default"` when the declaration
   has no identifier;
2. selects `VariableDeclarator` nodes whose identifier is a simple
   `Identifier` and whose initializer is an `ArrowFunctionExpression` or
   `FunctionExpression`;
3. records non-computed `MethodDefinition` nodes whose key is an `Identifier`,
   assigning the enclosing class name as `owner` when available;
4. records non-computed `Property` nodes whose key is an `Identifier` and
   whose value is an arrow or function expression, assigning the enclosing
   object variable as `owner` when available; and
5. recursively visits AST nodes inside arrays and direct AST-node properties.

This allows the traversal to work with Acorn's nested node structure without
hard-coding fields such as `body`, `declarations`, or `expression`.

### Result IDs and duplicate declarations

Every result receives an `id` built from the relative file path:

```text
<relativePath>#<name>
```

For methods, the owner is included in the name portion:

```text
<relativePath>#<owner>.<methodName>
```

The visitor keeps an `IdSet` for the current file. When an ID has already
been used, the new result receives the declaration's start line as a suffix:

```text
sample-project/tiny.js#handler
sample-project/tiny.js#handler@12
```

This preserves both declarations while keeping IDs stable and readable. The
path component prevents same-named declarations in different files from
colliding, while the owner component distinguishes methods belonging to
different classes or objects.

The returned entries have this shape:

```js
{
  id: "sample-project/tiny.js#render",
  name: "render",
  owner: null,
  kind: "function",
  line: 3,
  endLine: 8
}
```

Each entry has an `id`, `name`, `owner`, `kind`, a starting `line`, and an
`endLine`. The `kind` is `"function"` for function declarations and
function-valued variables, or `"method"` for class methods and function-valued
object properties. `owner` is `null` for functions and function-valued
variables. For class methods, it is the enclosing class name; for object
methods, it is the enclosing object variable name. Anonymous class
expressions use `"default"`.
The line range is taken from the declaration, function initializer, or method
value that was matched.

Declarations with non-identifier variable patterns, non-function
initializers, computed method keys, or unsupported node shapes are ignored.
The shared result shape is created by
[`backend/helper/resultHelper.js`](../backend/helper/resultHelper.js).
`visit` does not resolve imports or build call-graph edges.

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
  const functions = visit(result.ast, "src/index.js");
  console.log(functions);
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