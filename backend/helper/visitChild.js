import isNode from "./checkNode.js";

/**
 * Traverses an AST depth-first and collects the type of every AST node.
 *
 * @param {object} ast The root AST node to traverse.
 * @returns {string[]} The AST node types in traversal order.
 */
function visit(ast) {
  let result = [];

  /**
   * Recursively visits an AST node and its direct or array-based child nodes.
   *
   * @param {object} ast The AST node currently being visited.
   * @returns {void} This helper updates the outer node-type result.
   */
  function visitChilds(ast) {

    if(ast.type==='VariableDeclarator'&&ast.init!==null &&ast.id.type === 'Identifier'&&(ast.init.type==='ArrowFunctionExpression'||ast.init.type==='FunctionExpression')){
       result.push({name:ast.id.name,location:ast.init.loc})
    }
    //else{
    //   result.push(ast.type);
    // }

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
