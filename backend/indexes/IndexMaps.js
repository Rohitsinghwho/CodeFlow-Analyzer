/**
 * Centralized map storage for project-wide indexes.
 *
 * Consumers use the methods on this class instead of depending on the
 * internal map layout.
 */
class IndexMaps {
  // file -> (exported name -> export record)
  #exportsByFile = new Map();
  // file -> (function name -> function record)
  #functionsByFile = new Map();

  /** Forget everything (used before the indexes are rebuilt). */
  clear() {
    this.#exportsByFile.clear();
    this.#functionsByFile.clear();
  }

  /** Store a file's exports, looked up later by exported name. */
  setExports(file, exportRecords) {
    const exportsForFile = new Map();
    for (const exportRecord of exportRecords ?? []) {
      const exportedName = exportRecord?.exportedName;
      if (exportedName) {
        exportsForFile.set(exportedName, exportRecord);
      }
    }
    this.#exportsByFile.set(file, exportsForFile);
  }

  /**
   * Store a file's top-level functions, looked up later by name.
   * Methods (records with an owner) are left out on purpose: other files
   * cannot import a class method directly.
   */
  setFunctions(file, functionRecords) {
    const functionsForFile = new Map();
    for (const functionRecord of functionRecords ?? []) {
      if (
        functionRecord.owner === null &&
        functionRecord.name &&
        !functionsForFile.has(functionRecord.name)
      ) {
        functionsForFile.set(functionRecord.name, functionRecord);
      }
    }
    this.#functionsByFile.set(file, functionsForFile);
  }

  /** The export record for `exportedName` in `file`, or undefined. */
  getExport(file, exportedName) {
    return this.#exportsByFile.get(file)?.get(exportedName);
  }

  /** The top-level function record called `functionName` in `file`, or undefined. */
  getFunction(file, functionName) {
    return this.#functionsByFile.get(file)?.get(functionName);
  }

  /** True if `file` has a top-level function with this name. */
  hasFunction(file, functionName) {
    return this.#functionsByFile.get(file)?.has(functionName) ?? false;
  }

  /** All exported names of `file`. */
  getExportNames(file) {
    return this.#exportsByFile.get(file)?.keys() ?? [];
  }

  /** All top-level function names of `file`. */
  getFunctionNames(file) {
    return this.#functionsByFile.get(file)?.keys() ?? [];
  }
}

// Shared instance kept for backwards compatibility. Prefer `new IndexMaps()`
// so that separate analyses do not share data.
const indexMaps = new IndexMaps();

export { IndexMaps };
export default indexMaps;
