/**
 * Answers questions about who calls whom.
 *
 * It is built from the edges that Linker.linkCalls() returns. An edge looks
 * like { caller, callee, line, kind, confidence, file }, where `caller` and
 * `callee` are function ids such as "main.js#main".
 *
 * Three questions can be asked:
 *   getCallees(id)  - what does this function call?
 *   getCallers(id)  - who calls this function?
 *   findPath(a, b)  - what is the shortest chain of calls from a to b?
 *
 * All searches go outward one "level" at a time (breadth-first). They remember
 * which functions they have seen, so circles (a calls b, b calls a) end.
 */
class Graph {
  // caller id -> every edge that leaves that function
  #outgoing = new Map();
  // callee id -> every edge that arrives at that function
  #incoming = new Map();

  /**
   * @param {Array<{caller: string, callee: string}>} edges Output of linkCalls().
   */
  constructor(edges) {
    for (const edge of edges) {
      // Get the lists kept so far (or start new ones), add this edge, store them back.
      const outgoingList = this.#outgoing.get(edge.caller) ?? [];
      const incomingList = this.#incoming.get(edge.callee) ?? [];
      outgoingList.push(edge);
      incomingList.push(edge);
      this.#outgoing.set(edge.caller, outgoingList);
      this.#incoming.set(edge.callee, incomingList);
    }
  }

  /**
   * Everything this function calls, directly and further down.
   *
   * @param {string} id Function id to start from.
   * @param {number} [depth=1] How many levels to follow (1 = direct calls only).
   * @returns {Array} Edges, each copied with a `depth` field (1 = direct call).
   *   Empty when the id is unknown or calls nothing.
   */
  getCallees(id, depth = 1) {
    const result = [];
    const seen = new Set([id]); // functions we have already walked into
    let current = [id]; // functions to look at in this round

    for (let level = 1; level <= depth; level++) {
      const next = []; // functions found in this round

      for (const caller of current) {
        for (const edge of this.#outgoing.get(caller) ?? []) {
          result.push({ ...edge, depth: level });

          // Walk into each function only once, so circles cannot loop forever.
          if (!seen.has(edge.callee)) {
            seen.add(edge.callee);
            next.push(edge.callee);
          }
        }
      }

      current = next; // the next round starts from what we just found
    }

    return result;
  }

  /**
   * Everyone who calls this function, directly and further up.
   * Same as getCallees, but follows the calls backwards.
   *
   * @param {string} id Function id to start from.
   * @param {number} [depth=1] How many levels to follow (1 = direct callers only).
   * @returns {Array} Edges, each copied with a `depth` field (1 = direct caller).
   */
  getCallers(id, depth = 1) {
    const result = [];
    const seen = new Set([id]);
    let current = [id];

    for (let level = 1; level <= depth; level++) {
      const next = [];

      for (const callee of current) {
        for (const edge of this.#incoming.get(callee) ?? []) {
          result.push({ ...edge, depth: level });

          if (!seen.has(edge.caller)) {
            seen.add(edge.caller);
            next.push(edge.caller);
          }
        }
      }

      current = next;
    }

    return result;
  }

  /**
   * The shortest chain of calls from one function to another.
   * Example: ["a", "b", "c"] means a calls b and b calls c.
   *
   * @param {string} fromId Function to start from.
   * @param {string} toId Function to reach.
   * @param {number} [maxDepth=10] Give up after this many calls in a row.
   * @returns {string[]|null} The chain including both ends, [fromId] when both
   *   are the same function, or null when no chain exists.
   */
  findPath(fromId, toId, maxDepth = 10) {
    if (fromId === toId) {
      return [fromId];
    }

    // For every function reached, remember the function we came from.
    // It doubles as the "already seen" list, and lets us rebuild the chain.
    const cameFrom = new Map();
    cameFrom.set(fromId, null); // the start has no previous function
    let current = [fromId];

    for (let level = 1; level <= maxDepth; level++) {
      const next = [];

      for (const fn of current) {
        for (const edge of this.#outgoing.get(fn) ?? []) {
          const callee = edge.callee;

          if (!cameFrom.has(callee)) {
            cameFrom.set(callee, fn);
            next.push(callee);
          }

          // Found it: walk back through `cameFrom` to build the chain.
          if (callee === toId) {
            const path = [];
            let step = toId;
            while (step !== null) {
              path.push(step);
              step = cameFrom.get(step);
            }
            return path.reverse(); // we built it from the end, so flip it
          }
        }
      }

      current = next;
    }

    return null; // nothing found within maxDepth
  }

  /**
   * Walks outward from a start function (BFS) and returns every step in the
   * order it would be visited. Each step includes the edge that was followed,
   * the depth it was found at, and its order number.
   *
   * When `toId` is given, the behaviour depends on `mode`:
   *   - "shortest" (default): stops at the first path and returns only those steps.
   *   - "full": completes the BFS, then returns all nodes and edges that lie on
   *     ANY path from `fromId` to `toId`.
   * Without `toId` the whole reachable graph is returned regardless of mode.
   *
   * @param {string}  fromId   Function to start from.
   * @param {string}  [toId]   Optional target function.
   * @param {number}  [maxDepth=10] How many levels to follow.
   * @param {string}  [mode="shortest"] "shortest" or "full".
   * @returns {Array<{node: string, from: string|null, edge: object|null, depth: number, order: number}>}
   */
  getTrace(fromId, toId, maxDepth = 10, mode = "shortest") {
    const steps = [{ node: fromId, from: null, edge: null, depth: 0, order: 0 }];
    const cameFrom = new Map(); // node -> { parent, edge }
    cameFrom.set(fromId, null);
    let current = [fromId];
    let order = 1;
    let foundTarget = false;

    for (let level = 1; level <= maxDepth; level++) {
      const next = [];

      for (const caller of current) {
        for (const edge of this.#outgoing.get(caller) ?? []) {
          if (cameFrom.has(edge.callee)) continue;

          cameFrom.set(edge.callee, { parent: caller, edge });
          steps.push({
            node: edge.callee,
            from: caller,
            edge: { ...edge, depth: level },
            depth: level,
            order: order++,
          });
          next.push(edge.callee);

          if (toId && edge.callee === toId) {
            foundTarget = true;

            // In shortest mode, reconstruct and return immediately.
            if (mode === "shortest") {
              const pathSteps = [];
              let cur = toId;
              while (cur !== null) {
                const info = cameFrom.get(cur);
                pathSteps.push({
                  node: cur,
                  from: info ? info.parent : null,
                  edge: info ? { ...info.edge, depth: 0 } : null,
                  depth: 0,
                  order: 0,
                });
                cur = info ? info.parent : null;
              }
              pathSteps.reverse();
              return pathSteps.map((step, i) => ({ ...step, depth: i, order: i }));
            }
          }
        }
      }

      current = next;
      if (next.length === 0) break;
    }

    // FIX-3: In full mode with a target, filter to only nodes/edges on ANY path
    // from fromId to toId by doing a reverse pass.
    if (toId && mode === "full" && foundTarget) {
      return this.#filterFullPaths(fromId, toId, steps);
    }

    return steps;
  }

  /**
   * Given a full BFS result, keep only the nodes and edges that lie on at
   * least one path from `fromId` to `toId`. Works by walking backwards from
   * `toId` through the BFS parents.
   */
  #filterFullPaths(fromId, toId, steps) {
    // Build a reverse adjacency from the BFS steps (child -> set of parents).
    const parents = new Map();
    for (const step of steps) {
      if (step.from !== null) {
        const set = parents.get(step.node) ?? new Set();
        set.add(step.from);
        parents.set(step.node, set);
      }
    }

    // Walk backwards from toId to find all ancestor nodes.
    const onPath = new Set([fromId, toId]);
    const queue = [toId];
    while (queue.length > 0) {
      const node = queue.shift();
      for (const parent of parents.get(node) ?? []) {
        if (!onPath.has(parent)) {
          onPath.add(parent);
          queue.push(parent);
        }
      }
    }

    // Filter steps to only those where both the node and its parent are on a path.
    const filtered = steps.filter(
      (step) => onPath.has(step.node) && (step.from === null || onPath.has(step.from))
    );

    // Re-number order.
    return filtered.map((step, i) => ({ ...step, order: i }));
  }
}

export default Graph;
