import { highlightLine } from "../../highlight.js";

// Shows source code with line numbers and light syntax colors.
// `startLine` is the line number of the first line in the original file.
export default function CodeBlock({ source, startLine = 1 }) {
  const lines = source.split("\n");

  return (
    <pre className="code" tabIndex={0}>
      {lines.map((line, index) => (
        <div className="code-line" key={index}>
          <span className="line-no">{startLine + index}</span>
          <code className="line-text">
            {highlightLine(line).map((piece, position) => (
              <span key={position} className={piece.type === "plain" ? undefined : `tok-${piece.type}`}>
                {piece.text}
              </span>
            ))}
          </code>
        </div>
      ))}
    </pre>
  );
}
