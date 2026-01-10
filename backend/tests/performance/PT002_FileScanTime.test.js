const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { handleURL, deleteFile } = require('../../file_handler'); // Adjust path as needed

jest.setTimeout(1500000); // ⏱️ 25 minutes max per test (in milliseconds)

let openAiProcess, antivirusProcess;

beforeAll((done) => {
  console.log('🚀 Launching OpenAI and Antivirus Backends...');

  const openAiPath = path.join(__dirname, '../../OpenAi_backend/openAi_server.js');
  const antivirusPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');

  openAiProcess = spawn('node', [openAiPath], {
    stdio: 'inherit',
    shell: true,
  });

  antivirusProcess = spawn('node', [antivirusPath], {
    stdio: 'inherit',
    shell: true,
  });

  setTimeout(() => {
    console.log('✅ Both backends should be ready.');
    done();
  }, 5000);
});

afterAll(() => {
  if (openAiProcess) {
    console.log('🛑 Stopping OpenAI backend...');
    openAiProcess.kill();
  }

  if (antivirusProcess) {
    console.log('🛡️ Stopping Antivirus backend...');
    antivirusProcess.kill();
  }
});

describe('FT-005 - Performance Test: 1GB File', () => {
  it('should download and process 1GB file within 25 minutes', async () => {
    const testURL = 'https://ash-speed.hetzner.com/1GB.bin';
    const maxSeconds = 1500; // ⏱️ 25 minutes

    const start = Date.now();

    let result;
    try {
      result = await handleURL(testURL);
    } catch (err) {
      console.error('❌ handleURL threw an error:', err.message);
      throw err;
    }

    const duration = (Date.now() - start) / 1000;
    console.log(`⏱️ Time taken: ${duration.toFixed(2)} seconds`);

    // ✅ Assertions
    expect(result).toHaveProperty('path');
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('scan_result');
    expect(result.scan_result).toHaveProperty('success', true);
    expect(duration).toBeLessThanOrEqual(maxSeconds);

    // 🧹 Optional cleanup
    if (result?.path && fs.existsSync(result.path)) {
      try {
        fs.unlinkSync(result.path);
        console.log(`🧹 Deleted downloaded file: ${result.path}`);
      } catch (err) {
        console.warn(`⚠️ Failed to delete file: ${err.message}`);
      }
    }
  });
});
