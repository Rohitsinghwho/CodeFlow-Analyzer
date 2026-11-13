import { useEffect, useState } from "react";

import { analyze, isGitHubLink } from "../api.js";
import Panel from "./ui/Panel.jsx";

const STORAGE_KEY = "codeflow.folder";

// Remember the last folder, so you do not retype it. Storage can fail, so be careful.
function savedFolder() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// Step 1 of using the app: tell the server which project to read. It can be a
// folder on the server's computer or a GitHub link (the server downloads it).
// `config` says what the server allows (a public server only accepts GitHub links).
// `onAnalyzed` receives { folder, files, functions, errors, repo? } when it works.
export default function AnalyzeForm({ project, config, onAnalyzed }) {
  const [folder, setFolder] = useState(savedFolder);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");

  const githubOnly = !config.allowLocalPaths;

  // Free hosting puts a server to sleep when nobody uses it, and waking it takes
  // up to a minute. Tell the visitor, so they do not think it is broken.
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, [loading]);

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = folder.trim();
    if (trimmed === "") {
      setError(githubOnly ? "paste a github link" : "enter a folder path or a github link");
      return;
    }
    if (githubOnly && !isGitHubLink(trimmed)) {
      setError("this server only analyzes public github repositories. paste a link like https://github.com/owner/name");
      return;
    }
    if (!config.allowGithub && isGitHubLink(trimmed)) {
      setError("downloading from github is turned off on this server");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await analyze(trimmed);
      try {
        localStorage.setItem(STORAGE_KEY, trimmed);
      } catch {
        // Not saving the folder is fine.
      }
      onAnalyzed({ folder: trimmed, ...result });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="project">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="folder">{githubOnly ? "github link" : "folder path or github link"}</label>
          <input
            id="folder"
            className="input"
            value={folder}
            placeholder={githubOnly ? "https://github.com/owner/repo" : "d:/projects/my-app  or  https://github.com/owner/repo"}
            spellCheck={false}
            onChange={(event) => setFolder(event.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : null}
          {loading
            ? isGitHubLink(folder)
              ? "downloading and analyzing..."
              : "analyzing..."
            : project
              ? "analyze again"
              : "analyze"}
        </button>
        <p className="hint">
          {githubOnly ? "" : "a folder is read from the server's computer. "}
          a public github repository is downloaded first (this can take a few seconds). to pick a
          branch use .../tree/branch-name.
        </p>
        {slow && (
          <p className="hint" role="status">
            still working... if the server was asleep it can take up to a minute to wake up.
          </p>
        )}
      </form>

      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}

      {project && (
        <>
          <div className="stats">
            <div className="stat">
              <b>{project.files}</b>
              <span>files</span>
            </div>
            <div className="stat">
              <b>{project.functions}</b>
              <span>functions</span>
            </div>
            <div className={`stat${project.errors.length > 0 ? " bad" : ""}`}>
              <b>{project.errors.length}</b>
              <span>parse errors</span>
            </div>
          </div>

          {project.errors.length > 0 && (
            <details className="parse-errors">
              <summary>files that could not be read</summary>
              <ul>
                {project.errors.map((item) => (
                  <li key={item.file}>
                    {item.file}: {item.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}
