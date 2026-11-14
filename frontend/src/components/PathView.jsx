import { useEffect, useState } from "react";

import { findPath } from "../api.js";
import { fileOf, nameOf } from "../functionId.js";
import FunctionPicker from "./ui/FunctionPicker.jsx";

// Pick two functions and see the shortest chain of calls between them.
export default function PathView({ selectedId, onSelect, projectKey, externalFrom, externalTo }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Sync when the graph context menu sets a value.
  useEffect(() => { if (externalFrom) setFrom(externalFrom); }, [externalFrom]);
  useEffect(() => { if (externalTo) setTo(externalTo); }, [externalTo]);
  const [result, setResult] = useState(null); // { from, to, path } from the API
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await findPath(from.trim(), to.trim()));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <span className="section-label">path</span>
      <h2 style={{ fontSize: "1.25rem", margin: "4px 0 14px" }}>how does one function reach another?</h2>

      <form onSubmit={search}>
        <div className="picker-row">
          <FunctionPicker label="from" value={from} onChange={setFrom} projectKey={projectKey} />
          <FunctionPicker label="to" value={to} onChange={setTo} projectKey={projectKey} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="submit" className="btn" disabled={loading || !from.trim() || !to.trim()}>
            {loading ? "searching..." : "find path"}
          </button>
          {selectedId && (
            <>
              <button type="button" className="btn ghost" onClick={() => setFrom(selectedId)}>
                use selected as from
              </button>
              <button type="button" className="btn ghost" onClick={() => setTo(selectedId)}>
                use selected as to
              </button>
            </>
          )}
        </div>
      </form>

      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}

      {result && result.path === null && (
        <p className="message">
          no chain of calls found. this does not prove the functions are unrelated: calls that
          happen while the program runs (like handlers[name]()) cannot be seen.
        </p>
      )}

      {result && result.path && (
        <>
          <h3 className="block-title">
            {result.path.length === 1 ? "same function" : `${result.path.length - 1} call${result.path.length === 2 ? "" : "s"} apart`}
          </h3>
          <div className="chain">
            {result.path.map((id, index) => (
              <span key={id} style={{ display: "contents" }}>
                {index > 0 && <span className="arrow" aria-hidden="true">→</span>}
                <button type="button" className="chain-step" onClick={() => onSelect(id)} title="open this function">
                  <b>{nameOf(id)}</b>
                  <small>{fileOf(id)}</small>
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
