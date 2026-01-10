const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

jest.setTimeout(120 * 60 * 1000); // 30 minutes timeout

describe('PT-003.1 Stress Test: 50 concurrent users using 30 randomized URLs', () => {
  const TOTAL_USERS = 50;
  const ENDPOINT = 'http://localhost:3000/api/chat';

  let openAIProcess, antivirusProcess;

  // ✅ Load & shuffle URLs
  const urlsPath = path.join(__dirname, '../urls.json');
  const urlsData = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
  const allUrls = [...urlsData.safe, ...urlsData.malicious];

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  const randomizedUrls = shuffle(allUrls).slice(0, 30); // 🔀 Pick 30 random URLs

  // ✅ Start servers before test
  beforeAll((done) => {
    const openAIPath = path.join(__dirname, '../../openAi_backend/openAi_server.js');
    const antivirusPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');

    console.log('🚀 Starting OpenAI server...');
    openAIProcess = spawn('node', [openAIPath], { stdio: 'inherit', shell: true });

    console.log('🛡️ Starting Antivirus API server...');
    antivirusProcess = spawn('node', [antivirusPath], { stdio: 'inherit', shell: true });

    // ⏳ Give servers time to boot
    setTimeout(done, 8000);
  });

  // ✅ Stop servers after test
  afterAll(() => {
    if (openAIProcess) openAIProcess.kill();
    if (antivirusProcess) antivirusProcess.kill();
  });

  it('should handle 80%+ of concurrent scan requests successfully', async () => {
    const start = performance.now();

    let completedCount = 0;

    // 🔁 Create 50 concurrent requests
    const requests = Array.from({ length: TOTAL_USERS }).map((_, index) => {
      const url = randomizedUrls[index % randomizedUrls.length];
      const message = `Hi, I'm going to download this file: ${url}, please don't block it.`;

      return axios.post(ENDPOINT, { message })
        .then(res => {
          completedCount++;
          console.log(`✅ File scanned (${completedCount}/${TOTAL_USERS}): ${url}`);
          return {
            success: true,
            status: res.status,
            verdict: res.data?.result?.scan_result?.verdict || 'no verdict',
            url
          };
        })
        .catch(err => {
          completedCount++;
          console.log(`⚠️ File failed (${completedCount}/${TOTAL_USERS}): ${url}`);
          return {
            success: false,
            error: err.message,
            url
          };
        });
    });

    const results = await Promise.all(requests);

    const duration = ((performance.now() - start) / 1000).toFixed(2);
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    const successRate = ((successful / TOTAL_USERS) * 100).toFixed(2);

    // 📊 Log results
    console.log(`\n=== Stress Test Summary ===`);
    console.log(`🕒 Duration: ${duration}s`);
    console.log(`✅ Success: ${successful}/${TOTAL_USERS} (${successRate}%)`);
    console.log(`❌ Failed: ${failed}/${TOTAL_USERS}`);
    console.log(`===========================`);

    // ❌ Log failed requests
    if (failed > 0) {
      console.log('\n❌ Failed Requests:');
      results
        .filter(r => !r.success)
        .forEach((r, i) => {
          console.log(`  ${i + 1}. URL: ${r.url}`);
          console.log(`     Error: ${r.error}`);
        });
    }

    // ✅ Assert 80% success rate
    return expect(successful).toBeGreaterThanOrEqual(TOTAL_USERS * 0.8);
  });
});
