/**
 * Allows each visitor only `max` actions in any period of `windowMs`.
 * It keeps the times of recent actions per key (a key is usually an IP address).
 * Everything is in memory, so it starts fresh when the server restarts.
 */
class RateLimiter {
  // key -> times (in ms) of that visitor's recent actions
  #hits = new Map();
  #max;
  #windowMs;

  constructor({ max = 30, windowMs = 10 * 60 * 1000 } = {}) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  /**
   * Count one action for `key`.
   * @returns {{allowed: true} | {allowed: false, retryAfterSeconds: number}}
   */
  check(key) {
    const now = Date.now();
    const recent = (this.#hits.get(key) ?? []).filter((time) => now - time < this.#windowMs);

    if (recent.length >= this.#max) {
      this.#hits.set(key, recent);
      // The oldest action leaves the window first, which frees one place.
      const retryAfterSeconds = Math.ceil((recent[0] + this.#windowMs - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    this.#hits.set(key, recent);
    this.#forgetOldKeys(now);
    return { allowed: true };
  }

  // Remove visitors who have not done anything for a whole window, so the map cannot grow forever.
  #forgetOldKeys(now) {
    if (this.#hits.size < 1000) return;
    for (const [key, times] of this.#hits) {
      if (times.every((time) => now - time >= this.#windowMs)) {
        this.#hits.delete(key);
      }
    }
  }
}

export default RateLimiter;
export { RateLimiter };
