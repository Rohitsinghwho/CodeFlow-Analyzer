import RuleSet from "./rules/RuleSet.js";
import Utilities from "../utils/Utilities.js";

class Analyzer {
  #rules;
  #utilities;

  constructor({ rules = new RuleSet(), utilities = new Utilities() } = {}) {
    this.#rules = rules;
    this.#utilities = utilities;
  }

  analyze(ast, relativePath) {
    const functions = [];
    const calls = [];
    const imports = [];
    const exports = [];
    const ids = new Set();
    const idByFnNode = new Map();

    const buildId = (name, owner, line) => {
      const base = owner !== null
        ? `${relativePath}#${owner}.${name}`
        : `${relativePath}#${name}`;
      let id = base;
      let suffix = 0;
      while (ids.has(id)) {
        suffix += 1;
        id = `${base}@${line}${suffix === 1 ? "" : `-${suffix}`}`;
      }
      return id;
    };

    const recordFunction = (description, owner) => {
      const resultOwner = description.kind === "function" ? null : owner;
      const line = description.fnNode.loc.start.line;
      const id = buildId(description.name, resultOwner, line);
      ids.add(id);
      idByFnNode.set(description.fnNode, id);
      functions.push({
        id,
        name: description.name,
        owner: resultOwner,
        kind: description.kind,
        line,
        endLine: description.fnNode.loc.end.line,
      });
    };

    const nextOwner = (node, owner) => {
      if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
        return node.id?.name ?? "default";
      }
      if (
        node.type === "VariableDeclarator" &&
        node.id.type === "Identifier" &&
        node.init?.type === "ObjectExpression"
      ) {
        return node.id.name;
      }
      return owner;
    };

    const visit = (node, context) => {
      for (const description of this.#rules.functionRule(node.type)?.(node) ?? []) {
        recordFunction(description, context.owner);
      }

      const current = {
        owner: nextOwner(node, context.owner),
        currentFnId: idByFnNode.get(node) ?? context.currentFnId,
      };

      for (const description of this.#rules.callRule(node.type)?.(node) ?? []) {
        calls.push({
          caller: current.currentFnId,
          calleeName: description.calleeName,
          objectName: description.objectName,
          kind: description.kind,
          viaThis: description.viaThis,
          line: node.loc.start.line,
        });
      }
      for (const description of this.#rules.importRule(node.type)?.(node) ?? []) {
        imports.push(description);
      }
      for (const description of this.#rules.exportRule(node.type)?.(node) ?? []) {
        exports.push(description);
      }
      for (const child of this.#utilities.childNodes(node)) visit(child, current);
    };

    if (this.#utilities.isNode(ast)) {
      visit(ast, { owner: null, currentFnId: `${relativePath}#<top-level>` });
    }
    return { functions, calls, imports, exports };
  }
}

export default Analyzer;
export { Analyzer };
