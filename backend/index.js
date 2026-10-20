import express from 'express'
import { Parse } from './parser/index.js';
import { visit } from './analyzer/index.js';
import path from 'path';


const app= express();
const pathh='D:/CodeFlow/sample-project/tiny.js'
const root='D:/CodeFlow';
const file=path.join(root,'sample-project/tiny.js');
const rel=path.relative(root,file).split(path.sep).join('/')
const result=await Parse(pathh);
const { functions, calls ,imports ,exports} =visit(result.ast,rel);
console.log(exports)
app.listen(5000,()=>{
    console.log('server is running!')
})
