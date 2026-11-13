// Bottom bar of the window: which project is open, and a few numbers.
export default function StatusBar({ project }) {
  return (
    <footer className="statusbar">
      <span>
        <span className={`status-dot${project ? " online" : ""}`} aria-hidden="true" />
        <span className="ellipsis" title={project?.folder}>
          {project ? `analyzing ${project.repo ? `github: ${project.repo}` : project.folder}` : "no project analyzed yet"}
        </span>
      </span>
      <span>
        {project ? `${project.files} files · ${project.functions} functions` : "enter a folder to start"}
      </span>
    </footer>
  );
}
