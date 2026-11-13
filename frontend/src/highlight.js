// A tiny syntax highlighter, just enough to make the source readable.
// It looks at one line at a time and returns pieces: [{ text, type }].
// type is "comment", "string", "keyword", "number" or "plain".

const KEYWORDS =
  "const|let|var|function|return|if|else|for|while|class|new|import|export|from|default|" +
  "async|await|this|true|false|null|undefined|of|in|throw|try|catch|static|extends|typeof";

const TOKEN = new RegExp(
  [
    "(\\/\\/.*$)", // 1: line comment
    "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|`(?:[^`\\\\]|\\\\.)*`)", // 2: string
    `\\b(${KEYWORDS})\\b`, // 3: keyword
    "\\b(\\d+(?:\\.\\d+)?)\\b", // 4: number
  ].join("|"),
  "g",
);

// Which type each regex group stands for (index 0 is unused).
const TYPES = [null, "comment", "string", "keyword", "number"];

export function highlightLine(line) {
  const pieces = [];
  let last = 0;

  for (const match of line.matchAll(TOKEN)) {
    // Text between the previous token and this one is plain.
    if (match.index > last) {
      pieces.push({ text: line.slice(last, match.index), type: "plain" });
    }
    // The first group that matched tells us what kind of token it is.
    const group = match.slice(1).findIndex((part) => part !== undefined) + 1;
    pieces.push({ text: match[0], type: TYPES[group] });
    last = match.index + match[0].length;
  }

  if (last < line.length) {
    pieces.push({ text: line.slice(last), type: "plain" });
  }
  return pieces;
}
