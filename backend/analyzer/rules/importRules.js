function isExternalCheck(source){
  if (source === null || source === undefined) {
    return false;
  }

  const src = String(source);
  let index = 0;

  while (src[index] === " ") index += 1;
  return index < src.length && src[index] !== ".";
}

function makeImport(localName, importedName, source) {
  return {
    localName,
    importedName,
    source,
    external: isExternalCheck(source),
  };
}

function importRule(node) {
  const source = node.source.value;
  const result = [];

  for (const specifier of node.specifiers) {
    switch (specifier.type) {
      case "ImportDefaultSpecifier":
        result.push(makeImport(specifier.local.name, "default", source));
        break;
      case "ImportSpecifier":
        result.push(
          makeImport(specifier.local.name, specifier.imported.name, source),
        );
        break;
      case "ImportNamespaceSpecifier":
        result.push(makeImport(specifier.local.name, "*", source));
        break;
    }
  }

  return result;
}

function getRequireSource(node) {
  if (
    node?.type !== "CallExpression" ||
    node.callee?.type !== "Identifier" ||
    node.callee.name !== "require"
  ) {
    return null;
  }

  const argument = node.arguments[0];
  return argument?.type === "Literal" && typeof argument.value === "string"
    ? argument.value
    : null;
}

function requireRule(node) {
  if (node.id === undefined || node.init === undefined) {
    return [];
  }

  let source = getRequireSource(node.init);
  let member = null;

  if (source === null && node?.init?.type === "MemberExpression") {
    source = getRequireSource(node.init.object);
    if (
      source !== null &&
      !node.init.computed &&
      node.init.property.type === "Identifier"
    ) {
      member = node.init.property.name;
    } else {
      return [];
    }
  }

  if (source === null) {
    return [];
  }

  if (node.id.type === "Identifier") {
    return [makeImport(node.id.name, member ?? "*", source)];
  }

  if (node.id.type !== "ObjectPattern") {
    return [];
  }

  return node.id.properties.flatMap((property) => {
    if (
      property.type !== "Property" ||
      property.computed ||
      property.key.type !== "Identifier" ||
      property.value.type !== "Identifier"
    ) {
      return [];
    }

    return [makeImport(property.value.name, property.key.name, source)];
  });
}

const importRules = {
  ImportDeclaration: importRule,
  VariableDeclarator: requireRule,
};

export {
  getRequireSource,
  importRule,
  isExternalCheck,
  makeImport,
  requireRule,
};
export default importRules;