import * as acorn from "acorn"
import Read from '../helper/readFile.js';


/**
 * Reads and parses a JavaScript module into an Acorn AST.
 *
 * @param {string} path The path of the JavaScript file to parse.
 * @returns {Promise<{ast: object}|{error: string}|undefined>} The parsed AST,
 * a read-error result, or undefined when parsing throws.
 */
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

