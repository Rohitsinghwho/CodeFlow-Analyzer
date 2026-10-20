import { isFunctionNode } from "../../utils/index.js";
/**
 * Reads the callee name from a call's callee node.
 * @param {object} callee The `callee` node of a call or new expression.
 * @returns {?{calleeName: string, objectName, viaThis: boolean}} null when unreadable..
 */
function getCalleeInfo(callee) {
  if (callee.type === "Identifier") {
    return { calleeName: callee.name, objectName:null,viaThis:false };
  }
  if (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier"
  ) {
    return {
      calleeName: callee.property.name,
      objectName:callee.object.type==='Identifier'?callee.object.name:null,
      viaThis: callee.object.type === "ThisExpression",
    };
  }
  return null; // handlers[x](), super(), (a || b)()
}

function callRule(node) {
  const descriptions=[];
  const info = getCalleeInfo(node.callee);
  if(info){
    descriptions.push({...info,kind:node.type==='NewExpression'?'new':'call'})
  }
  for(const arg of node.arguments){
    if(isFunctionNode(arg))continue;
    const argInfo=getCalleeInfo(arg);
    if(argInfo)descriptions.push({...argInfo,kind:'ref'})
  }
  return descriptions
}

const callRules = {
  CallExpression: callRule,
  NewExpression: callRule,
};

export { getCalleeInfo };
export default callRules;