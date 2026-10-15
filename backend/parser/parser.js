import * as acorn from "acorn"
import Read from '../helper/readFile.js';


/**
 * Reads and parses a JavaScript module into an Acorn AST.
 *
 * @param {string} path The path of the JavaScript file to parse.
 * @returns {Promise<{ast: object}|{file: string, error: string}>} The parsed
 * AST or a structured error result.
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
    
        result.file = path;
        result.error='Failed to read the file';
        return result;
        
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const line = error?.loc?.line;
        const column = error?.loc?.column;
        const location = line === undefined
            ? ''
            : ` (line ${line}, column ${column ?? 0})`;

        return {
            file: path,
            error: `${message}${location}`,
        };
    }
}

export default Parse;
