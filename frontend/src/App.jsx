import { lazy, Suspense, useEffect, useState } from "react";

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

// The graph library is big, so it is only downloaded the first time you open the graph tab.
const GraphView = lazy(() => import("./components/GraphView.jsx"));

const TABS = [
  { id: "details", label: "details" },
  { id: "graph", label: "graph" },
  { id: "path", label: "path" },
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

  // Ask the server once what it allows (a public server turns folders off).
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {
        // If the server cannot be reached now, the analyze button shows the error later.
      });
  }, []);

  const handleAnalyzed = (result) => {
    setProject(result);
    setSelectedId(null);
    setProjectKey((key) => key + 1);
  };

  // The tab buttons live in the title bar of the right panel.
  const tabs = (
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
  );

  // Details and graph need a function. The path view works without one.
  let content;
  if (tab === "path") {
    content = <PathView selectedId={selectedId} onSelect={setSelectedId} projectKey={projectKey} />;
  } else if (!selectedId) {
    content = <p className="empty">pick a function from the list to see its {tab}</p>;
  } else if (tab === "graph") {
    content = null; // drawn below, because the graph fills the whole panel
  } else {
    content = <DetailPanel id={selectedId} onSelect={setSelectedId} />;
  }

  const showGraph = tab === "graph" && selectedId;

  return (
    <div className="window">
      <div className="glows" aria-hidden="true">
        <div className="glow glow-a" />
        <div className="glow glow-b" />
      </div>

      <TitleBar theme={theme} onToggleTheme={toggleTheme} />

      <div className="workspace">
        <aside className="sidebar">
          <AnalyzeForm project={project} config={config} onAnalyzed={handleAnalyzed} />
          {project && <FunctionList projectKey={projectKey} selectedId={selectedId} onSelect={setSelectedId} />}
        </aside>

        <main className="main">
          {project ? (
            <Panel title={selectedId ?? "no function selected"} actions={tabs} grow flush={showGraph}>
              {showGraph ? (
                <Suspense fallback={<div className="empty"><span className="spinner" aria-label="loading" /></div>}>
                  <GraphView id={selectedId} onSelect={setSelectedId} theme={theme} />
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
