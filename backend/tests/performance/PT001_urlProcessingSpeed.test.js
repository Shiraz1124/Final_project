const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { handleURL,deleteFile } = require('../../file_handler'); // ✅ Adjust as needed

jest.setTimeout(720000); // Allow 12 minutes for download & scan
let scanBackendProcess;

beforeAll((done) => {
  console.log('🚀 Launching openAi Scan Backend...');

  const backendPath = path.join(__dirname, '../../OpenAi_backend/openAi_server.js');
  scanBackendProcess = spawn('node', [backendPath], {
    stdio: 'inherit',
    shell: true
  });

  // Wait 3 seconds before running tests (ensure server is ready)
  setTimeout(() => {
    console.log('✅ openAi backend should be ready.');
    done();
  }, 3000);
});

afterAll(() => {
  if (scanBackendProcess) {
    console.log('🛑 Stopping openAi backend...');
    scanBackendProcess.kill();
  }
});





// 🧪 ZIP file scan with time limit
describe('test xapk file', () => {
  it('should download xapk file within 3 sec', async () => {
    const testURL = 'https://ash-speed.hetzner.com/1GB.bin';

    const start = Date.now(); // Start timer

    const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning

    const duration = (Date.now() - start) / 1000; // in seconds
    console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

    // Core expectations
    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('filename');
    // Time expectation (max 600 seconds = 10 minutes)
    expect(duration).toBeLessThanOrEqual(600);
  });
});


// // 🧪 ZIP file scan with time limit
// describe('Measure torrent file processing speed', () => {
//   it('should download and process the torrent file within 10 minutes', async () => {
//     const testURL = 'magnet:?xt=urn:btih:8F31465D995B905300FE4504290D15A6E91F9EF2&dn=WindowTop+Pro+v5.26.17+%2B+Crack&tr=http%3A%2F%2Fbt.poletracker.org%3A2710%2Fannounce&tr=http%3A%2F%2Ftracker.ipv6tracker.org%2Fannounce&tr=http%3A%2F%2Ftracker.vanitycore.co%3A6969%2Fannounce&tr=http%3A%2F%2Fwww.torrentsnipe.info%3A2701%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.tiny-vps.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.open-internet.nl%3A6969%2Fannounce&tr=udp%3A%2F%2Fopen.demonii.si%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Fdenis.stalker.upeer.me%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce ';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });


// // 🧪 ZIP file scan with time limit
// describe('test xapk file', () => {
//   it('should download and scan xapk file within 10 minutes', async () => {
//     const testURL = 'https://d.apkpure.net/b/XAPK/com.ea.gp.fifamobile?version=latest';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning

//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });


// 🧪 ZIP file scan with time limit
// describe('Measure torrent file processing speed', () => {
//   it('should download and process the torrent file within 10 minutes', async () => {
//     const testURL = 'magnet:?xt=urn:btih:8F31465D995B905300FE4504290D15A6E91F9EF2&dn=WindowTop+Pro+v5.26.17+%2B+Crack&tr=http%3A%2F%2Fbt.poletracker.org%3A2710%2Fannounce&tr=http%3A%2F%2Ftracker.ipv6tracker.org%2Fannounce&tr=http%3A%2F%2Ftracker.vanitycore.co%3A6969%2Fannounce&tr=http%3A%2F%2Fwww.torrentsnipe.info%3A2701%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.tiny-vps.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.open-internet.nl%3A6969%2Fannounce&tr=udp%3A%2F%2Fopen.demonii.si%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Fdenis.stalker.upeer.me%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce ';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });




// describe('Measure exe file processing speed', () => {
//   it('should download and process the exe file within 10 minutes', async () => {
//     const testURL = 'https://www.python.org/ftp/python/3.12.0/python-3.12.0-amd64.exe';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });



// describe('Measure zip file processing speed', () => {
//   it('should download and process the zip file within 10 minutes', async () => {
//     const testURL = 'https://github.com/microsoft/terminal/releases/download/v1.18.3181.0/Microsoft.WindowsTerminal_1.18.3181.0_x64.zip ';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });


// describe('Measure pdf file processing speed', () => {
//   it('should download and process the pdf file within 10 minutes', async () => {
//     const testURL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf ';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });


// describe('Measure jpg file processing speed', () => {
//   it('should download and process the jpg file within 10 minutes', async () => {
//     const testURL = 'https://assets.epicurious.com/photos/57c5c6d9cf9e9ad43de2d96e/1:1/w_2560%2Cc_limit/the-ultimate-hamburger.jpg';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });






// describe('Measure msi file processing speed', () => {
//   it('should download and process the msi file within 10 minutes', async () => {
//     const testURL = 'https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi';

//     const start = Date.now(); // Start timer

//     const result = await handleURL(testURL, true); // skipScan = true if you want to skip scanning
//     try {
//         await deleteFile(result.path);
//       } catch (err) {
//         console.warn('⚠️ Failed to delete file:', err.message);
//       }
//     const duration = (Date.now() - start) / 1000; // in seconds
//     console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

//     // Core expectations
//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     // Time expectation (max 600 seconds = 10 minutes)
//     expect(duration).toBeLessThanOrEqual(600);
//   });
// });




















