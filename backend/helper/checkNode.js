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

export default isNode;
