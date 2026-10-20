
function makeExport(exportedName, localName) {
  return {
    exportedName,
    localName,
  };
}

function namedExportRule(node) {
  if (node.source) {
    return [];
  }

  if (node.declaration) {
    const declaration = node.declaration;

    if (
      declaration.type === "FunctionDeclaration" ||
      declaration.type === "ClassDeclaration"
    ) {
      return declaration.id
        ? [makeExport(declaration.id.name, declaration.id.name)]
        : [];
    }

    if (declaration.type === "VariableDeclaration") {
      return declaration.declarations
        .filter((declarator) => declarator.id.type === "Identifier")
        .map((declarator) =>
          makeExport(declarator.id.name, declarator.id.name),
        );
    }

    return [];
  }

  return node.specifiers.map((specifier) =>
    makeExport(specifier.exported.name, specifier.local.name),
  );
}

function defaultExportRule(node) {
  const declaration = node.declaration;

  if (
    declaration.type === "FunctionDeclaration" ||
    declaration.type === "ClassDeclaration"
  ) {
    return [
      makeExport(
        "default",
        declaration.id?.name ?? "default",
      ),
    ];
  }

  if (declaration.type === "Identifier") {
    return [makeExport("default", declaration.name)];
  }

  return [];
}

const exportRules = {
  ExportNamedDeclaration: namedExportRule,
  ExportDefaultDeclaration: defaultExportRule,
};

export {
  defaultExportRule,
  makeExport,
  namedExportRule,
};
export default exportRules;