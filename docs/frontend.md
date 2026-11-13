# Frontend

The web interface for CodeFlow, in `frontend/`. It is a React app built with
Vite, and it only talks to the [HTTP API](api.md). It has a dark and a light
mode, and its look (code-editor window frames, the fonts and the green glow
background) is borrowed from a developer-portfolio style.

## Run it

You need the backend running too.

```bash
# terminal 1: the API on http://localhost:3000
cd backend
npm start

# terminal 2: the web interface on http://localhost:5173
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>, type the path of a project folder (on the machine
where the backend runs) **or paste a GitHub link**, and press **analyze**.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with live reload, always on port 5173 |
| `npm run build` | Production build into `frontend/dist/` |
| `npm run preview` | Serve the production build locally |

### Settings

Copy `frontend/.env.example` to `frontend/.env` to change a setting.

| Setting | Default | Meaning |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | Address of the backend |

The dev server is locked to port 5173 (`strictPort`), because that is the only
address the backend allows by default (`CORS_ORIGIN`). If you must use another
port, start the backend with `CORS_ORIGIN=http://localhost:<port>`.

## What you can do

1. **Analyze** a project. The box accepts a folder on the server's computer, or a link to a public GitHub repository such as `https://github.com/owner/name` (add `/tree/branch-name` for a branch). A GitHub project is downloaded by the server first, which can take a few seconds. The result shows files, functions and parse errors, and the status bar shows `github: owner/name`. Everything below works the same for both kinds. See [api.md](api.md#github-repositories) for what the server accepts.
2. **Search the function list** by name, class or file, and filter by folder. Long lists load 50 at a time.
3. **details:** the selected function's source (with line numbers and light syntax colors), what it is **called from** and what it **calls**. Every entry in those lists opens that function.
4. **graph:** the function in the middle, its callers on the left and its callees on the right, coloured by file. Choose a depth of 1 to 3 and hide the dashed *guess* links. Clicking a box opens that function. **Zoom** with the mouse wheel, the **+** and **−** buttons in the corner of the graph, and move the picture by dragging. The third button fits the whole graph back into view.
5. **path:** pick two functions (with suggestions while you type) and see the shortest chain of calls between them, or a clear message when there is none.
6. **Switch dark and light mode** with the button in the title bar. The choice is remembered, and the first visit follows your system setting.

A *guess* is a call matched only by name, for example `obj.save()` on an object
whose type is unknown. It is drawn dashed in the graph and tagged `guess` in lists.

## How it is built

```
frontend/
  index.html           sets the theme before the page paints (no flash), loads the fonts
  src/
    main.jsx           starts React
    App.jsx            holds the shared state: project, selected function, open tab
    api.js             the only file that calls the backend (decides folder vs GitHub link)
    functionId.js      splits ids like "a/b.js#Class.method" into file and name
    highlight.js       tiny syntax highlighter for the source view
    index.css          every color (dark and light), font and layout rule
    hooks/
      useTheme.js      dark / light mode, saved in localStorage
      useDebounced.js  waits until you stop typing before searching
    components/
      layout/          TitleBar, StatusBar
      ui/              Panel, ThemeToggle, CodeBlock, CallList, FunctionPicker, FloatingSymbol
      AnalyzeForm.jsx  FunctionList.jsx  DetailPanel.jsx
      GraphView.jsx    PathView.jsx      Welcome.jsx
```

- **State:** `App` owns three things, `project`, `selectedId` and `tab`, and passes them down as props. There is no state library, because nothing else is shared.
- **Data:** components call the functions in `api.js`; they never use `fetch` directly. A request that is replaced by a newer one is ignored, so a slow answer can never overwrite a fresh one.
- **Graph:** [Cytoscape.js](https://js.cytoscape.org) with the dagre layout (left to right). It is loaded only when you open the graph tab, which keeps the first download small. The graph reads its colors from the CSS variables, so it follows the theme.
- **Theme:** all colors are CSS variables in `index.css`. `:root[data-theme="light"]` overrides the dark values. `useTheme` sets `data-theme` on `<html>`.
- **Layout:** one window with a side column (project, function list) and a main panel. Below 1000px wide the columns stack.

## Not built yet

- Remembering the open function and tab after a page reload.
- A tree view of calls (expand and collapse), as an alternative to the graph.
- Tests for the frontend. The backend has tests; the interface was checked by hand in a browser.
