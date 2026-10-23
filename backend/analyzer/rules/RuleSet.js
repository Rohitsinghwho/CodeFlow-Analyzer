class RuleSet {
  isFunctionNode(node) {
    return node?.type === "ArrowFunctionExpression" || node?.type === "FunctionExpression";
  }

  functionRule(type) {
    const rules = {
      FunctionDeclaration: (node) => [{
        name: node.id?.name ?? "default", kind: "function", fnNode: node,
      }],
      VariableDeclarator: (node) => (
        node.id.type === "Identifier" && this.isFunctionNode(node.init)
          ? [{ name: node.id.name, kind: "function", fnNode: node.init }]
          : []
      ),
      MethodDefinition: (node) => (
        !node.computed && node.key.type === "Identifier"
          ? [{ name: node.key.name, kind: "method", fnNode: node.value }]
          : []
      ),
      Property: (node) => (
        !node.computed && node.key.type === "Identifier" && this.isFunctionNode(node.value)
          ? [{ name: node.key.name, kind: "method", fnNode: node.value }]
          : []
      ),
      CallExpression: (node) => node.arguments
        .filter((argument) => this.isFunctionNode(argument))
        .map((fnNode) => ({ name: `anonymous@${fnNode.loc.start.line}`, kind: "callback", fnNode })),
      NewExpression: (node) => node.arguments
        .filter((argument) => this.isFunctionNode(argument))
        .map((fnNode) => ({ name: `anonymous@${fnNode.loc.start.line}`, kind: "callback", fnNode })),
    };
    return rules[type];
  }

  calleeInfo(callee) {
    if (callee.type === "Identifier") {
      return { calleeName: callee.name, objectName: null, viaThis: false };
    }
    if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier") {
      return {
        calleeName: callee.property.name,
        objectName: callee.object.type === "Identifier" ? callee.object.name : null,
        viaThis: callee.object.type === "ThisExpression",
      };
    }
    return null;
  }

  callRule(type) {
    if (type !== "CallExpression" && type !== "NewExpression") return undefined;
    return (node) => {
      const descriptions = [];
      const info = this.calleeInfo(node.callee);
      if (info) descriptions.push({ ...info, kind: type === "NewExpression" ? "new" : "call" });
      for (const argument of node.arguments) {
        if (this.isFunctionNode(argument)) continue;
        const argumentInfo = this.calleeInfo(argument);
        if (argumentInfo) descriptions.push({ ...argumentInfo, kind: "ref" });
      }
      return descriptions;
    };
  }

  importRule(type) {
    if (type === "ImportDeclaration") {
      return (node) => node.specifiers.map((specifier) => ({
        localName: specifier.local.name,
        importedName: specifier.type === "ImportDefaultSpecifier"
          ? "default"
          : specifier.type === "ImportNamespaceSpecifier" ? "*" : specifier.imported.name,
        source: node.source.value,
        external: !String(node.source.value).trim().startsWith("."),
      }));
    }
    return type === "VariableDeclarator" ? this.requireRule.bind(this) : undefined;
  }

  requireRule(node) {
    if (!node.id || !node.init) return [];
    let source = null;
    let member = null;
    if (node.init.type === "CallExpression" && node.init.callee.type === "Identifier" &&
      node.init.callee.name === "require" && node.init.arguments[0]?.type === "Literal") {
      source = node.init.arguments[0].value;
    } else if (node.init.type === "MemberExpression" && !node.init.computed &&
      node.init.object?.callee?.name === "require" && node.init.object.arguments[0]?.type === "Literal") {
      source = node.init.object.arguments[0].value;
      member = node.init.property.name;
    }
    if (source === null) return [];
    const make = (localName, importedName) => ({
      localName, importedName, source, external: !String(source).trim().startsWith("."),
    });
    if (node.id.type === "Identifier") return [make(node.id.name, member ?? "*")];
    if (node.id.type !== "ObjectPattern") return [];
    return node.id.properties.flatMap((property) =>
      property.type === "Property" && !property.computed &&
      property.key.type === "Identifier" && property.value.type === "Identifier"
        ? [make(property.value.name, property.key.name)] : []);
  }

  exportRule(type) {
    if (type === "ExportNamedDeclaration") {
      return (node) => {
        if (node.source) return [];
        if (node.declaration) {
          const declaration = node.declaration;
          if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
            return declaration.id ? [{ exportedName: declaration.id.name, localName: declaration.id.name }] : [];
          }
          if (declaration.type === "VariableDeclaration") {
            return declaration.declarations
              .filter((declarator) => declarator.id.type === "Identifier")
              .map((declarator) => ({ exportedName: declarator.id.name, localName: declarator.id.name }));
          }
          return [];
        }
        return node.specifiers.map((specifier) => ({
          exportedName: specifier.exported.name,
          localName: specifier.local.name,
        }));
      };
    }
    if (type === "ExportDefaultDeclaration") {
      return (node) => {
        const declaration = node.declaration;
        if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
          return [{ exportedName: "default", localName: declaration.id?.name ?? "default" }];
        }
        return declaration.type === "Identifier"
          ? [{ exportedName: "default", localName: declaration.name }] : [];
      };
    }
    return undefined;
  }
}

export default RuleSet;
export { RuleSet };
