# Deployment

CodeFlow runs in two places:

| Part | Where | Why |
| --- | --- | --- |
| Web interface (`frontend/`) | **GitHub Pages** | It is static files after `npm run build`, so free static hosting is enough |
| API (`backend/`) | **Render** (Docker) | It is a real server and needs `git` to download repositories |

```
visitor's browser ──► GitHub Pages   (the page, from https://<user>.github.io/<repo>/)
        │
        └──► Render API (https://<name>.onrender.com)   downloads repositories from github.com
```

Everything needed is already in the repository:

| File | What it does |
| --- | --- |
| `backend/Dockerfile`, `backend/.dockerignore` | Builds the API image: Node 22, plus `git`, runs as a normal user |
| `render.yaml` | Describes the Render service, so it can be created from the repository |
| `.github/workflows/deploy-frontend.yml` | Builds the frontend and publishes it to GitHub Pages on every push to `main` |
| `.github/workflows/ci.yml` | Runs the backend tests and the frontend build on pull requests and on `main` |

What is left are the steps that need your accounts. Do them in this order.

## Before you start

1. Merge the `feat/deploy-ready` branch into `main` and push it. Both hosts deploy from `main`.
2. Make sure the repository is **public**. Free GitHub Pages needs that.
3. Check that the CI run (the **Actions** tab) is green.

## Step 1: deploy the API on Render

1. Sign in at [render.com](https://render.com) with your GitHub account.
2. Choose **New → Blueprint**, pick this repository, and approve. Render reads `render.yaml` and creates a service called `codeflow-api`. (If you prefer to click it together by hand: **New → Web Service**, runtime **Docker**, root directory `backend`, health check path `/api/health`, and add the variables from the table below.)
3. Wait for the first deploy to finish. You get an address like `https://codeflow-api.onrender.com`.
4. Open `https://<your-service>.onrender.com/api/health`. It must show `{"ok":true}`.
5. Open `https://<your-service>.onrender.com/api/config`. It must show `{"allowLocalPaths":false,"allowGithub":true}`.

The blueprint already sets `CORS_ORIGIN` to `https://rohitsinghwho.github.io`. If your GitHub name is different, change it in the Render dashboard (**Environment**). It is the address of the *site only*, with no path and no trailing slash.

## Step 2: tell the frontend where the API is

1. In GitHub: your repository → **Settings → Secrets and variables → Actions → Variables → New repository variable**.
2. Name `VITE_API_URL`, value your Render address, for example `https://codeflow-api.onrender.com` (no trailing slash).

## Step 3: publish the frontend on GitHub Pages

1. Repository → **Settings → Pages**. Under **Build and deployment → Source** choose **GitHub Actions**.
2. Open the **Actions** tab, choose **Deploy frontend**, and press **Run workflow** (it also runs by itself on every push to `main` that changes `frontend/`).
3. When it is green, your site is at `https://<your-github-name>.github.io/<repository-name>/`, for example `https://rohitsinghwho.github.io/CodeFlow-Analyzer/`.

## Step 4: check that everything works

- Open the site. The box says **github link**, not "folder path".
- Paste a small public repository, for example `https://github.com/octocat/Hello-World`, and press analyze. The first request can take up to a minute while a sleeping free server wakes up (the page says so).
- Open the function list, a function's details, the graph (try zoom) and the path view.
- Open the site in a second browser (or a private window), analyze a different repository there, and check that the first one still shows its own project.
- Switch dark and light mode.

If the page says `cannot reach the api`, see [Troubleshooting](#troubleshooting).

## Settings of the API

Set these in the Render dashboard (**Environment**). The full list with defaults is in [api.md](api.md#settings).

| Setting | In `render.yaml` | Why |
| --- | --- | --- |
| `CORS_ORIGIN` | `https://rohitsinghwho.github.io` | Only your site may call the API from a browser |
| `ALLOW_LOCAL_PATHS` | `false` (also set in the Dockerfile) | Strangers must not read the server's own folders |
| `MAX_REPO_MB` | `100` | A free server has little disk and memory |
| `MAX_FILES` | `2000` | Same reason |
| `MAX_DOWNLOADS` | `1` | One download at a time on a small server |
| `MAX_PROJECTS` | `10` | Each analyzed project is kept in memory |

Defaults that stay as they are: 30 analyze requests per visitor in 10 minutes, a project is forgotten after 30 idle minutes, and a download that takes longer than 60 seconds is stopped.

## How it is protected

| Risk | Protection |
| --- | --- |
| A visitor reading the server's files | `ALLOW_LOCAL_PATHS=false`; downloads are only from `github.com` and go to a temp folder |
| Visitors seeing or replacing each other's project | One project per visitor, found by a random `X-Project-Id` |
| Running out of memory | Limits on projects, files per project, and the size of a repository; unused projects are forgotten |
| Running out of disk | A downloaded repository over the size limit is deleted; downloads are deleted when replaced, and on server start and stop |
| Being used as a free download service | At most `MAX_DOWNLOADS` at once, a 60-second timeout, and a rate limit per IP address |
| Other websites using the API from a visitor's browser | CORS allows only `CORS_ORIGIN` |
| Running code from a repository | Never. Files are only read and parsed |

What it does **not** have: logins. Anyone with the link can use it, within the limits above. A private repository cannot be analyzed.

## Good to know

- **Cold starts.** On Render's free plan the API sleeps after about 15 minutes without requests and needs up to a minute to wake up. The web interface shows a message after a few seconds of waiting.
- **Memory only.** Projects are kept in memory, so a restart or a sleep forgets them. Visitors simply analyze again.
- **Memory size.** The free plan has about 512 MB. A very large project can still run out of memory even within the limits. If that happens, lower `MAX_FILES` or move to a bigger plan.
- **Other hosts.** The Dockerfile works on any Docker host (Fly.io, Railway, a VPS). Run the image with the same settings and give it a `PORT`. Keep `git` in the image.

## Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| `cannot reach the api` right after opening the site | The API is asleep: wait a minute and try again. Otherwise `VITE_API_URL` is wrong: fix the variable and run the **Deploy frontend** workflow again |
| The browser console shows a CORS error | `CORS_ORIGIN` on Render does not match the site address exactly. It must be `https://<name>.github.io` with no path and no trailing slash |
| The site is blank or its files give 404 | The Pages build used the wrong base path. The workflow sets it from the repository name; run it again after renaming a repository |
| `repository (or branch) not found` | The repository is private, misspelled, or the branch does not exist |
| `repository is too large` or `too many files` | The project is over `MAX_REPO_MB` or `MAX_FILES` |
| `too many analyses` | The rate limit. Wait for the time in the message |
| The first analysis of a big repository times out | The download is stopped after 60 seconds. Try a smaller repository |
| Render says the build failed | Open the build log. The image needs the whole `backend/` folder, including `package-lock.json` |

## Running the image yourself

```bash
docker build -t codeflow-api backend
docker run --rm -p 3000:3000 -e CORS_ORIGIN=http://localhost:5173 codeflow-api
```

Then run the frontend locally with `npm run dev` in `frontend/`, and it talks to `http://localhost:3000`.
