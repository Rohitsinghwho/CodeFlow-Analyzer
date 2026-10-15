

function addResult(id,name,owner,kind,line,endLine){
    return {
        id:id,
        name:name,
        owner:owner,
        kind:kind,
        line:line,
        endLine:endLine
    }
}

export default addResult;