# Call Graph Explorer: Build Plan

An application that shows **who calls a function** and **what it calls**, the **path between two functions**, and lets you **filter all function names, click one, and see its source plus its incoming and outgoing edges**.

---

## 1. What you are building

| Feature | Description |
|---|---|
| Function list | Every function in the project, with a text filter and file/folder filter |
| Detail panel | Source code, file and line range, "called from" list, "calls" list |
| Graph view | Selected function in the middle, callers on the left, callees on the right |
| Tree view | Collapsible call tree, either "what it calls" or "who calls it" |
| Path view | Pick function A and function B, see the call path(s) between them |

**Out of scope for version 1:** editing code, running code, supporting many languages.

---

## 2. Recommended tech stack

### Language to analyze (first target)
Pick **one**. Recommended: **JavaScript** (parser: Acorn) or **Python** (built-in `ast` module). Both are easy to parse. Add other languages later.

### Backend

| Choice | Recommendation | Why |
|---|---|---|
| Runtime | **Node.js** (if analyzing JS/TS) or **Python** (if analyzing Python) | Use the same language as the code you analyze, so you can use its best parser |
| Web framework | **Express** or **Fastify** (Node), **FastAPI** (Python) | Small, simple, easy to expose a JSON API |
| Parser | **Acorn** (JS), **@babel/parser** (JS + TS + JSX), **ast** (Python), **tree-sitter** (many languages) | Always use a real parser, never regex |
| Storage (small projects) | In-memory maps | Fast and simple |
| Storage (large projects) | **SQLite** with indexes on caller and callee columns | Survives restarts, handles 100k+ line codebases |
| Parallelism (later) | `worker_threads` (Node) or `multiprocessing` (Python) | Parse many files at once |

### Frontend: React or vanilla JS?

**Recommendation: use React (with Vite and TypeScript).**

Why React fits this app:
- You have **several panels that share state**: the selected function drives the detail panel, the graph, the tree, and the highlighted list item. Keeping those in sync by hand in vanilla JS gets messy quickly.
- You need a **filterable list of thousands of items**, which pairs well with virtualized-list libraries made for React.
- Views (graph, tree, path) are separate components you can build and test one at a time.
- Strong ecosystem for the exact pieces you need (see below).

When vanilla JS is the better choice:
- You want to **learn the fundamentals** first.
- You only plan one simple view and a short list.
- You want zero build tooling.

A reasonable path: **prototype the first screen in vanilla JS** to understand the data, then build the real app in React once you have three or more views.

| Choice | Recommendation |
|---|---|
| Build tool | **Vite** |
| Framework | **React** + **TypeScript** |
| State management | React state + **Zustand** (small and simple) for "selected function" and filters |
| Graph drawing | **Cytoscape.js** (or **React Flow** if you prefer a node-and-box look) |
| Graph layout | **dagre** or **elkjs** (clean left-to-right layouts) |
| Tree view | Custom recursive component, or a tree library |
| Long lists | **react-window** or **@tanstack/react-virtual** |
| Source code display | **highlight.js**, **Prism**, or **Monaco Editor** (read-only) |
| Data fetching | **TanStack Query** (caching, loading states) |
| Styling | Plain CSS, **Tailwind CSS**, or a component kit like **shadcn/ui** |

### Suggested folder layout

```
callgraph-app/
  backend/
    scanner        find source files
    parser         one file -> functions, calls, imports
    linker         connect calls to definitions across files
    graph          callers, callees, path queries
    api            HTTP endpoints
  frontend/
    components/    FunctionList, DetailPanel, GraphView, TreeView, PathView
    store/         selected function, filters, depth
    api/           functions that call the backend
```

---

## 3. Build steps

### Step 1: Fix the scope
Decide before writing anything:
- **Language:** one language to start.
- **Input:** a project folder on your machine.
- **Views:** (1) one function with callers on the left and callees on the right, (2) one function as a call tree (up or down), (3) two functions with the path between them.
- **Not now:** editing code, running code, multiple languages.

### Step 2: Define the data model on paper
Everything depends on this. You need two records.
- **Function record:** unique ID (file path + qualified name, such as `src/app.js#Foo.bar`), name, file, start line, end line, owning class if any.
- **Call edge:** caller ID, callee ID, line number of the call, kind of edge (direct call or callback), and confidence (certain or guessed).

Use unique IDs, because many functions share names like `init` or `render`.

### Step 3: Scan the project
Walk the folder and collect source files. Skip `node_modules`, `.git`, `dist`, `build` and similar. Store each file's path relative to the project root.

### Step 4: Parse each file into an AST
Use a real parser. Before writing extraction code, print the AST of a tiny file and learn how a function definition and a function call look. Most of the project is understanding this tree.

### Step 5: Extract functions
Walk the AST and record every function definition: ID, name, file, start line, end line. Include:
- plain function declarations
- functions assigned to variables (including arrow functions)
- methods inside classes and objects
- default exports

Keep the exact source range so the UI can show the code later.

### Step 6: Extract calls
Walk each function's body and record every call with its line number.
- Calls outside any function belong to a "top-level" entry.
- A nested function owns its own calls; do not credit them to the outer function.
- Record functions passed as callbacks (for example to `setTimeout` or `.then`) as a **separate edge kind**, so you can draw them differently.

### Step 7: Link calls to definitions
The hardest step and the one that decides accuracy. For each call, work out which function it really refers to:
1. Look in the same file.
2. If the name was imported, follow the import into the other file.
3. For `this.method()`, prefer a method with that name in the same class.
4. For calls on unknown objects like `obj.save()`, either skip them or link by name and mark the edge as a **low-confidence guess**.

Build steps 1 and 2 first, get them right, then add the rest.

### Step 8: Build the graph and the reverse index
Store edges in two lookups: **caller → callees** and **callee → callers**. The reverse lookup is what answers "from where is this called". Small projects: in-memory maps. Large projects: SQLite with indexes on both columns.

### Step 9: Write the three queries
- **Callees of X:** follow outgoing edges to a chosen depth.
- **Callers of X:** follow incoming edges to a chosen depth.
- **Path from A to B:** breadth-first search from A until B is reached (shortest path). For all paths, use depth-first search with a depth cap and a result limit.

Rules for all queries:
- Treat the data as a **graph, not a tree**. Track visited functions so recursion and cycles stop.
- Always **cap the depth**. Without a cap, shared helper functions make the output explode.

### Step 10: Expose the queries through an API
Endpoints to create:
- **Analyze:** takes a folder path, parses and stores the graph (runs once)
- **List/search functions:** text filter, optional file/folder filter, paged
- **Get function:** details plus source text
- **Get callers** and **get callees:** with a depth parameter
- **Get path:** from A to B

Keep the heavy parsing in the analyze step, so every other endpoint answers instantly.

### Step 11: Build the function list (filter panel)
Left side of the app.
- Show each function name with its file underneath.
- Search box that filters as you type (debounce it).
- Filters by file or folder.
- Virtualized list so thousands of items stay fast.
- Clicking a name selects it.

### Step 12: Build the detail panel
Shown when a function is selected:
- name, file, line range
- **source code** from the stored range, syntax highlighted
- **"Called from"** list: each item with file and the line of the call
- **"Calls"** list: same format
- every item clickable, so the user can walk through the code

Build this before the graph. It is useful by itself and simpler to get right.

### Step 13: Build the graph view
Use a graph library, not hand-drawn shapes.
- Selected function in the middle, callers on the left, callees on the right.
- Arrows show direction.
- Clicking a node selects it and updates the detail panel.
- Depth control (1, 2, 3 levels).
- Color nodes by file, so file changes in the flow are visible.
- Style callback edges as dashed and guessed edges as faint, with a toggle to hide guesses.

### Step 14: Build the tree view
Collapsible tree of the same data.
- Function at the top, children underneath, expand on click.
- Toggle between "what it calls" and "who calls it".
- Mark **cycle** where recursion is detected and **see above** where a subtree was already shown.
- Each row shows file and line.

### Step 15: Build the two-function path view
- Two inputs, "from" and "to", each with autocomplete from the function list.
- Show the shortest path as a chain of functions.
- If more than one path exists, let the user step through them.
- If no path exists, say so plainly and note that dynamic calls may be missed.

### Step 16: Test with small cases first
Make a tiny project (2 to 3 files) with known structure:
- a chain `a → b → c`
- one function imported from another file
- one recursive function
- two functions with the same name in different files
- one callback passed to another function

Check every edge by hand. Then run on a real open-source project and compare against searching the code yourself.

### Step 17: Improve what matters most
In order of value:
1. Handle more syntax (TypeScript, classes, exports, JSX).
2. Speed: parse in parallel, cache results by file content hash, re-parse only changed files.
3. Better accuracy for method calls using type information (for example the TypeScript compiler API).
4. Remember the last analyzed project; add a "re-analyze" button.
5. Support more languages by adding parsers behind the same function and edge data model.
6. Optional: runtime tracing to capture calls static analysis cannot see.

---

## 4. Suggested order of work

Build in this order so something always works:

1. **Steps 3 to 6:** extract functions and calls, print them in the terminal.
2. **Step 7:** linking calls to definitions.
3. **Steps 8 and 9:** queries, tested in the terminal.
4. **Step 10:** API.
5. **Steps 11 and 12:** function list and detail panel.
6. **Steps 13 to 15:** graph, tree and path views.

The parsing and linking are the real project. The visual parts are straightforward once the data is right.

---

## 5. Things to watch out for

- **Static analysis is never perfect** for dynamic languages. Calls through variables, dynamic keys (`handlers[name]()`) and event systems will be missing or guessed. Show the confidence of each edge and the exact line of each call.
- **Name collisions:** many functions share names. Never link by name alone when an import can tell you the real target.
- **Big graphs are unreadable:** always show a small neighborhood (depth 1 to 3), never the whole graph.
- **Security:** if you ever host this, do not let users send arbitrary folder paths. Accept only uploads, git URLs you clone yourself, or an allow-listed directory.
- **Parse failures:** some files will fail to parse (syntax the parser does not support). Show a count and a list, and continue with the rest.

---

## 6. Quick decision summary

| Question | Answer |
|---|---|
| Backend language | Same as the language you are analyzing (Node for JS/TS, Python for Python) |
| Frontend | **React + Vite + TypeScript** |
| Graph library | Cytoscape.js (with dagre layout) |
| Storage | In-memory first, SQLite when projects get large |
| First milestone | Print callers and callees of a function in the terminal |