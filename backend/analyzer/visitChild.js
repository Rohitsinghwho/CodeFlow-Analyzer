import { isNode, childNodes } from "../utils/index.js";
import { functionRules, callRules, importRules, exportRules } from "./rules/index.js";
import { addResult } from "../parser/index.js";

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
 * Traverses an AST depth-first and collects functions, calls, imports, and
 * exports supported by the analyzer rule tables.
 *
 * @param {object} ast The root AST node to traverse.
 * @param {string} relativePath The path prefix used to create unique IDs.
 * @returns {{
 *   functions: FunctionRecord[],
 *   calls: object[],
 *   imports: object[],
 *   exports: object[]
 * }} Analysis results grouped by record type.
 */
function visit(ast, relativePath) {
  /** @type {FunctionRecord[]} */
  const result = [];
  const calls = [];
  const imports=[];
  const exports=[];
  const ids = new Set();
  const idByFnNode = new Map();

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
    // Keep the function-to-ID mapping so nested calls use the recorded ID.
    idByFnNode.set(fnNode, id);
    result.push(
      addResult(id, name, resultOwner, kind, line, fnNode.loc.end.line),
    );
  }

  /**
   * Records one call edge from the given caller.
   * @param {{calleeName: string, viaThis: boolean, kind: string}} description
   * @param {object} node The call node (used for the line number).
   * @param {?string} callerId ID of the enclosing function, or null at top level.
   */
  function recordCall(description, node, callerId) {
    calls.push({
      caller: callerId ?? `${relativePath}#<top-level>`,
      calleeName: description.calleeName,
      objectName:description.objectName,
      kind: description.kind,
      viaThis: description.viaThis,
      line: node.loc.start.line,
    });
  }


  function recordImports(description){
    imports.push({
      localName:description.localName,
      importedName:description.importedName,
      source:description.source,
      external:description.external
    })
  }

  function recordExports(description){
    exports.push({
      exportedName:description.exportedName,
      localName:description.localName 
    })
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
   * @param {{owner: (?string), currentFnId: (?string)}} context
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
      currentFnId: idByFnNode.get(node)??context.currentFnId,
    };
    const callRule=callRules[node.type];
    if(callRule){
      for(const description of callRule(node)){
        recordCall(description,node,nextContext.currentFnId);
      }
    }

    const importRule= importRules[node.type];
    if(importRule){
      for(const description of importRule(node)){
         recordImports(description);
      }
    }

    const exportRule= exportRules[node.type];
    if(exportRule){
      for(const description of exportRule(node)){
        recordExports(description);
      }
    }
    for (const child of childNodes(node)) {
      visitChild(child, nextContext);
    }
  }

  if (isNode(ast)) {
    let topLevel=`${relativePath}#<top-level>`
    visitChild(ast, { owner: null, currentFnId: topLevel });
  }

  return { functions: result, calls , imports, exports };
}

export { visit };
export default visit;
