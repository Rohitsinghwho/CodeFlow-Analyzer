/**
 * Checks whether a value has the shape of an AST node.
 *
 * @param {*} value The value to validate.
 * @returns {boolean} True when the value is a non-null object with a string
 * type property; otherwise false.
 */
function isNode(value) {
  if (
    value !== null &&
    typeof value === "object" &&
    typeof value.type === "string"
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the direct AST child nodes of a node.
 *
 * @param {object} node An AST node.
 * @returns {object[]} The direct child nodes in property order.
 */
function childNodes(node) {
  return Object.values(node).flatMap((value) => {
    const values = Array.isArray(value) ? value : [value];
    return values.filter(isNode);
  });
}

/**
 * Checks whether a node represents a function expression.
 *
 * @param {*} node A value to validate.
 * @returns {boolean} True for arrow and function expressions.
 */
function isFunctionNode(node) {
  return (
    isNode(node) &&
    (node.type === "ArrowFunctionExpression" ||
      node.type === "FunctionExpression")
  );
}

export { childNodes, isFunctionNode };
export default isNode;
