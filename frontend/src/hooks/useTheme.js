import { useCallback, useLayoutEffect, useState } from "react";

const KEY = "codeflow.theme";

// The page starts with a theme already set by a small script in index.html.
function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/**
 * Dark / light mode. Returns { theme, toggleTheme }.
 * The choice is written on <html data-theme="..."> (the CSS reads it) and saved
 * in localStorage so it is remembered next time.
 */
export function useTheme() {
  const [theme, setTheme] = useState(currentTheme);

  // A layout effect runs before other effects, so child components that read the
  // CSS colors (the graph) already see the new theme.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Storage can be blocked (private window). The theme still works for this visit.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((previous) => (previous === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
