import isNode, { childNodes, isFunctionNode } from "./checkNode.js";
import functionRules from "./functionRules.js";
import addResult from "./resultHelper.js";

/**
 * @typedef {object} FunctionRecord
 * @property {string} id
 * @property {string} name
 * @property {?string} owner
 * @property {"function"|"method"|"callback"} kind
 * @property {number} line
 * @property {number} endLine
 */

/**
 * Traverses an AST depth-first and collects functions defined by supported
 * syntax forms.
 *
 * @param {object} ast The root AST node to traverse.
 * @param {string} relativePath The path prefix used to create unique IDs.
 * @returns {FunctionRecord[]} Collected functions in depth-first order.
 */
function visit(ast, relativePath) {
  /** @type {FunctionRecord[]} */
  const result = [];
  const ids = new Set();

  function buildID(name, owner, lineNumber) {
    const baseID =
      owner !== null
        ? `${relativePath}#${owner}.${name}`
        : `${relativePath}#${name}`;
    let id = baseID;
    let suffix = 0;

    while (ids.has(id)) {
      suffix += 1;
      id = `${baseID}@${lineNumber}${suffix === 1 ? "" : `-${suffix}`}`;
    }

    return id;
  }

  /**
   * Records a rule description using the current owner.
   *
   * @param {{name: string, kind: ("function"|"method"|"callback"), fnNode: object}} description
   * @param {?string} owner
   */
  function record(description, owner) {
    const { name, kind, fnNode } = description;
    const resultOwner = kind === "function" ? null : owner;
    const line = fnNode.loc.start.line;
    const id = buildID(name, resultOwner, line);
    ids.add(id);
    result.push(
      addResult(id, name, resultOwner, kind, line, fnNode.loc.end.line),
    );
  }

  function getNextOwner(node, owner) {
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
  }

  /**
   * @param {object} node
   * @param {{owner: (?string), currentFn: (?object)}} context
   */
  function visitChild(node, context) {
    const rule = functionRules[node.type];
    if (rule) {
      for (const description of rule(node)) {
        record(description, context.owner);
      }
    }

    const nextContext = {
      owner: getNextOwner(node, context.owner),
      currentFn: isFunctionNode(node) ? node : context.currentFn,
    };

    for (const child of childNodes(node)) {
      visitChild(child, nextContext);
    }
  }

  if (isNode(ast)) {
    visitChild(ast, { owner: null, currentFn: null });
  }

  return result;
}

export { visit };
export default visit;
