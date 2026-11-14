import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";

import { getCallees, getCallers } from "../api.js";
import { fileOf, isTopLevel, nameOf } from "../functionId.js";

// Lets Cytoscape arrange the boxes from left to right.
cytoscape.use(dagre);

// Each file gets its own color, so you can see when a call crosses into another file.
function colorForFile(file) {
  let hash = 0;
  for (const character of file) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return `hsl(${hash}, 55%, 40%)`;
}

// Turn the API's edges into the nodes and edges Cytoscape draws.
// The selected function is in the middle: callers feed into it, it feeds into callees.
function buildElements(centerId, callers, callees, showGuesses) {
  const nodes = new Map();
  const edges = new Map();

  const addNode = (id) => {
    if (nodes.has(id)) return;
    const file = fileOf(id);
    nodes.set(id, {
      data: {
        id,
        label: `${nameOf(id)}\n${file}`,
        file,
        color: colorForFile(file),
        center: id === centerId,
      },
    });
  };

  addNode(centerId);
  for (const edge of [...callers, ...callees]) {
    if (!showGuesses && edge.confidence === "guess") continue;

    addNode(edge.caller);
    addNode(edge.callee);

    // The same pair can be called on several lines. Draw one arrow, and keep "certain" if any call is.
    const key = `${edge.caller} -> ${edge.callee}`;
    const existing = edges.get(key);
    if (!existing || (existing.data.confidence === "guess" && edge.confidence === "certain")) {
      edges.set(key, {
        data: { id: key, source: edge.caller, target: edge.callee, confidence: edge.confidence },
      });
    }
  }

  return [...nodes.values(), ...edges.values()];
}

// Read the theme colors from CSS, so the graph follows dark and light mode.
function buildStyle() {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();

  return [
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        label: "data(label)",
        color: "#ffffff",
        "font-family": "JetBrains Mono, monospace",
        "font-size": 10,
        "text-wrap": "wrap",
        "text-valign": "center",
        "text-halign": "center",
        shape: "round-rectangle",
        width: "label",
        height: "label",
        padding: "10px",
        "border-width": 1,
        "border-color": color("--base-border"),
      },
    },
    {
      selector: "node[?center]",
      style: { "border-width": 3, "border-color": color("--code-green-bright"), "font-weight": "bold" },
    },
    {
      selector: "edge",
      style: {
        width: 1.6,
        "line-color": color("--base-neutral"),
        "target-arrow-color": color("--base-neutral"),
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
    {
      // Matched by name only, so draw it faint and dashed.
      selector: "edge[confidence = 'guess']",
      style: { "line-style": "dashed", opacity: 0.5 },
    },
  ];
}

// Graph of one function: callers on the left, callees on the right.
export default function GraphView({ id, onSelect, theme, onSetPathFrom, onSetPathTo, onSetTraceFrom, onSetTraceTo }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [depth, setDepth] = useState(1);
  const [showGuesses, setShowGuesses] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Context menu state.
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, nodeId }

  // Create the Cytoscape graph once, and remove it when this view goes away.
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: buildStyle(),
      wheelSensitivity: 0.3,
      minZoom: 0.2,
      maxZoom: 3,
    });
    cyRef.current = cy;

    // Clicking a box opens that function (code outside functions cannot be opened).
    cy.on("tap", "node", (event) => {
      const clickedId = event.target.id();
      if (!isTopLevel(clickedId)) onSelectRef.current(clickedId);
    });

    // Right-click a node to open context menu (only if it has ≥ 2 edges).
    cy.on("cxttap", "node", (event) => {
      const node = event.target;
      const edgeCount = node.connectedEdges().length;
      if (edgeCount < 2) return;
      const pos = event.renderedPosition || event.position;
      const rect = containerRef.current.getBoundingClientRect();
      setCtxMenu({ x: rect.left + pos.x, y: rect.top + pos.y, nodeId: node.id() });
    });

    // Close context menu when clicking on the canvas background.
    cy.on("tap", () => setCtxMenu(null));

    // Keep the picture fitted when the panel changes size.
    const observer = new ResizeObserver(() => {
      cy.resize();
      cy.fit(undefined, 30);
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Repaint with the new colors when dark or light mode changes.
  useEffect(() => {
    cyRef.current?.style(buildStyle());
  }, [theme]);

  // Ask the server for the callers and callees whenever the function or the depth changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([getCallers(id, depth), getCallees(id, depth)])
      .then(([up, down]) => {
        if (!cancelled) setData({ id, callers: up.items, callees: down.items });
      })
      .catch((caught) => {
        if (!cancelled) setError(caught.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, depth]);

  const elements = useMemo(
    () => (data ? buildElements(data.id, data.callers, data.callees, showGuesses) : []),
    [data, showGuesses],
  );

  // Draw: replace the old elements, lay them out left to right, and fit them in view.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "dagre", rankDir: "LR", nodeSep: 24, rankSep: 80, animate: false }).run();
    cy.fit(undefined, 30);
  }, [elements]);

  // Close context menu when clicking outside.
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [ctxMenu]);

  const ctxAction = (handler) => (event) => {
    event.stopPropagation();
    handler(ctxMenu.nodeId);
    setCtxMenu(null);
  };

  // Zoom buttons. They zoom around the middle of the canvas, like the mouse wheel does around the pointer.
  const zoomBy = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };
  const fitGraph = () => cyRef.current?.fit(undefined, 30);

  // The files shown in the graph, for the color legend.
  const files = useMemo(
    () => [...new Set(elements.filter((item) => item.data.file).map((item) => item.data.file))],
    [elements],
  );
  const alone = elements.length <= 1 && !loading && !error;

  return (
    <div className="graph-wrap">
      <div className="graph-controls">
        <span>
          <b style={{ color: "var(--base-content)", fontWeight: 500 }}>{nameOf(id)}</b> in the middle · callers on the left · callees on the right
        </span>
        <label>
          depth
          <select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={showGuesses} onChange={(event) => setShowGuesses(event.target.checked)} />
          show guesses (dashed)
        </label>
      </div>

      <div className="graph-canvas">
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {loading && (
          <div className="overlay">
            <span className="spinner" aria-label="loading" />
          </div>
        )}
        {error && (
          <div className="overlay">
            <span className="message error">{error}</span>
          </div>
        )}
        {alone && <div className="overlay">no calls to draw for this function</div>}

        <div className="zoom-controls">
          <button type="button" className="icon-btn" onClick={() => zoomBy(1.3)} aria-label="zoom in" title="zoom in">
            +
          </button>
          <button type="button" className="icon-btn" onClick={() => zoomBy(1 / 1.3)} aria-label="zoom out" title="zoom out">
            −
          </button>
          <button type="button" className="icon-btn" onClick={fitGraph} aria-label="fit graph to the view" title="fit to view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        </div>
        <span className="zoom-hint">scroll to zoom · drag to move · right-click node for options</span>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="graph-ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="graph-ctx-header">{nameOf(ctxMenu.nodeId)}</div>
          <button type="button" onClick={ctxAction(onSetPathFrom)}>📍 Set as path start</button>
          <button type="button" onClick={ctxAction(onSetPathTo)}>🏁 Set as path end</button>
          <hr />
          <button type="button" onClick={ctxAction(onSetTraceFrom)}>⚡ Set as trace start</button>
          <button type="button" onClick={ctxAction(onSetTraceTo)}>🎯 Set as trace end</button>
        </div>
      )}

      {files.length > 0 && (
        <div className="legend">
          <span>colored by file:</span>
          {files.map((file) => (
            <span key={file}>
              <i className="swatch" style={{ background: colorForFile(file) }} />
              {file}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
