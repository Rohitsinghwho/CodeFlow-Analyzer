import RuleSet from "./rules/RuleSet.js";
import Utilities from "../utils/Utilities.js";

/**
 * Reads ONE file's syntax tree (AST) and collects what is inside it:
 * functions, calls, imports and exports.
 *
 * How it works: it visits every node of the tree, from the top down. For each
 * node it asks the RuleSet "what is this?" and saves the answers.
 * It knows nothing about other files; the Linker joins files together later.
 */
class Analyzer {
  #rules;
  #utilities;

  constructor({ rules = new RuleSet(), utilities = new Utilities() } = {}) {
    this.#rules = rules;
    this.#utilities = utilities;
  }

  /**
   * @param {object} ast Syntax tree from the Parser.
   * @param {string} relativePath Project-relative path of the file (used in ids).
   * @returns {{functions: object[], calls: object[], imports: object[], exports: object[]}}
   *   functions: { id, name, owner, kind, line, endLine }
   *   calls:     { caller, calleeName, objectName, kind, viaThis, line }
   *   imports:   { localName, importedName, source, external }
   *   exports:   { exportedName, localName }
   */
  analyze(ast, relativePath) {
    // Everything we know about this file while walking it.
    const file = {
      path: relativePath,
      result: { functions: [], calls: [], imports: [], exports: [] },
      usedIds: new Set(), // ids already given to a function
      idByNode: new Map(), // function node -> its id
    };

    if (this.#utilities.isNode(ast)) {
      // Code outside any function is credited to a made-up "<top-level>" caller.
      const start = { owner: null, currentFunctionId: `${relativePath}#<top-level>` };
      this.#visit(ast, file, start);
    }

    return file.result;
  }

  /**
   * Visit one node, then all of its children.
   *
   * `where` says where in the file we are:
   *   owner             the class or object we are inside (or null)
   *   currentFunctionId the function we are inside, so calls know who made them
   */
  #visit(node, file, where) {
    // 1. Does this node define a function? (It belongs to the current owner.)
    for (const found of this.#rules.findFunctions(node)) {
      this.#saveFunction(found, where.owner, file);
    }

    // 2. Work out where the node's children are.
    const inside = {
      owner: this.#ownerInside(node, where.owner),
      // If this node IS a function, its children are inside that function.
      currentFunctionId: file.idByNode.get(node) ?? where.currentFunctionId,
    };

    // 3. Is this node a call, an import or an export?
    for (const call of this.#rules.findCalls(node)) {
      file.result.calls.push({
        caller: inside.currentFunctionId,
        calleeName: call.calleeName,
        objectName: call.objectName,
        kind: call.kind,
        viaThis: call.viaThis,
        line: node.loc.start.line,
      });
    }
    file.result.imports.push(...this.#rules.findImports(node));
    file.result.exports.push(...this.#rules.findExports(node));

    // 4. Do the same for every child node.
    for (const child of this.#utilities.childNodes(node)) {
      this.#visit(child, file, inside);
    }
  }

  /**
   * Which class or object are the children of `node` inside?
   * Entering `class A {}` or `const a = {}` starts a new owner; any other node
   * keeps the owner we already had.
   */
  #ownerInside(node, currentOwner) {
    const isClass = node.type === "ClassDeclaration" || node.type === "ClassExpression";
    if (isClass) {
      return node.id?.name ?? "default";
    }

    const isObjectVariable =
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init?.type === "ObjectExpression";
    if (isObjectVariable) {
      return node.id.name;
    }

    return currentOwner;
  }

  /** Save one function that the rules found. */
  #saveFunction(found, owner, file) {
    // Only methods belong to a class/object; plain functions have no owner.
    const functionOwner = found.kind === "function" ? null : owner;
    const line = found.fnNode.loc.start.line;
    const id = this.#makeId(found.name, functionOwner, line, file);

    file.usedIds.add(id);
    file.idByNode.set(found.fnNode, id);
    file.result.functions.push({
      id,
      name: found.name,
      owner: functionOwner,
      kind: found.kind,
      line,
      endLine: found.fnNode.loc.end.line,
    });
  }

  /**
   * Build a unique id: "b.js#init" for a function, "b.js#Svc.run" for a method.
   * If the id is already taken (same name twice), the line number is added:
   * "b.js#init@12".
   */
  #makeId(name, owner, line, file) {
    const base = owner === null
      ? `${file.path}#${name}`
      : `${file.path}#${owner}.${name}`;

    let id = base;
    let attempt = 1;
    while (file.usedIds.has(id)) {
      id = attempt === 1 ? `${base}@${line}` : `${base}@${line}-${attempt}`;
      attempt += 1;
    }
    return id;
  }
}

export default Analyzer;
export { Analyzer };
