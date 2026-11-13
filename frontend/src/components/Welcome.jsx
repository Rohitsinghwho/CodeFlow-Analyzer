import FloatingSymbol from "./ui/FloatingSymbol.jsx";

// What you see before a project is analyzed: a short hello and the first steps.
// `githubOnly` is true on a public server, which does not read its own folders.
export default function Welcome({ githubOnly = false }) {
  return (
    <div className="welcome">
      <FloatingSymbol symbol="{ }" style={{ top: "12%", left: "10%" }} duration={7} />
      <FloatingSymbol symbol="=>" style={{ top: "62%", left: "6%" }} duration={5} delay={1} />
      <FloatingSymbol symbol="#" style={{ top: "18%", right: "12%" }} duration={6} delay={2} />
      <FloatingSymbol symbol="</>" style={{ bottom: "14%", right: "9%" }} duration={8} delay={0.5} />
      <FloatingSymbol symbol="()" style={{ bottom: "10%", left: "42%" }} duration={6.5} delay={1.5} />

      <div className="welcome-inner">
        <span className="section-label">home</span>
        <h1>
          see who calls <em>whom</em>
          <br />
          in any javascript project
        </h1>
        <p>
          codeflow reads your code, finds every function, and links the calls between them, even
          across files. then you can follow them.
        </p>
        <div className="steps">
          <span>
            <b>1.</b> {githubOnly ? "paste a public github link" : "enter a project folder or a github link"} and press analyze
          </span>
          <span>
            <b>2.</b> pick a function from the list
          </span>
          <span>
            <b>3.</b> read its source, explore the graph, or find a path
          </span>
        </div>
      </div>
    </div>
  );
}
