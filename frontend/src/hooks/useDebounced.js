import { useEffect, useState } from "react";

/** Returns `value`, but only after it stopped changing for `delay` ms (for search boxes). */
export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
