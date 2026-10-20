# Parser

The parser converts a JavaScript source file into an
[Abstract Syntax Tree (AST)](https://en.wikipedia.org/wiki/Abstract_syntax_tree).
The AST is a structured representation of the source code. Later analysis can
use it to inspect declarations, imports, exports, calls, and other language
constructs without trying to interpret the source with regular expressions.

The parser is implemented in
[`backend/parser/parser.js`](../backend/parser/parser.js) and re-exported by
[`backend/parser/index.js`](../backend/parser/index.js). It uses the
[`acorn`](../backend/node_modules/acorn) package, which is declared as a
backend dependency in [`backend/package.json`](../backend/package.json).

## Parsing flow

The parser implementation default-exports the asynchronous `Parse(path)`
function, and [`backend/parser/index.js`](../backend/parser/index.js) exposes it
as the named `Parse` and `parse` exports. Its setup and execution flow is:

1. `Parse` receives the path of one JavaScript file.
2. It calls the `Read` utility from
   [`backend/utils/readFile.js`](../backend/utils/readFile.js), exposed through
   [`backend/utils/index.js`](../backend/utils/index.js).
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
step, implemented by `visit(ast, relativePath)`, extracts function
declarations, static calls, imports, and exports from that AST. Function
records currently handle:

| AST construct | `kind` | What is recorded |
|---|---|---|
| `FunctionDeclaration` | `"function"` | The function name, a `null` owner, and the declaration start and end lines. Anonymous functions use `"default"` as the name. |
| `VariableDeclarator` with an `ArrowFunctionExpression` initializer | `"function"` | The variable name, a `null` owner, and the arrow-function start and end lines. |
| `VariableDeclarator` with a `FunctionExpression` initializer | `"function"` | The variable name, a `null` owner, and the function-expression start and end lines. |
| Non-computed `MethodDefinition` with an identifier key | `"method"` | The method name, its enclosing class as `owner`, and the method value start and end lines. |
| Non-computed object `Property` with an identifier key and function value | `"method"` | The property name, its enclosing object variable as `owner` when available, and the function value start and end lines. |
| `CallExpression` with function arguments | `"callback"` | One callback record per arrow or function-expression argument, named `anonymous@<line>`. |
| `NewExpression` with function arguments | `"callback"` | One callback record per arrow or function-expression argument passed to a constructor call. |

Variable declarations are included only when the declared name is a simple
identifier. Destructuring patterns, variables initialized with values other
than arrow or function expressions, and variables with no initializer are not
recorded. Computed method and object-property names are also not recorded.

The traversal is recursive and visits nested functions, classes, arrays, and
other AST child nodes in depth-first order. Function forms are selected through
a node-type rule table, while the walker handles ownership, IDs, result
creation, call recording, import recording, export recording, and recursion.
Import and export analysis records static syntax only; it does not resolve
modules or connect imports and exports across files. Parameters, return values,
class fields, re-export resolution, and other unsupported constructs remain
available in the Acorn AST for future analysis.

The sample input
[`sample-project/tiny.js`](../sample-project/tiny.js) demonstrates named
function and variable exports, local export specifiers, a default identifier
export, and a re-export.

### Import and require analysis

Import rules are defined in
[`backend/analyzer/rules/importRules.js`](../backend/analyzer/rules/importRules.js).
Every import record has this shape:

```js
{
  localName: "readFile",
  importedName: "default",
  source: "fs",
  external: true
}
```

`external` is calculated by `isExternalCheck(source)`: sources beginning with
`.` are treated as local, while other non-empty sources are treated as
external. `makeImport(localName, importedName, source)` creates the normalized
record and is shared by ES module imports and CommonJS require rules.

`ImportDeclaration` supports default, named, and namespace imports:

```js
import readFile from "fs";
import { readFile as read } from "./file.js";
import * as utils from "./utils.js";
```

The corresponding records use `default`, the imported identifier, or `*` as
`importedName`.

`VariableDeclarator` also detects CommonJS imports when the initializer uses a
literal-string `require` call:

```js
const utils = require("./utils.js");
const { readFile: read } = require("./file.js");
const parse = require("./parser.js").parse;
```

These produce `*`, the destructured property names, or the member name as
`importedName`. Calls such as `require()`, `require(moduleName)`, computed
members such as `require("./x.js")["value"]`, and unsupported destructuring
patterns are ignored.

`getRequireSource(node)` accepts only a `CallExpression` whose callee is the
identifier `require` and whose first argument is a string `Literal`. It returns
the module source string or `null`.

### Export analysis

Export rules are defined in
[`backend/analyzer/rules/exportRules.js`](../backend/analyzer/rules/exportRules.js).
Every export record has this shape:

```js
{
  exportedName: "publicName",
  localName: "internalName"
}
```

`ExportNamedDeclaration` handles:

```js
export function run() {}
export const first = 1, second = 2;
const internal = 3;
export { internal as publicName };
```

Declarations produce matching exported and local names. Export specifiers
preserve their public and local names. Re-exports containing a `source`, such
as `export { value } from "./other.js"`, return no records because cross-file
resolution is not implemented.

`ExportDefaultDeclaration` handles named or anonymous function/class
declarations and identifier exports:

```js
export default function named() {}
export default class Service {}
export default internal;
```

The exported name is always `"default"`. A named declaration uses its local
name, an anonymous declaration uses `"default"` as its local name, and an
identifier export uses the identifier name.

## Utility functions used by the parser

### `Read(path)`

`Read` is the default export from
[`backend/utils/readFile.js`](../backend/utils/readFile.js). It reads a file
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
[`backend/analyzer/visitChild.js`](../backend/analyzer/visitChild.js). It performs
a recursive depth-first traversal of an AST and returns an object containing
function records and static call descriptions. See
[Current analysis coverage](#current-analysis-coverage) for the supported
function forms:

```js
const { functions, calls, imports, exports } = visit(ast, relativePath);
```

`relativePath` is the normalized path of the source file relative to the
analysis root. It is used as the first part of each result ID so declarations
from different files can be distinguished.

For each node, the walker:

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
5. records supported calls and call arguments using the call-rule table; and
6. recursively visits AST nodes inside arrays and direct AST-node properties.

Callback arguments are recorded as `"callback"` entries with the enclosing
class or object owner when one is available. Function declarations and
function-valued variables intentionally retain `owner: null`, including when
they are nested inside a method or class. This preserves the original result
and ID behavior. The node helpers isolate AST child discovery and
function-expression checks from the rules, so adding a new function form
requires a rule and one entry in the rule table.

This allows the traversal to work with Acorn's nested node structure without
hard-coding fields such as `body`, `declarations`, or `expression`.

### Walker design and helper modules

The analysis is split into small responsibilities so a new AST form can be
added without changing traversal, ownership, or result-building code:

- [`backend/utils/checkNode.js`](../backend/utils/checkNode.js) contains
  `isNode`, `childNodes`, and `isFunctionNode`.
  - `isNode` guards recursive traversal.
  - `childNodes` normalizes direct node properties and node arrays into one
    list, avoiding hard-coded AST field names.
  - `isFunctionNode` centralizes the ArrowFunctionExpression and
    FunctionExpression check used by declaration, property, and callback
    rules.
- [`backend/analyzer/rules/functionRules.js`](../backend/analyzer/rules/functionRules.js)
  contains one rule per supported function form. Each rule only examines a
  node and returns descriptions shaped as `{ name, kind, fnNode }`. Rules do
  not build IDs, push results, or determine owners, which makes them
  independently readable and testable.
- The `functionRules` lookup object maps AST node types such as
  `FunctionDeclaration`, `VariableDeclarator`, `MethodDefinition`,
  `Property`, `CallExpression`, and `NewExpression` to their rules. The table
  replaces a growing conditional dispatch block: supporting another function
  form requires adding a rule and one table entry.
- [`backend/analyzer/rules/callRules.js`](../backend/analyzer/rules/callRules.js) applies the
  same lookup-table approach to calls. It extracts identifier and
  non-computed member-expression callees, records whether a call uses
  `this`, and identifies referenced callees passed as non-function arguments.
- [`backend/analyzer/rules/importRules.js`](../backend/analyzer/rules/importRules.js)
  handles both `ImportDeclaration` and CommonJS `require` variable
  declarations. `makeImport` keeps the import record shape and external-module
  detection consistent across both forms.
- [`backend/analyzer/rules/exportRules.js`](../backend/analyzer/rules/exportRules.js)
  handles named and default export declarations. `makeExport` keeps the
  exported and local names in one normalized shape.
- [`backend/parser/resultHelper.js`](../backend/parser/resultHelper.js)
  remains responsible for constructing the normalized function record. The
  walker supplies the ID, name, owner, kind, and source line range.

The walker passes one context object through recursion:

```js
{ owner, currentFnId }
```

`owner` tracks the enclosing class or object for methods and callbacks.
`currentFnId` tracks the function that owns a call, allowing nested calls to
be attributed to the nearest function. A `Map` named `idByFnNode` connects
each function AST node to the ID assigned when it is recorded. This avoids
recomputing IDs while descending into the function body and ensures call
records use the same IDs as function records. The context object leaves room
for future traversal state without adding more recursive parameters.

The `record` helper centralizes ID creation, duplicate handling, map
registration, and result insertion. The `ids` `Set` ensures IDs remain unique.
If the base ID and its line-number suffix are already taken, the walker adds
an additional numeric suffix.

Call results are stored in the `calls` array returned by `visit`:

```js
{
  caller: "src/index.js#render",
  calleeName: "save",
  objectName: "db",
  kind: "call",
  viaThis: false,
  line: 12
}
```

Calls made outside a function use
`<relativePath>#<top-level>` as their caller. Call kinds include `"call"`,
`"new"`, and `"ref"` for a referenced callable passed as an argument.

Import and export results are returned alongside calls:

```js
const { functions, calls, imports, exports } = visit(ast, relativePath);
```

The `imports` array contains the import record described in
[Import and require analysis](#import-and-require-analysis). The `exports`
array contains the export record described in
[Export analysis](#export-analysis). These records do not include source
locations or IDs because they describe module boundaries rather than
declarations in the function graph.

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
been used, the new result receives the declaration's start line as a suffix.
If that suffix is also already used, an additional numeric suffix is added:

```text
sample-project/tiny.js#handler
sample-project/tiny.js#handler@12
sample-project/tiny.js#handler@12-2
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
function-valued variables, `"method"` for class methods and function-valued
object properties, or `"callback"` for function expressions passed as call
arguments. `owner` is `null` for functions and function-valued variables. For
class methods, it is the enclosing class name; for object methods, it is the
enclosing object variable name. Anonymous class
expressions use `"default"`.
The line range is taken from the declaration, function initializer, or method
value that was matched.

Declarations with non-identifier variable patterns, non-function
initializers, computed method keys, or unsupported node shapes are ignored.
The shared result shape is created by
[`backend/parser/resultHelper.js`](../backend/parser/resultHelper.js).
`visit` does not resolve imports or exports across files, or link call
descriptions to definitions.

### `isNode(value)`

`isNode` is the default export from
[`backend/utils/checkNode.js`](../backend/utils/checkNode.js). It guards
recursive traversal by checking that a value is:

1. not `null`;
2. an object; and
3. an object whose `type` property is a string.

The check prevents traversal from treating primitive AST properties,
metadata, or `null` values as child nodes. Both direct child properties and
items inside child arrays are passed through `isNode` before recursion.

### `childNodes(node)` and `isFunctionNode(node)`

`childNodes` and `isFunctionNode` are named exports from
[`backend/utils/checkNode.js`](../backend/utils/checkNode.js). `childNodes`
returns only direct AST children while preserving Acorn property order.
`isFunctionNode` returns `true` only for arrow and function expressions. They
are shared by the rules and walker so node-shape checks stay consistent.

## Example

The parser and traversal utility can be used together as follows:

```js
import { Parse } from "./backend/parser/index.js";
import { visit } from "./backend/analyzer/index.js";

const result = await Parse("./src/index.js");

if (result.ast) {
  const { functions, calls, imports, exports } = visit(
    result.ast,
    "src/index.js",
  );
  console.log({ functions, calls, imports, exports });
}
```

The scanner can first provide the set of JavaScript files, after which each
file can be passed to `Parse`. The resulting AST can then be traversed with
`visit` or with more specialized analysis code.

## Maintenance notes

When changing parser behavior, update this document together with
[`backend/parser/parser.js`](../backend/parser/parser.js). In particular,
document changes to Acorn options, supported syntax, result shapes, and error
handling. Changes to `Read`, `visit`, `isNode`, or any analyzer rule table should also be
reflected in the corresponding utility and analysis sections above.