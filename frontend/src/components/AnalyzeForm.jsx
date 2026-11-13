import { useState } from "react";

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
// `onAnalyzed` receives { folder, files, functions, errors, repo? } when it works.
export default function AnalyzeForm({ project, onAnalyzed }) {
  const [folder, setFolder] = useState(savedFolder);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const trimmed = folder.trim();
    if (trimmed === "") {
      setError("enter a folder path or a github link");
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
          <label htmlFor="folder">folder path or github link</label>
          <input
            id="folder"
            className="input"
            value={folder}
            placeholder="d:/projects/my-app  or  https://github.com/owner/repo"
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
          a folder is read from the server's computer. a public github repository is downloaded
          first (this can take a few seconds). to pick a branch use .../tree/branch-name.
        </p>
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
