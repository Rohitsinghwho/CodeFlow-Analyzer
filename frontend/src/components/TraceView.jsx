import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";

import { getTrace } from "../api.js";
import { fileOf, isTopLevel, nameOf } from "../functionId.js";
import FunctionPicker from "./ui/FunctionPicker.jsx";

cytoscape.use(dagre);

// ---- Helpers ----

function colorForFile(file) {
  let hash = 0;
  for (const ch of file) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash}, 55%, 40%)`;
}

// Build Cytoscape elements from a list of trace steps.
function buildTraceElements(steps) {
  const nodes = new Map();
  const edges = new Map();

  for (const step of steps) {
    if (!nodes.has(step.node)) {
      const file = fileOf(step.node);
      nodes.set(step.node, {
        data: {
          id: step.node,
          label: `${nameOf(step.node)}\n${file}`,
          file,
          color: colorForFile(file),
          order: step.order,
        },
      });
    }
    if (step.from && step.edge) {
      const key = `${step.from} -> ${step.node}`;
      if (!edges.has(key)) {
        edges.set(key, {
          data: {
            id: key,
            source: step.from,
            target: step.node,
            confidence: step.edge.confidence ?? "certain",
          },
        });
      }
    }
  }

  return [...nodes.values(), ...edges.values()];
}

// ---- Cytoscape styles ----

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
        opacity: 0.35,
      },
    },
    // The start node is always bright.
    {
      selector: "node.trace-start",
      style: {
        opacity: 1,
        "border-width": 3,
        "border-color": color("--code-green-bright"),
        "font-weight": "bold",
      },
    },
    // Nodes waiting to be reached are dimmed.
    {
      selector: "node.trace-waiting",
      style: { opacity: 0.35 },
    },
    // The current node "lights up" — the electricity is here now.
    {
      selector: "node.trace-active",
      style: {
        opacity: 1,
        "border-width": 3,
        "border-color": "#00ff88",
        "background-color": "#00cc66",
      },
    },
    // Nodes already visited glow softly.
    {
      selector: "node.trace-done",
      style: {
        opacity: 0.85,
        "border-width": 2,
        "border-color": "#22aa55",
      },
    },
    // Breakpoint marker.
    {
      selector: "node.trace-breakpoint",
      style: {
        "border-color": "#ff4444",
        "border-width": 3,
      },
    },
    // Paused on breakpoint.
    {
      selector: "node.trace-paused",
      style: {
        opacity: 1,
        "border-color": "#ff4444",
        "background-color": "#cc3333",
        "border-width": 4,
      },
    },
    // Edges: default dim.
    {
      selector: "edge",
      style: {
        width: 1.6,
        "line-color": color("--base-neutral"),
        "target-arrow-color": color("--base-neutral"),
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        opacity: 0.25,
      },
    },
    // Edge being traversed — the "electricity" is on this wire.
    {
      selector: "edge.trace-active",
      style: {
        width: 3,
        "line-color": "#00ff88",
        "target-arrow-color": "#00ff88",
        opacity: 1,
      },
    },
    // Edge already traversed.
    {
      selector: "edge.trace-done",
      style: {
        width: 2,
        "line-color": "#22aa55",
        "target-arrow-color": "#22aa55",
        opacity: 0.7,
      },
    },
    {
      selector: "edge[confidence = 'guess']",
      style: { "line-style": "dashed" },
    },
  ];
}

// ---- Speed presets ----
const SPEEDS = [
  { label: "0.5×", ms: 1200 },
  { label: "1×", ms: 600 },
  { label: "2×", ms: 300 },
  { label: "4×", ms: 150 },
];

// ---- Component ----

export default function TraceView({ selectedId, onSelect, theme, projectKey, externalFrom, externalTo }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Picker inputs.
  const [fromInput, setFromInput] = useState(selectedId ?? "");
  const [toInput, setToInput] = useState("");

  // Trace state.
  const [steps, setSteps] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Animation state.
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1); // -1 = not started
  const [speedIdx, setSpeedIdx] = useState(1); // default 1× (600ms)
  const [breakpoints, setBreakpoints] = useState(new Set());
  const [paused, setPaused] = useState(false); // paused on breakpoint

  const animRef = useRef(null); // setTimeout id

  // Keep fromInput in sync with selectedId from outside.
  useEffect(() => {
    if (selectedId) setFromInput(selectedId);
  }, [selectedId]);

  // Sync when the graph context menu sets a value.
  useEffect(() => { if (externalFrom) setFromInput(externalFrom); }, [externalFrom]);
  useEffect(() => { if (externalTo) setToInput(externalTo); }, [externalTo]);

  // ---- Create / destroy Cytoscape ----
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

    // Right-click a node to toggle breakpoint, left-click to navigate.
    cy.on("tap", "node", (e) => {
      const nodeId = e.target.id();
      if (!isTopLevel(nodeId)) onSelectRef.current(nodeId);
    });
    cy.on("cxttap", "node", (e) => {
      e.preventDefault();
      const nodeId = e.target.id();
      setBreakpoints((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
          e.target.removeClass("trace-breakpoint");
        } else {
          next.add(nodeId);
          e.target.addClass("trace-breakpoint");
        }
        return next;
      });
    });

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

  // Repaint on theme change.
  useEffect(() => {
    cyRef.current?.style(buildStyle());
  }, [theme]);

  // ---- Fetch trace ----
  const runTrace = useCallback(() => {
    if (!fromInput) return;
    setLoading(true);
    setError("");
    setSteps(null);
    setCurrentStep(-1);
    setPlaying(false);
    setPaused(false);
    clearTimeout(animRef.current);

    getTrace(fromInput, toInput || undefined)
      .then((result) => {
        setSteps(result.steps);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [fromInput, toInput]);

  // ---- Draw graph when steps arrive ----
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !steps || steps.length === 0) return;

    const elements = buildTraceElements(steps);
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: "dagre", rankDir: "LR", nodeSep: 24, rankSep: 80, animate: false }).run();
    cy.fit(undefined, 30);

    // Mark everything as waiting, start node as start.
    cy.nodes().addClass("trace-waiting");
    const startNode = cy.getElementById(steps[0].node);
    if (startNode.length) {
      startNode.removeClass("trace-waiting").addClass("trace-start");
    }

    // Re-apply breakpoints.
    for (const bp of breakpoints) {
      const n = cy.getElementById(bp);
      if (n.length) n.addClass("trace-breakpoint");
    }
  }, [steps]);

  // ---- Animation engine ----
  const advanceTo = useCallback(
    (stepIdx) => {
      const cy = cyRef.current;
      if (!cy || !steps) return;

      // Clear previous active highlights.
      cy.elements(".trace-active").removeClass("trace-active");
      cy.nodes(".trace-paused").removeClass("trace-paused");

      // Mark everything up to stepIdx as done.
      for (let i = 0; i <= stepIdx; i++) {
        const step = steps[i];
        const node = cy.getElementById(step.node);
        if (node.length) {
          node.removeClass("trace-waiting").addClass("trace-done");
        }
        if (step.from) {
          const edgeId = `${step.from} -> ${step.node}`;
          const edge = cy.getElementById(edgeId);
          if (edge.length) edge.addClass("trace-done");
        }
      }

      // Current step gets the active glow.
      const current = steps[stepIdx];
      if (current) {
        const node = cy.getElementById(current.node);
        if (node.length) {
          node.removeClass("trace-done trace-waiting").addClass("trace-active");
          // Pan to keep it visible.
          cy.animate({ center: { eles: node }, duration: 200 });
        }
        if (current.from) {
          const edgeId = `${current.from} -> ${current.node}`;
          const edge = cy.getElementById(edgeId);
          if (edge.length) edge.removeClass("trace-done").addClass("trace-active");
        }
      }

      setCurrentStep(stepIdx);
    },
    [steps],
  );

  // Play loop.
  useEffect(() => {
    if (!playing || !steps || paused) return;

    const nextIdx = currentStep + 1;
    if (nextIdx >= steps.length) {
      setPlaying(false);
      return;
    }

    animRef.current = setTimeout(() => {
      // Check for breakpoint.
      const nextNode = steps[nextIdx].node;
      if (breakpoints.has(nextNode) && nextIdx > 0) {
        advanceTo(nextIdx);
        setPaused(true);
        setPlaying(false);
        // Mark as paused (red glow).
        const cy = cyRef.current;
        const n = cy?.getElementById(nextNode);
        if (n?.length) n.addClass("trace-paused");
        return;
      }

      advanceTo(nextIdx);
    }, SPEEDS[speedIdx].ms);

    return () => clearTimeout(animRef.current);
  }, [playing, currentStep, steps, speedIdx, breakpoints, paused, advanceTo]);

  // ---- Controls ----
  const handlePlay = () => {
    if (!steps || steps.length === 0) return;
    if (paused) {
      setPaused(false);
      setPlaying(true);
      return;
    }
    if (currentStep >= steps.length - 1) {
      // Restart.
      setCurrentStep(-1);
      const cy = cyRef.current;
      cy?.elements().removeClass("trace-active trace-done trace-paused");
      cy?.nodes().addClass("trace-waiting");
      const startNode = cy?.getElementById(steps[0].node);
      if (startNode?.length) startNode.removeClass("trace-waiting").addClass("trace-start");
    }
    setPlaying(true);
  };

  const handlePause = () => {
    setPlaying(false);
    clearTimeout(animRef.current);
  };

  const handleStep = () => {
    if (!steps) return;
    setPlaying(false);
    setPaused(false);
    clearTimeout(animRef.current);
    const next = Math.min(currentStep + 1, steps.length - 1);
    advanceTo(next);
  };

  const handleReset = () => {
    setPlaying(false);
    setPaused(false);
    setCurrentStep(-1);
    clearTimeout(animRef.current);
    const cy = cyRef.current;
    if (cy && steps) {
      cy.elements().removeClass("trace-active trace-done trace-paused");
      cy.nodes().addClass("trace-waiting");
      const startNode = cy.getElementById(steps[0].node);
      if (startNode?.length) startNode.removeClass("trace-waiting").addClass("trace-start");
    }
  };

  const fitGraph = () => cyRef.current?.fit(undefined, 30);

  const progress = steps ? `${Math.max(0, currentStep + 1)} / ${steps.length}` : "—";
  const currentName = steps && currentStep >= 0 ? nameOf(steps[currentStep].node) : "—";

  return (
    <div className="trace-wrap">
      {/* Setup bar */}
      <div className="trace-setup">
        <FunctionPicker
          label="from"
          value={fromInput}
          onChange={setFromInput}
          projectKey={projectKey}
        />
        <FunctionPicker
          label="to (optional)"
          value={toInput}
          onChange={setToInput}
          projectKey={projectKey}
        />
        <button
          type="button"
          className="btn primary small"
          onClick={runTrace}
          disabled={!fromInput || loading}
        >
          {loading ? "tracing…" : "trace"}
        </button>
      </div>

      {error && <div className="trace-error">{error}</div>}

      {/* Debug controls */}
      {steps && (
        <div className="trace-controls">
          <div className="trace-buttons">
            {playing ? (
              <button type="button" className="btn ghost small" onClick={handlePause} title="Pause">
                ⏸
              </button>
            ) : (
              <button type="button" className="btn ghost small" onClick={handlePlay} title="Play">
                ▶
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={handleStep} title="Step">
              ⏭
            </button>
            <button type="button" className="btn ghost small" onClick={handleReset} title="Reset">
              ⏮
            </button>
            <button type="button" className="btn ghost small" onClick={fitGraph} title="Fit to view">
              ⊞
            </button>
          </div>

          <div className="trace-speed">
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                className={`btn ghost small ${i === speedIdx ? "active" : ""}`}
                onClick={() => setSpeedIdx(i)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="trace-info">
            <span className="trace-progress">{progress}</span>
            <span className="trace-current" title="current function">{currentName}</span>
            {paused && <span className="trace-badge paused">breakpoint</span>}
            {breakpoints.size > 0 && (
              <span className="trace-badge">{breakpoints.size} bp</span>
            )}
          </div>
        </div>
      )}

      {/* Graph canvas */}
      <div className="graph-canvas">
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {loading && (
          <div className="overlay">
            <span className="spinner" aria-label="loading" />
          </div>
        )}
        {!steps && !loading && !error && (
          <div className="overlay">
            pick a start function and press trace to see the flow
          </div>
        )}
      </div>

      {/* Hint */}
      {steps && (
        <div className="trace-hint">
          right-click a node to toggle breakpoint · left-click to inspect
        </div>
      )}
    </div>
  );
}
