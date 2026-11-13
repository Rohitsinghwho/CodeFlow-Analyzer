import { execFile } from "node:child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "node:util";

const run = promisify(execFile);

// Owner and repository names: letters, digits, "_", "." and "-".
const NAME = /^[A-Za-z0-9_.-]+$/;
// Branch or tag names: the same, plus "/" (for names like "feature/login").
const REF = /^[A-Za-z0-9_./-]+$/;

/** An error with the HTTP status the API should answer with. */
class RepoError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "RepoError";
    this.status = status;
  }
}

/**
 * Downloads a public GitHub repository so CodeFlow can analyze it.
 *
 * It runs `git clone --depth 1` (only the newest files, no history) into its own
 * folder inside the system's temp folder. Nothing from the repository is ever
 * run, only read. The only links it accepts point to github.com, so the server
 * cannot be used to reach other addresses.
 */
class RepoCloner {
  #baseFolder;
  #timeoutMs;
  #maxBytes;
  #cloneUrlFor;

  /**
   * @param {object} [options]
   * @param {string} [options.baseFolder] Where downloads are stored.
   * @param {number} [options.timeoutMs] Give up on a download after this long.
   * @param {number} [options.maxBytes] Refuse repositories that take more disk space
   *   than this after downloading (default 200 MB).
   * @param {(repo: {owner: string, name: string}) => string} [options.cloneUrlFor]
   *   Address that git clones from. Tests change it to point at a local repository.
   */
  constructor({
    baseFolder = path.join(os.tmpdir(), "codeflow-repos"),
    timeoutMs = 60_000,
    maxBytes = 200 * 1024 * 1024,
    cloneUrlFor = (repo) => `https://github.com/${repo.owner}/${repo.name}.git`,
  } = {}) {
    this.#baseFolder = path.resolve(baseFolder);
    this.#timeoutMs = timeoutMs;
    this.#maxBytes = maxBytes;
    this.#cloneUrlFor = cloneUrlFor;
  }

  /**
   * Understand a GitHub link. Accepted forms:
   *   https://github.com/owner/name
   *   github.com/owner/name.git
   *   https://github.com/owner/name/tree/some-branch
   *
   * @returns {{owner: string, name: string, ref: string|null, display: string}|null}
   *   null when the text is not a link of this kind.
   */
  parse(text) {
    if (typeof text !== "string") return null;

    // Cut off "https://", "www." and anything after "?" or "#".
    const match = text.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^?#]*)/i);
    if (!match) return null;

    const parts = match[1].split("/").filter(Boolean);
    if (parts.length < 2) return null;

    const owner = parts[0];
    const name = parts[1].replace(/\.git$/i, "");
    if (!NAME.test(owner) || !NAME.test(name) || /^\.+$/.test(owner) || /^\.+$/.test(name)) {
      return null;
    }

    // After owner and name, only "/tree/<branch>" is understood.
    let ref = null;
    if (parts.length > 2) {
      if (parts[2] !== "tree" || parts.length < 4) return null;
      ref = parts.slice(3).join("/");
      const badRef = !REF.test(ref) || ref.startsWith("-") || ref.includes("..") || ref.endsWith(".lock");
      if (badRef) return null;
    }

    return { owner, name, ref, display: ref ? `${owner}/${name}@${ref}` : `${owner}/${name}` };
  }

  /**
   * Download the repository.
   *
   * @param {string} text A GitHub link.
   * @returns {Promise<{folder: string, display: string}>} The folder holding the
   *   files, and a short name like "owner/name" to show to people.
   * @throws {RepoError} With a message that is safe to show to the user.
   */
  async clone(text) {
    const repo = this.parse(text);
    if (!repo) {
      throw new RepoError("repo must be a link like https://github.com/owner/name", 400);
    }

    // Every download gets its own fresh folder, so two downloads never mix.
    await fs.mkdir(this.#baseFolder, { recursive: true });
    const parent = await fs.mkdtemp(path.join(this.#baseFolder, "repo-"));
    const folder = path.join(parent, repo.name);

    const args = [
      "-c", "credential.helper=", // never ask the system for a saved login
      "clone",
      "--depth", "1", // newest files only
      "--single-branch",
      "--no-tags",
      "--config", "core.symlinks=false", // do not create links that point outside the folder
      ...(repo.ref ? ["--branch", repo.ref] : []),
      "--", // everything after this is data, never an option
      this.#cloneUrlFor(repo),
      folder,
    ];

    try {
      await run("git", args, {
        timeout: this.#timeoutMs,
        killSignal: "SIGKILL",
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, // fail instead of asking for a password
      });
    } catch (error) {
      await this.remove(folder);
      throw this.#explain(error);
    }

    // The download is over, but a huge repository would still fill the disk and the
    // memory when analyzed, so refuse it and delete it again.
    if ((await this.#sizeOf(parent)) > this.#maxBytes) {
      await this.remove(folder);
      throw new RepoError(
        `repository is too large. the limit is ${Math.round(this.#maxBytes / (1024 * 1024))} MB`,
        413,
      );
    }

    return { folder, display: repo.display };
  }

  /**
   * Delete a downloaded repository. Only folders created by `clone` are touched,
   * so a wrong path can never delete something else.
   */
  async remove(folder) {
    const parent = path.dirname(path.resolve(folder));
    if (path.dirname(parent) !== this.#baseFolder) {
      return;
    }
    await fs.rm(parent, { recursive: true, force: true, maxRetries: 3 });
  }

  /** Delete every download (used when the server starts or stops). */
  async removeAll() {
    await fs.rm(this.#baseFolder, { recursive: true, force: true, maxRetries: 3 });
  }

  // Total size in bytes of all files below `folder`. Links are not followed.
  async #sizeOf(folder) {
    let total = 0;
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        total += await this.#sizeOf(fullPath);
      } else if (entry.isFile()) {
        total += (await fs.stat(fullPath)).size;
      }
    }
    return total;
  }

  // Turn a git failure into a message a person can understand.
  #explain(error) {
    if (error.code === "ENOENT") {
      return new RepoError("git is not installed on the server", 500);
    }
    if (error.killed) {
      return new RepoError(`downloading took longer than ${this.#timeoutMs / 1000} seconds`, 504);
    }
    const detail = String(error.stderr ?? "");
    if (/not found|Could not read Username|Authentication failed|terminal prompts disabled/i.test(detail)) {
      return new RepoError("repository (or branch) not found. private repositories are not supported", 404);
    }
    return new RepoError("could not download the repository", 502);
  }
}

export default RepoCloner;
export { RepoCloner, RepoError };
