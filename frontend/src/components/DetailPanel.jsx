import { useEffect, useState } from "react";

import { getCallees, getCallers, getFunction } from "../api.js";
import { fileOf, nameOf } from "../functionId.js";
import CallList from "./ui/CallList.jsx";
import CodeBlock from "./ui/CodeBlock.jsx";

// Everything about one function: its source, who calls it, and what it calls.
export default function DetailPanel({ id, onSelect }) {
  const [detail, setDetail] = useState(null);
  const [callers, setCallers] = useState([]);
  const [callees, setCallees] = useState([]);
  const [error, setError] = useState("");

  // Load the three things at once whenever another function is selected.
  useEffect(() => {
    let cancelled = false;
    setError("");

    Promise.all([getFunction(id), getCallers(id), getCallees(id)])
      .then(([fn, up, down]) => {
        if (cancelled) return;
        setDetail(fn);
        setCallers(up.items);
        setCallees(down.items);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught.message);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <p className="message error" role="alert">
        {error}
      </p>
    );
  }
  // Show nothing until the data for THIS id has arrived (avoids flashing the old function).
  if (!detail || detail.id !== id) {
    return <div className="empty"><span className="spinner" aria-label="loading" /></div>;
  }

  return (
    <>
      <div className="detail-head">
        <span className="section-label">function</span>
        <h2>{nameOf(detail.id)}</h2>
        <div className="meta">
          <span>{fileOf(detail.id)}</span>
          <span>
            lines {detail.line}–{detail.endLine}
          </span>
          <span className={`pill ${detail.kind}`}>{detail.kind}</span>
          {detail.owner && <span className="pill">in {detail.owner}</span>}
        </div>
      </div>

      <h3 className="block-title">source</h3>
      <CodeBlock source={detail.source} startLine={detail.line} />

      <div className="columns">
        <div>
          <h3 className="block-title">called from ({callers.length})</h3>
          <div className="box">
            <CallList edges={callers} direction="callers" onSelect={onSelect} emptyText="nobody calls this function" />
          </div>
        </div>
        <div>
          <h3 className="block-title">calls ({callees.length})</h3>
          <div className="box">
            <CallList edges={callees} direction="callees" onSelect={onSelect} emptyText="this function calls nothing we can see" />
          </div>
        </div>
      </div>
    </>
  );
}
