# Graph

`Graph` (`backend/graph/Graph.js`) answers questions about who calls whom. It is
built from the edges that `Linker.linkCalls()` returns.

```js
const codeFlow = new CodeFlow();
const { fileResults } = await codeFlow.analyze(projectFolder);
const graph = codeFlow.buildGraph(fileResults); // links the calls, then builds the Graph
```

`buildGraph(fileResults)` is the same as `new Graph(codeFlow.linkCalls(fileResults))`.

## Input: edges

Each edge is `{ caller, callee, line, kind, confidence, file }`. `caller` and
`callee` are function ids such as `main.js#main` (see
[architecture.md](architecture.md#function-ids)). Edges with `confidence: "guess"`
are included like any other, so check `confidence` if you need only sure links.

## Methods

| Method | Answers | Returns |
| --- | --- | --- |
| `getCallees(id, depth = 1)` | What does this function call? | Edges, each copied with a `depth` field |
| `getCallers(id, depth = 1)` | Who calls this function? | Edges, each copied with a `depth` field |
| `findPath(fromId, toId, maxDepth = 10)` | What is the shortest chain of calls from one function to another? | An array of ids, or `null` |

### `getCallees` and `getCallers`

- `depth: 1` returns direct calls only; `depth: 2` also returns what those functions call, and so on.
- Every returned edge has a `depth` field: `1` is a direct call or caller, `2` is one step further.
- An unknown id, or a function with no calls, returns `[]`.

```js
graph.getCallees("main.js#main", 1);
// [{ caller: "main.js#main", callee: "c.js#init", depth: 1, confidence: "certain", ... }, ...]
```

### `findPath`

- Returns the chain with both ends, for example `["a", "b", "c"]` (a calls b, b calls c).
- If two chains exist, the shorter one is returned.
- Returns `[fromId]` when both ids are the same, and `null` when no chain exists
  within `maxDepth` calls.

## How the search works

All three methods search outward one level at a time (breadth-first):

1. Start with the function you asked about.
2. Follow its edges to find the next functions.
3. Repeat for `depth` levels.

Two rules keep the search safe:

- **Circles end.** The graph remembers every function it has already walked into
  (the `seen` set, or `cameFrom` in `findPath`). A function that calls itself, or
  `a → b → a`, is reported once and never walked again.
- **The depth is capped**, so a helper used everywhere cannot flood the result.

The graph keeps two lookups built once in the constructor: caller to its
outgoing edges, and callee to its incoming edges. That is what makes
`getCallers` as fast as `getCallees`.

## Limits

- It only knows what the Linker found. Calls the Linker cannot see (dynamic calls,
  `new SomeClass()`) are missing, so "no path" does not prove two functions are unrelated.
