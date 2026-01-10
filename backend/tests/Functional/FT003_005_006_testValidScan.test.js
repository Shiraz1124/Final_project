const path = require('path');
const { spawn } = require('child_process');
const { handleURL } = require('../../file_handler');
const fs = require('fs');
jest.setTimeout(720000);

let scanBackendProcess;

beforeAll((done) => {
  console.log('🚀 Launching Antivirus Scan Backend...');

  const backendPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');
  scanBackendProcess = spawn('node', [backendPath], {
    stdio: 'inherit',
    shell: true
  });

  // Wait 3 seconds before running tests (ensure server is ready)
  setTimeout(() => {
    console.log('✅ Antivirus backend should be ready.');
    done();
  }, 3000);
});

afterAll(() => {
  if (scanBackendProcess) {
    console.log('🛑 Stopping Antivirus backend...');
    scanBackendProcess.kill();
  }
});


// 🧪 ZIP file scan
// describe('test xapk file', () => {
//   test('should download and scan xapk file', async () => {
//     const testURL = 'https://d.apkpure.net/b/XAPK/com.ea.gp.fifamobile?version=latest';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
//   });
// });





// // 🧪 ZIP file scan
// describe('test zip file', () => {
//   it('should download and scan zip file', async () => {
//     const testURL = 'https://github.com/zhongyang219/TrafficMonitor/releases/download/V1.84/TrafficMonitor_V1.84_x64.zip';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
//   });
// });



// 🧪 Torrent file scan
describe('torrent file scan test', () => {
  it('should download and scan torrent contents', async () => {
    const testMagnet = 'magnet:?xt=urn:btih:A53E3226A59F4032EEFA26CEFE6A9BDEE17AA970&dn=KMSpico%2010.1.8%20FINAL%20%2B%20Portable%20(Office%20and%20Windows%2010%20Activator)&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337';

    const result = await handleURL(testMagnet);

    console.log("🧪 Torrent scan result:", result);

    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('scan_result');
    expect(typeof result.scan_result).toBe('object');
    expect(result.scan_result).not.toBeNull();
    expect(result.scan_result.success).toBe(true);
    
  });
});

// // 🧪 PDF file scan
// describe('test pdf file', () => {
//   it('should download and scan pdf file', async () => {
//     const testURL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
    
//   });
// });


// // 🧪 MSI file scan
// describe('test msi file', () => {
//   it('should download and scan msi file', async () => {
//     const testURL = 'https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
    
//   });
// });


// // 🧪 MSI file scan
// describe('test exe file', () => {
//   it('should download and scan exe file', async () => {
//     const testURL = 'https://dl.google.com/chrome/install/375.126/chrome_installer.exe';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
    
//   });
// });


// // 🧪 txt file scan
// describe('test txt file', () => {
//   it('should download and scan txt file', async () => {
//     const testURL = 'https://secure.eicar.org/eicar.com.txt ';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
    
//   });
// });

// // 🧪 PNG file scan
// describe('test png file', () => {
//   it('should download and scan png file', async () => {
//     const testURL = 'https://hoopshype.com/wp-content/uploads/sites/92/2024/12/i_11_f5_9a_lebron-james.png';

//     const result = await handleURL(testURL);

//     console.log("🧪 URL scan result:", result);

//     expect(result).toHaveProperty('path');
//     expect(result).toHaveProperty('filename');
//     expect(result).toHaveProperty('scan_result');
//     expect(typeof result.scan_result).toBe('object');
//     expect(result.scan_result).not.toBeNull();
//     expect(result.scan_result.success).toBe(true);
    
//   });
// });
















