import express from 'express'
import Parse from './parser/parser.js';
import visit from './helper/visitChild.js';
import path from 'path';


const app= express();
const pathh='D:/CodeFlow/sample-project/tiny.js'
const root='D:/CodeFlow';
const file=path.join(root,'sample-project/tiny.js');
const rel=path.relative(root,file).split(path.sep).join('/')
const result=await Parse(pathh);
// console.log(JSON.stringify(result.ast,null,2));

const { functions, calls } =visit(result.ast,rel);
console.log(functions);
console.log(calls);
app.listen(5000,()=>{
    console.log('server is running!')
})