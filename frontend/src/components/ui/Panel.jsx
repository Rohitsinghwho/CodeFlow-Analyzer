// A window-style box: a title bar with the three dots, then the content.
// `actions` is optional extra stuff in the title bar (like tabs or a button).
export default function Panel({ title, actions, grow = false, flush = false, children }) {
  return (
    <section className={`panel${grow ? " grow" : ""}`}>
      <header className="panel-titlebar">
        <span className="dots" aria-hidden="true">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </span>
        <span className="panel-title">{title}</span>
        {actions}
      </header>
      <div className={`panel-body${flush ? " flush" : ""}`}>{children}</div>
    </section>
  );
}
