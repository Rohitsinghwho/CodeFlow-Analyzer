import { isFunctionNode } from "./checkNode.js";

function functionDeclarationRule(node) {
  return [
    {
      name: node.id?.name ?? "default",
      kind: "function",
      fnNode: node,
    },
  ];
}

function variableDeclaratorRule(node) {
  if (node.id.type !== "Identifier" || !isFunctionNode(node.init)) {
    return [];
  }
  if(node.init==='ClassExpression'){
    return [{
      name:node.id.name
    }]
  }
  return [
    {
      name: node.id.name,
      kind: "function",
      fnNode: node.init,
    },
  ];
}

function methodDefinitionRule(node) {
  if (node.computed || node.key.type !== "Identifier") {
    return [];
  }

  return [
    {
      name: node.key.name,
      kind: "method",
      fnNode: node.value,
    },
  ];
}

function propertyRule(node) {
  if (
    node.computed ||
    node.key.type !== "Identifier" ||
    !isFunctionNode(node.value)
  ) {
    return [];
  }

  return [
    {
      name: node.key.name,
      kind: "method",
      fnNode: node.value,
    },
  ];
}

function callbackRule(node) {
  return node.arguments
    .filter(isFunctionNode)
    .map((fnNode) => ({
      name: `anonymous@${fnNode.loc.start.line}`,
      kind: "callback",
      fnNode,
    }));
}



const functionRules = {
  FunctionDeclaration: functionDeclarationRule,
  VariableDeclarator: variableDeclaratorRule,
  MethodDefinition: methodDefinitionRule,
  Property: propertyRule,
  CallExpression: callbackRule,
  NewExpression:callbackRule

};

export {
  callbackRule,
  functionDeclarationRule,
  methodDefinitionRule,
  propertyRule,
  variableDeclaratorRule,
};
export default functionRules;
