# HTTP API

The API lets other programs (and the future web interface) use CodeFlow over HTTP.
It is built with Express in `backend/api/createApp.js`, and `backend/server.js`
starts it.

## Run it

```bash
cd backend
npm start                    # listens on http://localhost:3000
PORT=4000 npm start          # use another port (on Windows PowerShell: $env:PORT=4000; npm start)
```

`createApp()` builds the app without starting a server, so tests can run it on any free port.

## Settings

Settings come from environment variables, or from a `backend/.env` file (copy [`backend/.env.example`](../backend/.env.example), which git ignores once renamed to `.env`).

| Setting | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on. |
| `ALLOWED_ROOTS` | empty | Folders that may be analyzed, separated by `;` on Windows and `:` on Linux and macOS. Empty means **any folder is allowed**. |
| `CORS_ORIGIN` | `http://localhost:5173` | Web page addresses allowed to call the API from a browser, separated by `,`. |

`createApp({ allowedRoots, corsOrigins })` takes the same two values as options, and the options win over the environment.

### Folder allow-list

Set `ALLOWED_ROOTS` whenever the server can be reached by anyone other than you. `POST /api/analyze` then accepts a folder only if it **is** one of the roots or is **below** one. Anything else gets `403 {"error":"Folder is not allowed"}`.

The check compares real paths, so `..` tricks (`<root>/../other`) and shortcuts or symbolic links that point outside a root are refused too.

```bash
ALLOWED_ROOTS="D:/projects;D:/samples" npm start
```

### CORS

A web page served from one address (for example the frontend at `http://localhost:5173`) is blocked by the browser from calling an API on another address, unless the API says it is allowed. The API answers with `Access-Control-Allow-Origin` only for the addresses in `CORS_ORIGIN`, and replies `204` to the browser's `OPTIONS` check before a JSON `POST`. Other addresses get no CORS headers, so their browsers block the answer. This protects browsers; it does not stop tools like `curl`, so it is not a replacement for the folder allow-list.

## How it works

The server remembers **one project at a time, in memory**: the last folder you
analyzed. Call `POST /api/analyze` first. Every other endpoint reads that project.
Analyzing again replaces it, and restarting the server forgets it.

All answers are JSON. Errors always look like this:

```json
{ "error": "message" }
```

| Status | Meaning |
| --- | --- |
| `200` | Success |
| `400` | Bad input (missing or wrong value) |
| `403` | The folder is outside `ALLOWED_ROOTS` |
| `404` | The function id does not exist |
| `409` | No project analyzed yet. Call `POST /api/analyze` first |
| `500` | Something unexpected went wrong (the details are printed in the server's terminal) |

## `POST /api/analyze`

Reads a project folder and remembers it.

**Body:** `{ "path": "<folder>" }`. The folder is read on the machine where the server runs.

```bash
curl -X POST localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"path":"D:/CodeFlow/backend/__test__/fixtures/project"}'
```

```json
{ "files": 3, "functions": 6, "errors": [] }
```

- `files`: number of JavaScript files found.
- `functions`: number of functions found in all files.
- `errors`: files that could not be parsed, as `{ "file": "bad.js", "error": "message (line 1, column 5)" }`. A bad file never stops the rest.

`400` when `path` is missing, is not text, does not exist, or is a file instead of a folder.

## `GET /api/functions`

Lists the functions of the analyzed project.

| Query | Default | Meaning |
| --- | --- | --- |
| `search` | none | Keeps functions whose id contains this text (not case sensitive). The id holds the file, class and name, so `init`, `Svc` and `b.js` all work. |
| `file` | none | Keeps functions whose file path starts with this text, for example `utils` for everything in the `utils/` folder. |
| `limit` | `50` | Page size, from 1 to 200. Anything else falls back to the default. |
| `offset` | `0` | How many results to skip. A negative or non-number value becomes `0`. |

```bash
curl "localhost:3000/api/functions?search=init"
```

```json
{
  "total": 2,
  "items": [
    { "id": "b.js#init", "name": "init", "owner": null, "kind": "function", "line": 1, "endLine": 3, "file": "b.js" },
    { "id": "c.js#init", "name": "init", "owner": null, "kind": "function", "line": 1, "endLine": 3, "file": "c.js" }
  ]
}
```

- `total` is the number of matches **before** paging, so a page of 50 can still say `total: 130`.
- `kind` is `function`, `method` or `callback`. `owner` is the class or object name for methods, otherwise `null`.
- `line` and `endLine` are where the function starts and ends in its file (counting from 1).

`409` when no project is analyzed.

## `GET /api/function`

One function, with its source code.

| Query | Meaning |
| --- | --- |
| `id` | Required. The function id, for example `b.js#init`. |

Write the `#` in an id as `%23` in the URL, because `#` starts a fragment in a URL.

```bash
curl "localhost:3000/api/function?id=b.js%23init"
```

```json
{
  "id": "b.js#init",
  "name": "init",
  "owner": null,
  "kind": "function",
  "line": 1,
  "endLine": 3,
  "file": "b.js",
  "source": "export function init() {\n  return helper();\n}"
}
```

`source` holds only the lines of that function (`line` to `endLine`), read from the file when you ask.

`400` when `id` is missing, `404` when no function has that id, `409` when no project is analyzed.

## `GET /api/callees` and `GET /api/callers`

What does a function call, and who calls it. They use the [Graph](graph.md) built when the project was analyzed.

| Query | Default | Meaning |
| --- | --- | --- |
| `id` | required | The function id, for example `main.js#main` (write `#` as `%23`). |
| `depth` | `1` | How many levels to follow, from 1 to 5. `1` is direct calls only. A missing or invalid value becomes `1`. |

```bash
curl "localhost:3000/api/callees?id=main.js%23main"
```

```json
{
  "id": "main.js#main",
  "depth": 1,
  "items": [
    { "caller": "main.js#main", "callee": "c.js#init", "line": 4, "kind": "call", "confidence": "certain", "file": "main.js", "depth": 1 },
    { "caller": "main.js#main", "callee": "c.js#helper", "line": 5, "kind": "call", "confidence": "certain", "file": "main.js", "depth": 1 }
  ]
}
```

- Each item is one call: who made it (`caller`), what it reached (`callee`), the `line` and `file` where it is written, and its `depth` (1 is direct, 2 is one step further).
- `confidence` is `"certain"` when the link is sure, and `"guess"` when only a name matched (for example a call like `obj.save()` on an object of unknown type). Filter on it if you want only sure links.
- `kind` is `call` (`foo()`), `new` (`new Foo()`) or `ref` (a function passed by name).
- A function that calls nothing (or that nobody calls) gives `"items": []`.

`400` when `id` is missing, `404` when no function has that id, `409` when no project is analyzed.

## `GET /api/path`

The shortest chain of calls from one function to another.

| Query | Default | Meaning |
| --- | --- | --- |
| `from` | required | Id of the function to start from. |
| `to` | required | Id of the function to reach. |
| `maxDepth` | `10` | Give up after this many calls in a row, from 1 to 20. |

```bash
curl "localhost:3000/api/path?from=b.js%23init&to=b.js%23helper"
```

```json
{ "from": "b.js#init", "to": "b.js#helper", "path": ["b.js#init", "b.js#helper"] }
```

`path` lists every function on the way, including both ends. It is `null` when there is no chain within `maxDepth`, and `[from]` when `from` and `to` are the same function. A `null` does not prove the two are unrelated, because calls that happen while the program runs cannot be seen.

`400` when `from` or `to` is missing, `404` when either id does not exist, `409` when no project is analyzed.

## Not built yet

- Login or an API key. The API has no users, so anyone who can reach the port can use it. Keep it on your own computer, or behind something that adds a login, and set `ALLOWED_ROOTS`.
