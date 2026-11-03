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
}

export default Graph;
