/**
 * Small helpers for working with the syntax tree (AST) that Acorn produces.
 * They hold no state, so one instance can be shared freely.
 */
class Utilities {
  /**
   * Is this value an AST node? Every node is an object with a string `type`
   * such as "CallExpression". Strings, numbers, null and arrays are not nodes.
   */
  isNode(value) {
    return value !== null && typeof value === "object" && typeof value.type === "string";
  }

  /**
   * Get the direct children of a node.
   *
   * Acorn does not give nodes a single `children` list. Child nodes live in
   * many differently named fields (`body`, `init`, `callee`, `arguments`...),
   * some holding one node and some holding an array. So we look at every field,
   * flatten arrays, and keep only the values that are nodes.
   */
  childNodes(node) {
    return Object.values(node).flatMap((value) => {
      const values = Array.isArray(value) ? value : [value];
      return values.filter((child) => this.isNode(child));
    });
  }

  /**
   * Is this node an arrow function or a function expression?
   * (Function *declarations* are not included; they have their own node type.)
   */
  isFunctionNode(node) {
    return this.isNode(node) &&
      (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression");
  }
}

export default Utilities;
export { Utilities };
