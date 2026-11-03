import path from "path";

import { IndexMaps } from "../indexes/IndexMaps.js";

// File extensions we try when an import path has no extension (`./c` -> `./c.js`).
const moduleExtensions = [".js", ".mjs", ".cjs"];

/**
 * The Linker connects things across files.
 *
 * The Analyzer only looks at one file at a time, so on its own it cannot tell
 * which function in another file a call or an import really points at. The
 * Linker takes the results for ALL files and answers:
 *   - resolveModule: which project file does `import ... from "./c"` mean?
 *   - resolveExport: which function does `export { helper as e }` expose?
 *   - linkCalls:     which function does each call inside a function reach?
 */
class Linker {
  // Lookup tables (exports and functions per file) filled by buildIndexes().
  #indexes;

  /**
   * @param {IndexMaps} indexes Where lookups are stored. Every Linker gets its
   *   own IndexMaps by default, so two CodeFlow instances never share state.
   */
  constructor(indexes = new IndexMaps()) {
    this.#indexes = indexes;
  }

  /**
   * Step 1: fill the lookup tables from every file's analyzer result.
   * Call this before resolveExport(). It wipes any previous data first.
   *
   * @param {Array<{file: string, exports: object[], functions: object[]}>} fileResults
   */
  buildIndexes(fileResults) {
    this.#indexes.clear();

    if (!Array.isArray(fileResults)) {
      return;
    }

    for (const fileResult of fileResults) {
      // Skip broken entries instead of crashing the whole run.
      if (!fileResult?.file) {
        continue;
      }

      this.#indexes.setExports(fileResult.file, fileResult.exports);
      this.#indexes.setFunctions(fileResult.file, fileResult.functions);
    }
  }

  /**
   * Turn an import path into the project file it points at.
   *
   * @param {string} fromFile Project-relative file that has the import, e.g. "main.js".
   * @param {string} source The text inside the quotes, e.g. "./c".
   * @param {Set<string>} fileSet Every project-relative file path.
   * @returns {string|null} The target file, or null for packages (e.g. "express")
   *   and for paths that match no project file.
   */
  resolveModule(fromFile, source, fileSet) {
    // Only relative imports ("./x", "../x") point at project files.
    if (!String(source).startsWith(".")) {
      return null;
    }

    // Start from the folder of the importing file and follow the path.
    const folder = path.posix.dirname(fromFile);
    const target = path.posix.join(folder, source);
    const indexTarget = path.posix.join(target, "index.js");

    // 1. The path may already be a full file name ("./c.js").
    if (fileSet.has(target)) {
      return target;
    }

    // 2. Otherwise try adding an extension ("./c" -> "./c.js").
    for (const extension of moduleExtensions) {
      if (fileSet.has(`${target}${extension}`)) {
        return `${target}${extension}`;
      }
    }

    // 3. Finally the path may be a folder with an index.js inside.
    return fileSet.has(indexTarget) ? indexTarget : null;
  }

  /**
   * Find the function behind an exported name.
   * Example: `export { helper as e }` -> resolveExport("b.js", "e") === "b.js#helper".
   *
   * @param {string} file Project-relative file that does the exporting.
   * @param {string} exportedName The name other files import.
   * @returns {string|null} The function id, or null if the export is not a
   *   top-level function (a class, a constant, or nothing at all).
   */
  resolveExport(file, exportedName) {
    const exportRecord = this.#indexes.getExport(file, exportedName);
    // With no export record the name is used as-is (it might be a plain function).
    const localName = exportRecord?.localName ?? exportedName;
    const functionRecord = this.#indexes.getFunction(file, localName);

    return functionRecord?.id ?? null;
  }

  /**
   * Connect every call to the function it most likely reaches.
   *
   * @param {Array} fileResults Same array that buildIndexes() accepts.
   * @returns {Array<{caller: string, callee: string, line: number,
   *   kind: string, confidence: "certain"|"guess", file: string}>}
   *   One edge per match; `file` is the file the call was written in.
   *   `confidence` is "certain" when we are sure, "guess" when we only matched a name.
   */
  linkCalls(fileResults) {
    // Make sure the lookups match exactly the results we were given.
    this.buildIndexes(fileResults);

    const results = (Array.isArray(fileResults) ? fileResults : [])
      .filter((fileResult) => fileResult?.file);
    const fileSet = new Set(results.map((fileResult) => fileResult.file));
    const methodsByName = this.#groupMethodsByName(results);

    const edges = [];
    for (const fileResult of results) {
      for (const call of fileResult.calls ?? []) {
        // Which functions could this call reach?
        const targets = this.#findTargets(call, fileResult, fileSet, methodsByName);

        for (const target of targets) {
          edges.push({
            caller: call.caller,
            callee: target.id,
            line: call.line,
            kind: call.kind,
            confidence: target.confidence,
            file: fileResult.file,
          });
        }
      }
    }
    return edges;
  }

  /**
   * Decide how to look up a call, based on how it was written:
   *   this.name()  -> a method of the same class/object
   *   obj.name()   -> any method called `name` (we cannot know what `obj` is)
   *   name()       -> a function in this file, or one that was imported
   * Returns a list of { id, confidence }; empty when nothing matches.
   */
  #findTargets(call, fileResult, fileSet, methodsByName) {
    if (call.viaThis) {
      return this.#findSameOwnerMethod(call, fileResult);
    }
    if (call.objectName !== null) {
      return (methodsByName.get(call.calleeName) ?? [])
        .map((method) => ({ id: method.id, confidence: "guess" }));
    }
    return this.#findPlainFunction(call, fileResult, fileSet);
  }

  /** `name()`: a top-level function of this file, otherwise an imported one. */
  #findPlainFunction(call, fileResult, fileSet) {
    const file = fileResult.file;

    // 1. Defined in this same file.
    const localFunction = this.#indexes.getFunction(file, call.calleeName);
    if (localFunction) {
      return [{ id: localFunction.id, confidence: "certain" }];
    }

    // 2. Imported from another project file.
    const importRecord = (fileResult.imports ?? [])
      .find((record) => record.localName === call.calleeName);
    if (!importRecord || importRecord.external) {
      return [];
    }
    const targetFile = this.resolveModule(file, importRecord.source, fileSet);
    const id = targetFile ? this.resolveExport(targetFile, importRecord.importedName) : null;
    return id ? [{ id, confidence: "certain" }] : [];
  }

  /** `this.name()`: the method called `name` in the same class/object as the caller. */
  #findSameOwnerMethod(call, fileResult) {
    const functions = fileResult.functions ?? [];

    // The caller tells us which class/object we are inside.
    const caller = functions.find((record) => record.id === call.caller);
    if (!caller || caller.owner === null) {
      return [];
    }

    const method = functions.find((record) =>
      record.name === call.calleeName && record.owner === caller.owner);
    return method ? [{ id: method.id, confidence: "certain" }] : [];
  }

  /** Every method in the project, grouped by name: Map(name -> [records]). */
  #groupMethodsByName(results) {
    const methodsByName = new Map();
    for (const fileResult of results) {
      for (const record of fileResult.functions ?? []) {
        if (record.owner === null) continue; // plain functions are not methods
        const sameName = methodsByName.get(record.name) ?? [];
        sameName.push(record);
        methodsByName.set(record.name, sameName);
      }
    }
    return methodsByName;
  }
}

// Shared default instance kept for backwards compatibility. It has its own
// IndexMaps, so it does not interfere with Linkers created elsewhere.
const linker = new Linker();

export { Linker };
export default linker;
