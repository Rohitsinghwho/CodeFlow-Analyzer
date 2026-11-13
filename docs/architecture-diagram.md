# Architecture diagram

How data moves through the CodeFlow backend. For the written explanation and a
worked example, see [architecture.md](architecture.md).

```mermaid
flowchart LR
  client(["HTTP client"])
  folder(["Project folder"])
  fs[("File system")]
  acorn["Acorn<br/>npm package"]

  subgraph codeflow["CodeFlow runs these steps in order"]
    scan["Scanner<br/>lists the JS files"]
    parse["Parser<br/>file to syntax tree"]
    analyze["Analyzer<br/>functions, calls, imports, exports per file"]
    link["Linker<br/>connects files and calls"]
    graphq["Graph<br/>callers, callees, paths"]
  end

  api["API<br/>Express routes"]
  rules["RuleSet<br/>recognises things in a tree node"]
  utils["Utilities<br/>tree helpers"]
  indexes["IndexMaps<br/>lookup tables"]

  client -->|"requests"| api
  api -->|"analyze, buildGraph"| codeflow
  folder -->|"path"| scan
  scan -->|"file paths"| parse
  parse -->|"AST"| analyze
  analyze -->|"results per file"| link
  link -->|"call edges"| graphq

  scan -.->|"reads folders"| fs
  parse -.->|"reads files"| fs
  parse -->|"uses"| acorn
  analyze --> rules
  analyze --> utils
  link --> indexes
```

## Legend

| Box | What it is | Where |
| --- | --- | --- |
| CodeFlow | Front door: runs the steps, returns files, results and errors, builds the Graph | `backend/CodeFlow.js` |
| Scanner | Lists the project's `.js`, `.mjs` and `.cjs` files, skipping `node_modules` and similar | `backend/scanner/` |
| Parser | Reads one file and builds its syntax tree with Acorn, or returns an error | `backend/parser/` |
| Analyzer | Walks one tree and collects functions, calls, imports and exports | `backend/analyzer/` |
| RuleSet | Decides what a single tree node means (function, call, import, export) | `backend/analyzer/rules/` |
| Utilities | Small helpers for walking the tree | `backend/utils/` |
| Linker | Resolves import paths, exports and calls across files | `backend/linker/` |
| IndexMaps | Lookup tables the Linker fills: exports and top-level functions per file | `backend/indexes/` |
| Graph | Answers who calls whom, and finds the shortest call path | `backend/graph/` |
| API | Express app that remembers the last analyzed project and serves it as JSON | `backend/api/`, `backend/server.js` |

## Notes

- Data does not pass straight from step to step. `CodeFlow` calls each step and hands the result to the next, so the arrows show the order and the data, not direct calls.
- `Graph` is created on request with `CodeFlow.buildGraph(fileResults)`, after `analyze()` has run. It is not part of `analyze()`.
- The API keeps the last analyzed project in memory, so one server handles one project at a time. It currently serves analyze, list functions and get a function; callers, callees and paths are not exposed yet.
- The web interface is planned but has no code yet, so it is not drawn.
