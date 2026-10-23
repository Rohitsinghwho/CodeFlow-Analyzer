import fs from "fs/promises";

class Utilities {
  isNode(value) {
    return value !== null && typeof value === "object" && typeof value.type === "string";
  }

  childNodes(node) {
    return Object.values(node).flatMap((value) => {
      const values = Array.isArray(value) ? value : [value];
      return values.filter((child) => this.isNode(child));
    });
  }

  isFunctionNode(node) {
    return this.isNode(node) &&
      (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression");
  }

  async readFile(filePath) {
    if (!filePath) return null;
    try {
      return await fs.readFile(filePath, { encoding: "utf-8" });
    } catch (error) {
      console.error(`Unable to read ${filePath}: ${error.message}`);
      return null;
    }
  }
}

export default Utilities;
export { Utilities };
