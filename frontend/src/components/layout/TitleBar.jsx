import ThemeToggle from "../ui/ThemeToggle.jsx";

// Top bar of the window: the three dots, the app name and the dark/light switch.
export default function TitleBar({ theme, onToggleTheme }) {
  return (
    <header className="titlebar">
      <span className="dots" aria-hidden="true">
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
      </span>
      <span className="window-title">
        <b>codeflow</b> <span className="sub">&lt;call graph explorer&gt;</span>
      </span>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  );
}
