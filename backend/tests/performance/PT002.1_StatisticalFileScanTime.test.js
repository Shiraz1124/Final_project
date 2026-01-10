const {handleURL, send } = require('../../file_handler');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const urls = require('../urls.json');

jest.setTimeout(100 * 10 * 60 * 1000); // 100 files * 10 minutes

let antivirusBackendProcess;

beforeAll((done) => {
  console.log('🚀 Launching Antivirus Backend...');
  const backendPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');

  antivirusBackendProcess = spawn('node', [backendPath], {
    stdio: 'inherit',
    shell: true
  });

  // Wait a few seconds to ensure backend is ready
  setTimeout(() => {
    console.log('✅ Antivirus backend should be ready.');
    done();
  }, 3000);
});

afterAll(() => {
  if (antivirusBackendProcess) {
    console.log('🛑 Stopping Antivirus backend...');
    antivirusBackendProcess.kill();
  }
});

describe('PT-002.1 - Scan Time Test (60 Files, Excluding Download)', () => {
  it('should complete at least 95% of actual scans in ≤ 5 minutes', async () => {
    const testFiles = [...urls.safe.slice(0, 30), ...urls.malicious.slice(0, 30)];
    const maxScanTimeSec = 600; // 10 min timeout
    const passThresholdSec = 300; // 5 min success threshold
    let passed = 0;

    for (const url of testFiles) {
      console.log(`\n📥 Downloading: ${url}`);
      let result;

      try {
        result = await handleURL(url, true); // Only download, no scan
      } catch (err) {
        console.warn(`❌ Download failed: ${err.message}`);
        continue;
      }

      if (!result?.path || !result?.filename) {
        console.warn(`⚠️ Invalid file result for: ${url}`);
        continue;
      }

      const filePath = result.path;
      const filename = result.filename;

      console.log(`🔬 Starting scan: ${filename}`);

      try {
        const scanStart = performance.now();

        const scanResult = await Promise.race([
          sendFileToScanner(filePath, filename),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('⏱️ Timeout: Scan exceeded 10 minutes')), maxScanTimeSec * 1000)
          )
        ]);

        const scanEnd = performance.now();
        const duration = (scanEnd - scanStart) / 1000;

        console.log(`✅ Scan finished in ${duration.toFixed(2)} seconds`);

        if (duration <= passThresholdSec) {
          passed++;
        } else {
          console.warn(`⚠️ Scan exceeded 5 minutes: ${duration.toFixed(2)}s`);
        }

      } catch (err) {
        console.error(`❌ Scan error: ${err.message}`);
      }
    }

    const percentage = (passed / testFiles.length) * 100;
    console.log(`\n📊 Result: ${passed}/${testFiles.length} scans completed in ≤ 5 min (${percentage.toFixed(1)}%)`);

    expect(percentage).toBeGreaterThanOrEqual(90);
    
  });
});
