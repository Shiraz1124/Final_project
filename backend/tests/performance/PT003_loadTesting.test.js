// const { spawn } = require('child_process');
// const axios = require('axios');
// const path = require('path');
// const fs = require('fs');
// const urls = require('../urls.json'); // Contains { safe: [...], malicious: [...] }

// let openAIProcess, antivirusProcess;
// let resultReport = [];

// const CONCURRENCY = 10;
// const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// // Start both servers
// function startServers() {
//   const openAIPath = path.join(__dirname, '../../openAi_backend/openAi_server.js');
//   const antivirusPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');

//   console.log('🚀 Starting openAi_server...');
//   openAIProcess = spawn('node', [openAIPath], { stdio: 'inherit', shell: true });

//   console.log('🛡️ Starting antivirus_api_server...');
//   antivirusProcess = spawn('node', [antivirusPath], { stdio: 'inherit', shell: true });
// }

// // Send a scan request with timeout
// async function sendRequest(url, userId) {
//   const message = `I want to download this file: ${url}`;
//   const start = Date.now();

//   const timeoutPromise = new Promise((_, reject) =>
//     setTimeout(() => reject(new Error('⏰ Timeout after 10 minutes')), TIMEOUT_MS)
//   );

//   try {
//     const res = await Promise.race([
//       axios.post('http://localhost:3000/api/chat', { message }),
//       timeoutPromise
//     ]);

//     const duration = Date.now() - start;

//     console.log(`✅ User ${userId} - Status: ${res.status} - Time: ${duration}ms`);
//     resultReport.push({
//       user: userId,
//       url,
//       status: res.status,
//       duration,
//       timedOut: duration > TIMEOUT_MS,
//       message: res.data.result?.scan_result?.success ?? 'Unknown'
//     });

//   } catch (err) {
//     const duration = Date.now() - start;
//     const isTimeout = err.message.includes('Timeout');

//     console.error(`❌ User ${userId} - ${isTimeout ? '⏰ Timed out' : 'Error'} after ${duration}ms: ${err.message}`);
//     resultReport.push({
//       user: userId,
//       url,
//       status: 'Error',
//       duration,
//       timedOut: isTimeout,
//       message: 'N/A'
//     });
//   }
// }

// // Simulate 10 users scanning all URLs in parallel batches
// async function runLoadTest() {
//   console.log("⏳ Waiting 5s for servers to start...");
//   await new Promise(res => setTimeout(res, 5000));

//   const allUrls = [...urls.safe, ...urls.malicious];
//   const batches = Array.from({ length: CONCURRENCY }, () => []);

//   // Distribute URLs evenly across 10 simulated users
//   allUrls.forEach((url, i) => {
//     batches[i % CONCURRENCY].push(url);
//   });

//   // Each user handles their own batch
//   const userPromises = batches.map((batch, userIndex) =>
//     (async () => {
//       for (const url of batch) {
//         await sendRequest(url, userIndex + 1);
//       }
//     })()
//   );

//   await Promise.all(userPromises);

//   console.log("✅ PT-003 Load Test Completed");

//   // Write results
//   const reportText = resultReport.map(r =>
//     `User ${r.user} | Status: ${r.status} | Time: ${r.duration}ms | Timeout: ${r.timedOut ? 'YES' : 'No'} | URL: ${r.url} | message: ${r.message}`
//   ).join('\n');

//   const reportPath = path.join(__dirname, 'load_test_report.txt');
//   fs.writeFileSync(reportPath, reportText);
//   console.log(`📝 Report written to ${reportPath}`);

//   // Analyze responsiveness
//   const successful = resultReport.filter(r => r.status === 200 && !r.timedOut);
//   const slowResponses = successful.filter(r => r.duration > TIMEOUT_MS);
//   const percentSlow = (slowResponses.length / successful.length) * 100;

//   console.log(`📊 Slow responses (> 10 min): ${slowResponses.length} / ${successful.length} (${percentSlow.toFixed(1)}%)`);
//   if (percentSlow > 10) {
//     console.warn('❌ System failed responsiveness test: >10% of responses exceeded 10 minutes.');
//   } else {
//     console.log('✅ System remained responsive under load (within 10 minutes per request).');
//   }
// }

// // Kill both servers
// function stopServers() {
//   if (openAIProcess) openAIProcess.kill();
//   if (antivirusProcess) antivirusProcess.kill();
//   console.log('🛑 Servers stopped.');
// }

// // Entry point
// (async () => {
//   startServers();
//   await runLoadTest();
//   stopServers();
// })();



const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const urls = require('../urls.json'); // { safe: [...], malicious: [...] }

let openAIProcess, antivirusProcess;
let resultReport = [];

const CONCURRENCY = 10;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
jest.setTimeout(CONCURRENCY * TIMEOUT_MS + 30000); // ⏱️ Allow enough time

// 🟢 Start servers
beforeAll((done) => {
  const openAIPath = path.join(__dirname, '../../openAi_backend/openAi_server.js');
  const antivirusPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');

  console.log('🚀 Starting openAi_server...');
  openAIProcess = spawn('node', [openAIPath], { stdio: 'inherit', shell: true });

  console.log('🛡️ Starting antivirus_api_server...');
  antivirusProcess = spawn('node', [antivirusPath], { stdio: 'inherit', shell: true });

  setTimeout(done, 5000); // wait 5s
});

// 🔴 Stop servers
afterAll(() => {
  if (openAIProcess) openAIProcess.kill();
  if (antivirusProcess) antivirusProcess.kill();
  console.log('🛑 Servers stopped.');
});

describe('PT-003 Load Test: 10 Concurrent Users', () => {
  it('should keep ≥ 90% of responses under 10 minutes', async () => {
    const allUrls = [...urls.safe, ...urls.malicious];
    const batches = Array.from({ length: CONCURRENCY }, () => []);

    // 🔁 Evenly distribute URLs
    allUrls.forEach((url, i) => {
      batches[i % CONCURRENCY].push(url);
    });

    console.log(`🚨 Starting load test: ${CONCURRENCY} users scanning ${allUrls.length} URLs`);

    const userPromises = batches.map((batch, userIndex) =>
      (async () => {
        for (const url of batch) {
          await sendRequest(url, userIndex + 1);
        }
      })()
    );

    await Promise.all(userPromises);
    console.log("✅ PT-003 Load Test Completed");

    // 📝 Write report
    const reportText = resultReport.map(r =>
      `User ${r.user} | Status: ${r.status} | Time: ${r.duration}ms | Timeout: ${r.timedOut ? 'YES' : 'No'} | URL: ${r.url} | Message: ${r.message}`
    ).join('\n');

    const reportPath = path.join(__dirname, 'pt003_load_test_report.txt');
    fs.writeFileSync(reportPath, reportText);
    console.log(`📝 Report saved to: ${reportPath}`);

    // 📊 Analyze responsiveness
    const successful = resultReport.filter(r => r.status === 200 && !r.timedOut);
    const slowResponses = successful.filter(r => r.duration > TIMEOUT_MS);
    const percentSlow = (slowResponses.length / successful.length) * 100;

    console.log(`📊 Slow responses (> 10 min): ${slowResponses.length} / ${successful.length} (${percentSlow.toFixed(1)}%)`);

    // ✅ Assert that ≤ 10% of responses are slow
    expect(percentSlow).toBeLessThanOrEqual(10);
  });
});

// 🔁 Helper
async function sendRequest(url, userId) {
  const message = `I want to download this file: ${url}`;
  const start = Date.now();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('⏰ Timeout after 10 minutes')), TIMEOUT_MS)
  );

  try {
    const res = await Promise.race([
      axios.post('http://localhost:3000/api/chat', { message }),
      timeoutPromise
    ]);

    const duration = Date.now() - start;
    console.log(`✅ User ${userId} - Status: ${res.status} - Time: ${duration}ms`);

    resultReport.push({
      user: userId,
      url,
      status: res.status,
      duration,
      timedOut: duration > TIMEOUT_MS,
      message: res.data.result?.scan_result?.success ?? 'Unknown'
    });

  } catch (err) {
    const duration = Date.now() - start;
    const isTimeout = err.message.includes('Timeout');

    console.error(`❌ User ${userId} - ${isTimeout ? '⏰ Timed out' : 'Error'} after ${duration}ms: ${err.message}`);
    resultReport.push({
      user: userId,
      url,
      status: 'Error',
      duration,
      timedOut: isTimeout,
      message: 'N/A'
    });
  }
}
