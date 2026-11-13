import { useEffect, useId, useState } from "react";

import { listFunctions } from "../../api.js";
import { useDebounced } from "../../hooks/useDebounced.js";
import { fileOf, nameOf } from "../../functionId.js";

// A text box that suggests functions while you type.
// `value` is the function id in the box, and `onChange` receives the new text.
// You can type a full id yourself or pick one of the suggestions.
export default function FunctionPicker({ label, value, onChange, projectKey }) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const search = useDebounced(value, 200);

  // Ask the API for functions that match the text (only while the list is open).
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    listFunctions({ search, limit: 8 })
      .then((result) => {
        if (!cancelled) setSuggestions(result.items);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [search, open, projectKey]);

  const pick = (id) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="field picker">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="input"
        value={value}
        placeholder="type a name, e.g. init"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A short delay lets a click on a suggestion happen before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul className="list suggestions" role="listbox">
          {suggestions.map((item) => (
            <li key={item.id} role="option" aria-selected={item.id === value}>
              <button type="button" className="list-item" onMouseDown={() => pick(item.id)}>
                <span className="name">{nameOf(item.id)}</span>
                <span className="where">{fileOf(item.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
