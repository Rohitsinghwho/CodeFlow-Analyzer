import { fileOf, isTopLevel, nameOf } from "../../functionId.js";

// A list of calls. Each row is a function you can click to open it.
//
// `edges` come from the API. `direction` says which end of an edge to show:
//   "callers" -> show the function that makes the call (edge.caller)
//   "callees" -> show the function that is called (edge.callee)
// Each row also shows where the call is written (file:line).
export default function CallList({ edges, direction, onSelect, emptyText }) {
  if (edges.length === 0) {
    return <p className="empty">{emptyText}</p>;
  }

  return (
    <ul className="list">
      {edges.map((edge, index) => {
        const id = direction === "callers" ? edge.caller : edge.callee;
        const callSite = `${edge.file}:${edge.line}`;
        const content = (
          <>
            <span className="name">
              {nameOf(id)}
              {edge.confidence === "guess" && (
                <span className="pill guess" title="matched by name only, so it may be wrong">guess</span>
              )}
            </span>
            <span className="where">
              {fileOf(id)} · call at {callSite}
            </span>
          </>
        );

        // Code outside any function cannot be opened, so it is shown but not clickable.
        if (isTopLevel(id)) {
          return (
            <li key={`${id}-${edge.line}-${index}`}>
              <div className="list-item static">{content}</div>
            </li>
          );
        }
        return (
          <li key={`${id}-${edge.line}-${index}`}>
            <button type="button" className="list-item" onClick={() => onSelect(id)}>
              {content}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
