import express from 'express'
import listJsFiles from './scanner/scanner.js';


const app= express();

try {
  const dirPath='D:/Github-profile-analaysis/src'
  const allFiles = await listJsFiles(dirPath,dirPath);
  console.log('All files found:', allFiles);
} catch (err) {
  console.error('Error reading directory:', err);
}
app.listen(5000,()=>{
    console.log('server is running!')
})