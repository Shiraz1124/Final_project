const archiver = require('archiver');
const fs = require('fs');

async function zipFolder(folderPath, zipPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`📦 Zipped folder: ${zipPath} (${archive.pointer()} bytes)`);
      resolve(zipPath);
    });

    archive.on('error', err => reject(err));

    archive.pipe(output);
    archive.directory(folderPath, false);
    archive.finalize();
  });
}
module.exports = {zipFolder};