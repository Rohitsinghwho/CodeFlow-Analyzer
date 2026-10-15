import isNode from "./checkNode.js";
import addResult from "./resultHelper.js";

/**
 * Traverses an AST depth-first and collects function declarations, functions
 * assigned to variables, and non-computed class methods. Each match is
 * normalized into a result containing its name, owner, kind, and line range.
 *
 * @param {object} ast The root AST node to traverse.
 * @param {string} RelativePath The path prefix used to create unique result
 * identifiers.
 * @returns {{id: string, name: string, owner: (?string), kind: ("function"|"method"), line: number, endLine: number}[]}
 * Collected declarations and methods in depth-first traversal order.
 */
function visit(ast,RelativePath) {
  let result = [];

  /**
   * Recursively visits an AST node and its direct or array-based AST children,
   * carrying the enclosing class or object owner to method results.
   *
   * @param {object} ast The AST node currently being visited.
   * @param {?string} owner The enclosing class or object name, or null outside
   * a class or object.
   * @returns {void} Appends matching declarations and methods to the result.
   */

  const IdSet=new Set();


  function buildID(name,owner,lineNumber){
    let id = owner !== null
      ? `${RelativePath}#${owner}.${name}`
      : `${RelativePath}#${name}`;

    if (IdSet.has(id)) {
      id += `@${lineNumber}`;
    }

    IdSet.add(id);
    return id;
  }


  function visitChilds(ast, owner = null) {
    switch (ast.type) {
      case "FunctionDeclaration": {
        const id = buildID(
          ast.id?.name ?? "default",
          null,
          ast.loc.start.line,
        );
        result.push(
          addResult(
            id,
            ast.id?.name ?? "default",
            null,
            "function",
            ast.loc.start.line,
            ast.loc.end.line,
          ),
        );
      }
      break;

      case "VariableDeclarator": {
        if (
          ast.id.type === "Identifier" &&
          ast.init !== null &&
          (ast.init.type === "ArrowFunctionExpression" ||
            ast.init.type === "FunctionExpression")
        ) {
          const id = buildID(ast.id.name, null, ast.init.loc.start.line);
          result.push(
            addResult(
              id,
              ast.id.name,
              null,
              "function",
              ast.init.loc.start.line,
              ast.init.loc.end.line,
            ),
          );
        }
        break;
      }

      case "MethodDefinition": {
        if (!ast.computed && ast.key.type === "Identifier") {
          const id = buildID(
            ast.key.name,
            owner,
            ast.value.loc.start.line,
          );
          result.push(
            addResult(
              id,
              ast.key.name,
              owner,
              "method",
              ast.value.loc.start.line,
              ast.value.loc.end.line,
            ),
          );
        }
        break;
      }

      case "Property": {
        const isFn =
          ast.value.type === "FunctionExpression" ||
          ast.value.type === "ArrowFunctionExpression";
        if (isFn && !ast.computed && ast.key.type === "Identifier") {
          const id = buildID(
            ast.key.name,
            owner,
            ast.value.loc.start.line,
          );
          result.push(
            addResult(
              id,
              ast.key.name,
              owner,
              "method",
              ast.value.loc.start.line,
              ast.value.loc.end.line,
            ),
          );
        }
        break;
      }
    }

    let nextOwner = owner;
    if (ast.type === "ClassDeclaration" || ast.type === "ClassExpression") {
      nextOwner = ast.id?.name ?? "default";
    } else if (
      ast.type === "VariableDeclarator" &&
      ast.id.type === "Identifier" &&
      ast.init?.type === "ObjectExpression"
    ) {
      nextOwner = ast.id.name; // methods inside get owner "obj"
    }

    for (const value of Object.values(ast)) {
      const children = Array.isArray(value) ? value : [value];
      for (const child of children) {
        if (isNode(child)) visitChilds(child, nextOwner,RelativePath);
      }
    }
  }
  visitChilds(ast);
  return result;
}

export default visit;
