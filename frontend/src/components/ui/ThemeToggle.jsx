// Button that switches between dark and light mode.
// It shows the icon of the mode you will get when you click it.
export default function ThemeToggle({ theme, onToggle }) {
  const goingLight = theme === "dark";
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onToggle}
      aria-label={goingLight ? "switch to light mode" : "switch to dark mode"}
      title={goingLight ? "light mode" : "dark mode"}
    >
      {goingLight ? (
        // sun
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // moon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
