import { randomUUID } from "node:crypto";

/**
 * Keeps the analyzed projects of all visitors in memory, one per visitor.
 *
 * `add` gives back a random id. The visitor sends that id with every later
 * request, so one visitor can never see or replace another visitor's project.
 *
 * Memory stays bounded in two ways:
 *   - a project that is not used for `ttlMs` is forgotten,
 *   - when `maxProjects` is reached, the project used longest ago is dropped.
 *
 * `onRemove(project)` is called for every project that leaves the store, so the
 * caller can clean up (for example delete a downloaded repository).
 */
class ProjectStore {
  // id -> { project, lastUsed }. A Map remembers insertion order, and `get` re-inserts,
  // so the FIRST entry is always the one used longest ago.
  #entries = new Map();
  #maxProjects;
  #ttlMs;
  #onRemove;

  constructor({ maxProjects = 20, ttlMs = 30 * 60 * 1000, onRemove = () => {} } = {}) {
    this.#maxProjects = maxProjects;
    this.#ttlMs = ttlMs;
    this.#onRemove = onRemove;
  }

  /** Store a project and return its new id. */
  add(project) {
    this.sweep();

    // Make room by dropping the project used longest ago.
    while (this.#entries.size >= this.#maxProjects) {
      const oldestId = this.#entries.keys().next().value;
      this.delete(oldestId);
    }

    const id = randomUUID();
    this.#entries.set(id, { project, lastUsed: Date.now() });
    return id;
  }

  /** The project with this id, or null if it never existed or has expired. */
  get(id) {
    const entry = this.#entries.get(id);
    if (!entry) return null;

    if (Date.now() - entry.lastUsed > this.#ttlMs) {
      this.delete(id);
      return null;
    }

    // Using a project keeps it alive, and moves it to the "newest" end.
    entry.lastUsed = Date.now();
    this.#entries.delete(id);
    this.#entries.set(id, entry);
    return entry.project;
  }

  /** Forget a project (does nothing for an unknown id). */
  delete(id) {
    const entry = this.#entries.get(id);
    if (!entry) return;

    this.#entries.delete(id);
    // Clean-up failures must never crash the server.
    Promise.resolve(this.#onRemove(entry.project)).catch(() => {});
  }

  /** Forget every project that has not been used for too long. */
  sweep() {
    const now = Date.now();
    for (const [id, entry] of this.#entries) {
      if (now - entry.lastUsed > this.#ttlMs) {
        this.delete(id);
      }
    }
  }

  /** How many projects are stored. */
  get size() {
    return this.#entries.size;
  }
}

export default ProjectStore;
export { ProjectStore };
