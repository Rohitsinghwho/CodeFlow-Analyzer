import isNode from "./checkNode.js";

/**
 *
 * @param {object} ast
 */

function visit(ast) {
  let result = [];
  function visitChilds(ast) {
    result.push(ast.type);

    for (const fields of Object.values(ast)) {
      if (Array.isArray(fields)) {
        for (const nested of Object.values(fields)) {
          if (isNode(nested)) {
            visitChilds(nested);
          }
        }
      } else if (isNode(fields)) {
        visitChilds(fields);
      }
    }
  }
  visitChilds(ast);
  return result;
}

export default visit;
