/**
 * Knows how to recognise things in a syntax tree (AST) node.
 *
 * The Analyzer gives this class one node at a time and asks four questions:
 *   findFunctions(node)  - does this node define a function?
 *   findCalls(node)      - is this node a call?
 *   findImports(node)    - is this node an import?
 *   findExports(node)    - is this node an export?
 *
 * Each answer is a list (empty when the node is not what we look for).
 */
class RuleSet {
  /** Is this node an arrow function or a function expression? */
  isFunctionNode(node) {
    return (
      node?.type === "ArrowFunctionExpression" ||
      node?.type === "FunctionExpression"
    );
  }

  // ---------------------------------------------------------------- functions

  /**
   * Function definitions found in this node.
   * Each result is { name, kind, fnNode } where kind is:
   *   "function" - function greet() {}   or   const greet = () => {}
   *   "method"   - a class method, or a function inside an object
   *   "callback" - an inline function passed as an argument: setTimeout(() => {})
   */
  findFunctions(node) {
    switch (node.type) {
      case "FunctionDeclaration":
        // `export default function () {}` has no name, so call it "default".
        return [
          { name: node.id?.name ?? "default", kind: "function", fnNode: node },
        ];

      case "VariableDeclarator":
        // const greet = () => {}
        if (node.id.type === "Identifier" && this.isFunctionNode(node.init)) {
          return [{ name: node.id.name, kind: "function", fnNode: node.init }];
        }
        return [];

      case "MethodDefinition":
        // class A { run() {} }   or   class A { #run() {} }
        // (names written as [x]() are skipped)
        if (!node.computed && this.memberName(node.key) !== null) {
          return [
            {
              name: this.memberName(node.key),
              kind: "method",
              fnNode: node.value,
            },
          ];
        }
        return [];
      
      case "Property":
        // const o = { run() {} }   or   { run: () => {} }
        if (
          !node.computed &&
          node.key.type === "Identifier" &&
          this.isFunctionNode(node.value)
        ) {
          return [{ name: node.key.name, kind: "method", fnNode: node.value }];
        }
        return [];

      case "CallExpression":
      case "NewExpression":
        // setTimeout(() => {})   or   new Promise((resolve) => {})
        return node.arguments
          .filter((argument) => this.isFunctionNode(argument))
          .map((fnNode) => ({
            name: `anonymous@${fnNode.loc.start.line}`,
            kind: "callback",
            fnNode,
          }));

      default:
        return [];
    }
  }

  // -------------------------------------------------------------------- calls

  /**
   * Calls found in this node. Each result is
   * { calleeName, objectName, viaThis, kind } where kind is:
   *   "call" - foo()
   *   "new"  - new Foo()
   *   "ref"  - a function passed by name: list.map(transform)
   */
  findCalls(node) {
    if (node.type !== "CallExpression" && node.type !== "NewExpression") {
      return [];
    }

    const calls = [];

    // The call itself.
    const callee = this.describeCallee(node.callee);
    if (callee) {
      calls.push({
        ...callee,
        kind: node.type === "NewExpression" ? "new" : "call",
      });
    }

    // Functions passed by name as arguments. (Inline functions are already
    // reported by findFunctions, so they are skipped here.)
    for (const argument of node.arguments) {
      if (this.isFunctionNode(argument)) continue;
      const reference = this.describeCallee(argument);
      if (reference) {
        calls.push({ ...reference, kind: "ref" });
      }
    }

    return calls;
  }

  /**
   * Describe the thing being called:
   *   foo()            -> { calleeName: "foo",  objectName: null,  viaThis: false, rootObject: null }
   *   obj.save()       -> { calleeName: "save", objectName: "obj", viaThis: false, rootObject: "obj" }
   *   this.save()      -> { calleeName: "save", objectName: null,  viaThis: true,  rootObject: null }
   *   a.b.c()          -> { calleeName: "c",    objectName: "b",   viaThis: false, rootObject: "a" }
   *   this.store.save() -> { calleeName: "save", objectName: "this.store", viaThis: false, rootObject: null }
   *   a[b]()           -> { calleeName: null,    objectName: null,  viaThis: false, rootObject: "a" } (FIX-6: partial)
   * Returns null only for shapes where nothing at all can be determined (fn()()).
   */
  describeCallee(callee) {
    if (callee.type === "Identifier") {
      return { calleeName: callee.name, objectName: null, viaThis: false, rootObject: null };
    }

    if (callee.type === "MemberExpression") {
      const propName = callee.computed ? null : this.memberName(callee.property);

      // FIX-6: Even when the property is computed (a[b]()), capture what we can.
      if (propName === null && callee.computed) {
        const root = this.#walkToRoot(callee.object);
        return {
          calleeName: null,
          objectName: null,
          viaThis: false,
          rootObject: root,
        };
      }

      if (propName !== null) {
        const isThis = callee.object.type === "ThisExpression";
        const objectName = isThis ? null : this.nameOfObject(callee.object);
        // FIX-2: Walk the full chain to find the root identifier.
        const rootObject = isThis ? null : this.#walkToRoot(callee.object);

        return {
          calleeName: propName,
          objectName,
          viaThis: isThis,
          rootObject,
        };
      }
    }

    return null;
  }

  /**
   * Walk a MemberExpression chain to find the root identifier.
   *   obj          -> "obj"
   *   a.b          -> "a"
   *   a.b.c        -> "a"
   *   this.store   -> null (this-rooted chains are handled separately)
   *   fn()         -> null (call expression, not an identifier root)
   */
  #walkToRoot(node) {
    if (node.type === "Identifier") return node.name;
    if (node.type === "ThisExpression") return null;
    if (node.type === "MemberExpression") return this.#walkToRoot(node.object);
    return null;
  }

  // ------------------------------------------------------------------ imports

  /**
   * Imports found in this node. Each result is
   * { localName, importedName, source, external }:
   *   localName    the name used in this file
   *   importedName the name in the other file ("default" or "*" = whole module)
   *   source       the path text, e.g. "./file.js"
   *   external     true for packages such as "express"
   */
  findImports(node) {
    if (node.type === "ImportDeclaration") {
      // import a, { b as c }, * as d from "./file.js"
      return node.specifiers.map((specifier) => {
        let importedName;
        if (specifier.type === "ImportDefaultSpecifier") {
          importedName = "default";
        } else if (specifier.type === "ImportNamespaceSpecifier") {
          importedName = "*";
        } else {
          importedName = specifier.imported.name;
        }
        return this.makeImport(
          specifier.local.name,
          importedName,
          node.source.value,
        );
      });
    }

    // require() calls always sit inside a variable declaration.
    if (node.type === "VariableDeclarator") {
      return this.findRequires(node);
    }

    return [];
  }

  /** Build one import record (shared by import and require). */
  makeImport(localName, importedName, source) {
    return {
      localName,
      importedName,
      source,
      external: !String(source).trim().startsWith("."),
    };
  }

  /** If `expression` is require("some/path"), return the path; otherwise null. */
  requirePath(expression) {
    const isRequire =
      expression?.type === "CallExpression" &&
      expression.callee.type === "Identifier" &&
      expression.callee.name === "require" &&
      expression.arguments[0]?.type === "Literal";
    return isRequire ? expression.arguments[0].value : null;
  }

  /**
   * CommonJS imports:
   *   const a = require("./a")            whole module   (importedName "*")
   *   const x = require("./a").x          one member
   *   const { x, y: z } = require("./a")  several names
   */
  findRequires(declarator) {
    const init = declarator.init;
    if (!init) return [];

    // Find the path, and the ".x" after it if there is one.
    let source = this.requirePath(init);
    let member = null;
    if (source === null && init.type === "MemberExpression" && !init.computed) {
      source = this.requirePath(init.object);
      member = init.property.name;
    }
    if (source === null) return []; // not a require() at all

    const target = declarator.id;

    if (target.type === "Identifier") {
      return [this.makeImport(target.name, member ?? "*", source)];
    }

    if (target.type === "ObjectPattern") {
      // In { y: z } the key "y" is the name in the other file, "z" the local name.
      return target.properties
        .filter(
          (property) =>
            property.type === "Property" &&
            !property.computed &&
            property.key.type === "Identifier" &&
            property.value.type === "Identifier",
        )
        .map((property) =>
          this.makeImport(property.value.name, property.key.name, source),
        );
    }

    return [];
  }

  // ------------------------------------------------------------------ exports

  /**
   * Exports found in this node. Each result is { exportedName, localName }:
   * the name other files use, and the name used inside this file.
   * Re-exports from another file (`export { x } from "./y"`) are not handled yet.
   */
  findExports(node) {
    if (node.type === "ExportNamedDeclaration") {
      return this.findNamedExports(node);
    }
    if (node.type === "ExportDefaultDeclaration") {
      return this.findDefaultExport(node);
    }
    return [];
  }

  /**
   *   export function a() {}   -> a / a
   *   export const b = 1       -> b / b
   *   export { helper as e }   -> e / helper
   */
  findNamedExports(node) {
    if (node.source) return []; // re-export from another file

    const declaration = node.declaration;

    // export { a, b as c }
    if (!declaration) {
      return node.specifiers.map((specifier) => ({
        exportedName: specifier.exported.name,
        localName: specifier.local.name,
      }));
    }

    // export function a() {}   /   export class A {}
    if (
      declaration.type === "FunctionDeclaration" ||
      declaration.type === "ClassDeclaration"
    ) {
      return declaration.id
        ? [
            {
              exportedName: declaration.id.name,
              localName: declaration.id.name,
            },
          ]
        : [];
    }

    // export const a = 1, b = 2
    if (declaration.type === "VariableDeclaration") {
      return declaration.declarations
        .filter((declarator) => declarator.id.type === "Identifier")
        .map((declarator) => ({
          exportedName: declarator.id.name,
          localName: declarator.id.name,
        }));
    }

    return [];
  }

  /**
   *   export default function () {}  -> default / default
   *   export default helper          -> default / helper
   */
  findDefaultExport(node) {
    const declaration = node.declaration;

    if (
      declaration.type === "FunctionDeclaration" ||
      declaration.type === "ClassDeclaration"
    ) {
      return [
        {
          exportedName: "default",
          localName: declaration.id?.name ?? "default",
        },
      ];
    }
    if (declaration.type === "Identifier") {
      return [{ exportedName: "default", localName: declaration.name }];
    }
    return [];
  }

  /**
   * A readable name for the part before the dot in `thing.method()`:
   *   obj.save()          -> "obj"
   *   this.store.save()   -> "this.store"
   *   this.#store.save()  -> "this.#store"
   * Anything else (a[0].save(), getThing().save()) -> "(unknown)".
   */
  nameOfObject(object) {
    //obj
    if (object.type === "Identifier") {
      return object.name;
    }

    //this.store or this.#store
    const isThisField =
      object.type === "MemberExpression" &&
      object.object.type === "ThisExpression" &&
      !object.computed;
    if (isThisField) {
      const property = object.property;
      if (property.type === "Identifier") {
        return `this.${property.name}`;
      }
      if (property.type === "PrivateIdentifier") {
        return `this.#${property.name}`;
      }
    }
    return "(unknown)";
  }

  /**
   * The name of a method or property, or null if it is not a plain name.
   *   run   -> "run"
   *   #run  -> "#run"   (Acorn gives "run" for a PrivateIdentifier, so we add the "#")
   */
  memberName(key) {
    if (key.type === "Identifier") return key.name;
    if (key.type === "PrivateIdentifier") return `#${key.name}`;
    return null;
  }
}

export default RuleSet;
export { RuleSet };
