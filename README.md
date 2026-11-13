# CodeFlow

CodeFlow reads a JavaScript project and shows **which function calls which**.
Point it at a folder and it can tell you:

- what functions exist, and in which file,
- what a function calls, and who calls it,
- the shortest chain of calls between two functions.

It reads the code with a real parser ([Acorn](https://github.com/acornjs/acorn)),
so it does not run your code and does not guess from text patterns.

> **Status:** the backend engine works and is tested, and a first HTTP API can
> analyze a project, list its functions and show a function's source. Callers and
> paths over HTTP, and the web interface, are not built yet. See [What is built](#what-is-built).

## Quick start

You need a recent Node.js (developed and tested on Node 24).

```bash
cd backend
npm install
npm test
```

Use it from code:

```js
import { CodeFlow } from "./backend/index.js";

const codeFlow = new CodeFlow();

// 1. Read the whole project (a folder path).
const { fileResults, errors } = await codeFlow.analyze("path/to/your/project");

// 2. Turn the calls into a graph you can search.
const graph = codeFlow.buildGraph(fileResults);

// 3. Ask questions. Function ids look like "<file>#<name>" or "<file>#<Class>.<method>".
graph.getCallees("main.js#main");                        // what does main call?
graph.getCallers("c.js#init");                           // who calls init?
graph.findPath("b.js#init", "b.js#helper");              // ["b.js#init", "b.js#helper"]
```

Each call comes back as an edge:

```js
{ caller: "main.js#main", callee: "c.js#init", line: 4, kind: "call",
  confidence: "certain", file: "main.js", depth: 1 }
```

`confidence` is `"certain"` when the link is sure, and `"guess"` when only the
name matched (for example `obj.save()` on an object whose type is unknown).

Files that cannot be parsed do not stop the run. They are listed in `errors`.

Or use it over HTTP:

```bash
cd backend
npm start                                   # http://localhost:3000
curl -X POST localhost:3000/api/analyze -H "Content-Type: application/json"   -d '{"path":"/path/to/your/project"}'
curl "localhost:3000/api/functions?search=init"
```

See [docs/api.md](docs/api.md) for every endpoint.

## How it works

Four steps, run in order by the `CodeFlow` class, then a fifth to ask questions:

```
project folder -> Scanner -> Parser -> Analyzer -> Linker -> Graph
                  find       build     find        connect    callers,
                  files      AST       functions,  files and  callees,
                                       calls,      calls      paths
                                       imports,
                                       exports
```

| Step | Folder | What it does |
| --- | --- | --- |
| Scanner | `backend/scanner` | Lists the JavaScript files, skipping `node_modules`, `dist` and similar |
| Parser | `backend/parser` | Turns one file into a syntax tree |
| Analyzer | `backend/analyzer` | Finds functions, calls, imports and exports in one file |
| Linker | `backend/linker` | Connects imports, exports and calls across files |
| Graph | `backend/graph` | Answers who calls whom, and finds paths |

The full explanation, with a worked example, is in
[docs/architecture.md](docs/architecture.md).

## What is built

- [x] Scanner, Parser, Analyzer, Linker and Graph, with tests
- [x] Functions, methods (including `#private`), callbacks and top-level code
- [x] ES `import` / `export` and CommonJS `require`
- [x] Call linking with `certain` and `guess` confidence
- [x] Callers, callees and shortest path, safe against recursion and circles
- [x] HTTP API: analyze a project, list functions, get a function with its source
- [ ] API endpoints for callers, callees and paths
- [ ] Web interface (function list, detail panel, graph view)
- [ ] Linking `new SomeClass()` to the class
- [ ] Re-exports (`export { x } from "./y"`) and namespace calls (`ns.fn()`)

## Limits

Static analysis cannot see everything. Calls that are decided while the program
runs (`handlers[name]()`, event systems) are missing or guessed, so "no path" does
not prove two functions are unrelated.

## Project layout

```
backend/            the engine (Node.js, ES modules)
  CodeFlow.js         entry class that runs the pipeline
  scanner/ parser/ analyzer/ linker/ graph/ indexes/ utils/
  api/                Express app (createApp.js); server.js starts it
  __test__/           all tests (codeflow.test.js) and fixture projects
docs/               documentation
frontend/           planned, empty for now
```

## Tests

```bash
cd backend
npm test
```

All tests are in `backend/__test__/codeflow.test.js`. Besides small fixture
projects, they run CodeFlow on its own source code and check the real
"who calls whom" of this repository. Known gaps are marked `todo` there.

## Documentation

| Doc | About |
| --- | --- |
| [architecture.md](docs/architecture.md) | How all the pieces fit together |
| [scanner.md](docs/scanner.md) | Finding the files |
| [parser.md](docs/parser.md) | Parser, Analyzer, RuleSet and what is extracted |
| [linker.md](docs/linker.md) | Imports, exports and call linking |
| [graph.md](docs/graph.md) | Callers, callees and paths |
| [api.md](docs/api.md) | The HTTP endpoints |
| [architecture-diagram.md](docs/architecture-diagram.md) | The architecture as a diagram |
| [packages.md](docs/packages.md) | Packages used |
| [initialSetup.md](docs/initialSetup.md) | The original build plan for the whole app |

## Built with

Node.js, [Acorn](https://github.com/acornjs/acorn) (parser) and Express (planned API).
