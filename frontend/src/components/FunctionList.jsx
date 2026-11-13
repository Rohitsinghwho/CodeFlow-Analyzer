import { useEffect, useState } from "react";

import { listFunctions } from "../api.js";
import { fileOf, nameOf } from "../functionId.js";
import { useDebounced } from "../hooks/useDebounced.js";
import Panel from "./ui/Panel.jsx";

const PAGE_SIZE = 50;

// Searchable list of every function in the project.
// `projectKey` changes whenever a new analysis happens, which reloads the list.
export default function FunctionList({ projectKey, selectedId, onSelect }) {
  const [search, setSearch] = useState("");
  const [file, setFile] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Wait until you stop typing before asking the server.
  const debouncedSearch = useDebounced(search);
  const debouncedFile = useDebounced(file);

  // Load the first page whenever the filters or the project change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listFunctions({ search: debouncedSearch, file: debouncedFile, limit: PAGE_SIZE, offset: 0 })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // If the filters change again before the answer arrives, ignore the old answer.
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, debouncedFile, projectKey]);

  // Add the next page to the end of the list.
  const loadMore = async () => {
    setLoading(true);
    try {
      const result = await listFunctions({
        search: debouncedSearch,
        file: debouncedFile,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((previous) => [...previous, ...result.items]);
      setTotal(result.total);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title={`functions (${total})`} grow flush>
      <div style={{ padding: 14, borderBottom: "1px solid var(--base-border)" }}>
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="search">search by name, class or file</label>
          <input
            id="search"
            className="input"
            value={search}
            placeholder="init"
            spellCheck={false}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="file-filter">only files starting with</label>
          <input
            id="file-filter"
            className="input"
            value={file}
            placeholder="utils/"
            spellCheck={false}
            onChange={(event) => setFile(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <p className="message error" role="alert" style={{ margin: 12 }}>
          {error}
        </p>
      )}

      {!error && items.length === 0 && !loading && <p className="empty">no functions match</p>}

      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="list-item"
              aria-current={item.id === selectedId}
              onClick={() => onSelect(item.id)}
            >
              <span className="name">
                {nameOf(item.id)}
                {item.kind !== "function" && <span className={`pill ${item.kind}`}>{item.kind}</span>}
              </span>
              <span className="where">
                {fileOf(item.id)}:{item.line}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {items.length < total && (
        <div className="list-footer">
          <button type="button" className="btn ghost small" onClick={loadMore} disabled={loading}>
            {loading ? "loading..." : `load more (${total - items.length} left)`}
          </button>
        </div>
      )}
    </Panel>
  );
}
