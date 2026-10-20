import path from 'path';


const modules=['.js','.mjs','.cjs']

/**
 * Resolves a relative module import against the files discovered in a project.
 *
 * Package imports are ignored. Relative imports are checked as an exact file
 * path, then with the supported JavaScript extensions, and finally as an
 * `index.js` file inside a directory.
 *
 * @param {string} fromFile The normalized path of the file containing the import.
 * @param {string} source The module specifier from the import or require call.
 * @param {Set<string>} fileSet The discovered project file paths.
 * @returns {string|null} The resolved project-relative file path, or `null`
 * when the source is external or no matching file exists.
 */
function resolveModule(fromFile,source,fileSet){
    if(!String(source).startsWith('.')){
        return null;
    }

    let folder=path.posix.dirname(fromFile);
    let target=path.posix.join(folder,source);
    let indexTarget=path.posix.join(target,'index.js')
    if(fileSet.has(target))return target;
    for(let i=0;i<modules.length;i++){
        if(fileSet.has(`${target}${modules[i]}`))return `${target}${modules[i]}`
    }
    if(fileSet.has(indexTarget))return indexTarget;
    return null;
}

export default resolveModule;