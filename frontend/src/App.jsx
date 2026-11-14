import { lazy, Suspense, useEffect, useRef, useState } from "react";

import AnalyzeForm from "./components/AnalyzeForm.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import FunctionList from "./components/FunctionList.jsx";
import PathView from "./components/PathView.jsx";
import Welcome from "./components/Welcome.jsx";
import StatusBar from "./components/layout/StatusBar.jsx";
import TitleBar from "./components/layout/TitleBar.jsx";
import Panel from "./components/ui/Panel.jsx";
import { getConfig } from "./api.js";
import { useTheme } from "./hooks/useTheme.js";

// Heavy views are lazy-loaded — only downloaded the first time you open that tab.
const GraphView = lazy(() => import("./components/GraphView.jsx"));
const TraceView = lazy(() => import("./components/TraceView.jsx"));

const TABS = [
  { id: "details", label: "details" },
  { id: "graph", label: "graph" },
  { id: "path", label: "path" },
  { id: "trace", label: "⚡ trace" },
];

// The whole app. It holds the three things every part needs to share:
//   project    - what the server analyzed (null until you press analyze)
//   selectedId - the function you are looking at
//   tab        - which view is open on the right
export default function App() {
  const { theme, toggleTheme } = useTheme();
  // What the server allows. Until it answers, assume everything, and let the server say no.
  const [config, setConfig] = useState({ allowLocalPaths: true, allowGithub: true });
  const [project, setProject] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("details");
  // Changes on every analysis, so lists reload even if the folder is the same.
  const [projectKey, setProjectKey] = useState(0);

  // Shared state: right-click in the graph can set start/end for path and trace views.
  const [pathFrom, setPathFrom] = useState("");
  const [pathTo, setPathTo] = useState("");
  const [traceFrom, setTraceFrom] = useState("");
  const [traceTo, setTraceTo] = useState("");

  // Ask the server once what it allows (a public server turns folders off).
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {
        // If the server cannot be reached now, the analyze button shows the error later.
      });
  }, []);

  // On a phone or tablet the layout is one long column: the function list, then the main
  // panel. So choosing a function scrolls down to the main panel, and a button there
  // scrolls back up to the list.
  const sidebarRef = useRef(null);
  const mainRef = useRef(null);
  const isNarrow = () => window.matchMedia("(max-width: 1000px)").matches;

  const selectFunction = (id) => {
    setSelectedId(id);
    if (isNarrow()) {
      mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const scrollToList = () => sidebarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleAnalyzed = (result) => {
    setProject(result);
    setSelectedId(null);
    setProjectKey((key) => key + 1);
  };

  // The tab buttons live in the title bar of the right panel.
  const tabs = (
    <>
      <button type="button" className="btn ghost small to-list" onClick={scrollToList}>
        ↑ list
      </button>
      <div className="tabs" role="tablist" aria-label="views">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );

  // Details and graph need a function. Path and trace work without one.
  let content;
  if (tab === "path") {
    content = <PathView selectedId={selectedId} onSelect={selectFunction} projectKey={projectKey} externalFrom={pathFrom} externalTo={pathTo} />;
  } else if (tab === "trace") {
    content = null; // drawn below, fills the whole panel like graph
  } else if (!selectedId) {
    content = <p className="empty">pick a function from the list to see its {tab}</p>;
  } else if (tab === "graph") {
    content = null; // drawn below, because the graph fills the whole panel
  } else {
    content = <DetailPanel id={selectedId} onSelect={selectFunction} />;
  }

  const showGraph = tab === "graph" && selectedId;
  const showTrace = tab === "trace";

  return (
    <div className="window">
      <div className="glows" aria-hidden="true">
        <div className="glow glow-a" />
        <div className="glow glow-b" />
      </div>

      <TitleBar theme={theme} onToggleTheme={toggleTheme} />

      <div className="workspace">
        <aside className="sidebar" ref={sidebarRef}>
          <AnalyzeForm project={project} config={config} onAnalyzed={handleAnalyzed} />
          {project && <FunctionList projectKey={projectKey} selectedId={selectedId} onSelect={selectFunction} />}
        </aside>

        <main className="main" ref={mainRef}>
          {project ? (
            <Panel title={selectedId ?? "no function selected"} actions={tabs} grow flush={showGraph || showTrace}>
              {showGraph ? (
                <Suspense fallback={<div className="empty"><span className="spinner" aria-label="loading" /></div>}>
                  <GraphView
                    id={selectedId}
                    onSelect={selectFunction}
                    theme={theme}
                    onSetPathFrom={(id) => { setPathFrom(id); setTab("path"); }}
                    onSetPathTo={(id) => { setPathTo(id); setTab("path"); }}
                    onSetTraceFrom={(id) => { setTraceFrom(id); setTab("trace"); }}
                    onSetTraceTo={(id) => { setTraceTo(id); setTab("trace"); }}
                  />
                </Suspense>
              ) : showTrace ? (
                <Suspense fallback={<div className="empty"><span className="spinner" aria-label="loading" /></div>}>
                  <TraceView selectedId={selectedId} onSelect={selectFunction} theme={theme} projectKey={projectKey} externalFrom={traceFrom} externalTo={traceTo} />
                </Suspense>
              ) : (
                content
              )}
            </Panel>
          ) : (
            <Panel title="welcome" grow flush>
              <Welcome githubOnly={!config.allowLocalPaths} />
            </Panel>
          )}
        </main>
      </div>

      <StatusBar project={project} />
    </div>
  );
}
