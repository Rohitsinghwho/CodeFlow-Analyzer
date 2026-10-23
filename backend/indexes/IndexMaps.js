/**
 * Centralized map storage for project-wide indexes.
 *
 * Consumers use the methods on this class instead of depending on the
 * internal map layout.
 */
class IndexMaps {
  #exportsByFile = new Map();
  #functionsByFile = new Map();

  clear() {
    this.#exportsByFile.clear();
    this.#functionsByFile.clear();
  }

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

  getExport(file, exportedName) {
    return this.#exportsByFile.get(file)?.get(exportedName);
  }

  getFunction(file, functionName) {
    return this.#functionsByFile.get(file)?.get(functionName);
  }

  hasFunction(file, functionName) {
    return this.#functionsByFile.get(file)?.has(functionName) ?? false;
  }

  getExportNames(file) {
    return this.#exportsByFile.get(file)?.keys() ?? [];
  }

  getFunctionNames(file) {
    return this.#functionsByFile.get(file)?.keys() ?? [];
  }
}

const indexMaps = new IndexMaps();

export { IndexMaps };
export default indexMaps;
