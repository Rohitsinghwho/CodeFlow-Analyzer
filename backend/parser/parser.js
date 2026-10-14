import * as acorn from "acorn"
import Read from '../helper/readFile.js';



async function Parse(path){
    try {
        const result={};
        const contents= await Read(path);
        if(contents!==null){
            const options={
                ecmaVersion:'latest',
                locations:true,
                sourceType: 'module'
            }
            const ast= acorn.parse(contents,options);
            result.ast=ast;
            // console.log(JSON.stringify(ast,null,2));
            return result;
        }
    
        console.log('Failed to Read the file');
        result.error='Failed to Read the file';
        return result;
        
    } catch (error) {
        const file=path.split('/');
        console.log(`error in parsing the file ${file[file.length-1]}.\nError: ${error.message}`,'at',error.loc);
    }
}

export default Parse;


