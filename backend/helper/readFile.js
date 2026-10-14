
import fs from 'fs/promises';

/**
 * Reads a file async way
 * @param {*} path 
 * @returns contents || null
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

