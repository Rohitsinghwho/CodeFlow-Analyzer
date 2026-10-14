
//Checks wether a node is valid to traverse or not

function isNode(value){
     if(value!==null && typeof value==='object'  &&typeof value.type ==='string'){
                return true;
    }
    return false;
}

export default isNode;