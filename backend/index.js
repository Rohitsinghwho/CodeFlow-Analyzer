import express from 'express'
import Parse from './parser/parser.js';
import visit from './helper/visitChild.js';



const app= express();
const path='D:/CodeFlow/sample-project/tiny.js'
const result=await Parse(path);
// console.log(JSON.stringify(result.ast,null,2));

const nodes=visit(result.ast);
console.log(nodes)
app.listen(5000,()=>{
    console.log('server is running!')
})