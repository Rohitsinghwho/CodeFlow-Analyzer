// The only file that talks to the CodeFlow backend.
// Every function returns the parsed JSON, or throws an Error with a readable message.

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// The server gives every analysis a project id and keeps one project per visitor.
// We send the id back with every request (the X-Project-Id header) so the server
// knows whose project to use. It lives in memory, so each browser tab has its own.
let projectId = null;

// Send a request and return its JSON. Turns every failure into an Error.
async function request(path, options = {}) {
  let response;
  try {
    const headers = { ...options.headers, ...(projectId ? { "X-Project-Id": projectId } : {}) };
    response = await fetch(`${BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error(`cannot reach the api at ${BASE}. is the backend running?`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `request failed (${response.status})`);
  }
  return body;
}

// Build "a=1&b=2" from an object, skipping empty values.
// Characters like "#" in function ids are encoded for us.
function query(params) {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== "");
  return new URLSearchParams(entries).toString();
}

/** Is this text a GitHub link (rather than a folder path)? */
export function isGitHubLink(text) {
  return /^(https?:\/\/)?(www\.)?github\.com\//i.test(text.trim());
}

/**
 * Analyze a project and remember it on the server. `input` is either a folder
 * on the server's computer or a GitHub link (which the server downloads first).
 * Returns { files, functions, errors } and, for GitHub, `repo` like "owner/name".
 */
export async function analyze(input) {
  const text = input.trim();
  const body = isGitHubLink(text) ? { repo: text } : { path: text };

  // Sending the old project id lets the server replace this visitor's old project.
  const result = await request("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  projectId = result.projectId;
  return result;
}

/** What the server allows: { allowLocalPaths, allowGithub }. */
export function getConfig() {
  return request("/api/config");
}

/** Page of functions: { total, items }. params: search, file, limit, offset. */
export function listFunctions(params) {
  return request(`/api/functions?${query(params)}`);
}

/** One function with its source code. */
export function getFunction(id) {
  return request(`/api/function?${query({ id })}`);
}

/** What does this function call? { id, depth, items } */
export function getCallees(id, depth = 1) {
  return request(`/api/callees?${query({ id, depth })}`);
}

/** Who calls this function? { id, depth, items } */
export function getCallers(id, depth = 1) {
  return request(`/api/callers?${query({ id, depth })}`);
}

/** Shortest chain of calls: { from, to, path } where path is an array of ids or null. */
export function findPath(from, to, maxDepth = 10) {
  return request(`/api/path?${query({ from, to, maxDepth })}`);
}
