import path from "path";

import indexMaps from "../indexes/IndexMaps.js";

const moduleExtensions = [".js", ".mjs", ".cjs"];

class Linker {
  #indexes;

  constructor(indexes = indexMaps) {
    this.#indexes = indexes;
  }

  buildIndexes(fileResults) {
    this.#indexes.clear();

    if (!Array.isArray(fileResults)) {
      return;
    }

    for (const fileResult of fileResults) {
      if (!fileResult?.file) {
        continue;
      }

      this.#indexes.setExports(fileResult.file, fileResult.exports);
      this.#indexes.setFunctions(fileResult.file, fileResult.functions);
    }
  }

  resolveModule(fromFile, source, fileSet) {
    if (!String(source).startsWith(".")) {
      return null;
    }

    const folder = path.posix.dirname(fromFile);
    const target = path.posix.join(folder, source);
    const indexTarget = path.posix.join(target, "index.js");

    if (fileSet.has(target)) {
      return target;
    }

    for (const extension of moduleExtensions) {
      if (fileSet.has(`${target}${extension}`)) {
        return `${target}${extension}`;
      }
    }

    return fileSet.has(indexTarget) ? indexTarget : null;
  }

  resolveExport(file, exportedName) {
    const exportRecord = this.#indexes.getExport(file, exportedName);
    const localName = exportRecord?.localName ?? exportedName;
    const functionRecord = this.#indexes.getFunction(file, localName);

    return functionRecord?.id ?? null;
  }
}

const linker = new Linker();

export { Linker };
export default linker;
