
import fs from 'fs/promises';

/**
 * Reads a file asynchronously as UTF-8 text.
 *
 * @param {string} path The path of the file to read.
 * @returns {Promise<string|null>} The file contents, or null when the path is
 * missing or the file cannot be read.
 */
async function Read(path){
    try {
        if(!path)return null;
        const contents= await fs.readFile(path,{encoding:'utf-8'});
        return contents;
    } catch (error) {
        console.log('Error coming form Read File: ',error.message);
        return null;
    }
}
export default Read;
