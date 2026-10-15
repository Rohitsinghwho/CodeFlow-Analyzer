import fs from 'fs/promises';
import path from 'path';


const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.gitignore', 'test']);
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);

/**
 * Recursively finds supported JavaScript files below a directory.
 *
 * @param {string} dirPath The directory where scanning starts.
 * @param {string} rootPath The base path used for relative results.
 * @returns {Promise<string[]>} Sorted JavaScript file paths relative to rootPath.
 */
async function listJsFiles(dirPath, rootPath) {
    /**
     * Walks one directory branch without sorting intermediate results.
     *
     * @param {string} currentDir The directory branch to scan.
     * @returns {Promise<string[]>} JavaScript file paths found in the branch.
     */
    async function recurse(currentDir) {
        let result = [];
        
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            // Skips both ignored directories and ignored files early
            if (IGNORED.has(entry.name)) continue;

            const fullPath = path.join(currentDir, entry.name);
            const newPath = path.relative(rootPath, fullPath).split(path.sep).join('/');
            console.log('new Path: ',newPath)

            if (entry.isDirectory()) {
                result = result.concat(await recurse(fullPath));
            } else if (entry.isFile()) {
                // Fix: Handle potential uppercase extensions (.JS) safely
                const extension = path.extname(entry.name).toLowerCase();
                
                if (EXTENSIONS.has(extension)) {
                    result.push(newPath);
                }
            }
        }
        return result;
    }

    // Run recursion and execute sort exactly ONCE on the final complete array
    const allFiles = await recurse(dirPath);
    return allFiles.sort();
}

export default listJsFiles;
