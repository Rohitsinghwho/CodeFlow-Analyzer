// Function ids look like "<file>#<name>" or "<file>#<Class>.<method>",
// for example "analyzer/Analyzer.js#Analyzer.analyze". These helpers split them.

/** "analyzer/Analyzer.js#Analyzer.analyze" -> "analyzer/Analyzer.js" */
export function fileOf(id) {
  return id.slice(0, id.indexOf("#"));
}

/** "analyzer/Analyzer.js#Analyzer.analyze" -> "Analyzer.analyze" */
export function nameOf(id) {
  return id.slice(id.indexOf("#") + 1);
}

/** Code outside any function is credited to "<file>#<top-level>". It is not a real function. */
export function isTopLevel(id) {
  return nameOf(id) === "<top-level>";
}
