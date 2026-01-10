// const axios = require('axios');
// const fs = require('fs');
// const path = require('path');
// const urls = require('../urls.json'); // { safe: [...], malicious: [...] }

// const allUrls = [...urls.safe, ...urls.malicious];
// const TIME_LIMIT_MS = 10 * 60 * 1000; // ⏱️ 10 minutes
// const results = [];

// async function testLargeFileProcessing() {
//   console.log(`📦 Starting PT-005: Large File Processing Test on ${allUrls.length} URLs`);

//   for (let i = 0; i < allUrls.length; i++) {
//     const url = allUrls[i];
//     const message = `I want to download this file: ${url}`;
//     const start = Date.now();
//     let status = 'Success';
//     let duration = 0;

//     try {
//       const res = await axios.post('http://localhost:3000/api/chat', { message });
//       duration = Date.now() - start;

//       const success = res.data?.result?.scan_result?.success ?? false;
//       if (!success) status = 'ScanFailed';

//     } catch (err) {
//       duration = Date.now() - start;
//       status = `Error: ${err.message}`;
//     }

//     console.log(`File ${i + 1}/${allUrls.length} | Status: ${status} | Time: ${duration}ms | URL: ${url}`);
//     results.push({ index: i + 1, url, status, duration });
//   }

//   // Write results to file
//   const reportText = results.map(r =>
//     `File ${r.index} | Status: ${r.status} | Time: ${r.duration}ms | Within 10min: ${r.duration <= TIME_LIMIT_MS ? '✅' : '❌'} | URL: ${r.url}`
//   ).join('\n');

//   const reportPath = path.join(__dirname, 'pt005_large_file_test_report.txt');
//   fs.writeFileSync(reportPath, reportText);
//   console.log(`📝 Report written to ${reportPath}`);

//   // Analyze results
//   const withinLimit = results.filter(r => r.duration <= TIME_LIMIT_MS && r.status === 'Success');
//   console.log(`📊 ${withinLimit.length}/${results.length} files completed successfully within ≤ 10 minutes`);
// }

// testLargeFileProcessing();






const axios = require('axios');
const fs = require('fs');
const path = require('path');
const urls = require('../urls.json'); // { safe: [...], malicious: [...] }

const allUrls = [...urls.safe, ...urls.malicious];
const TIME_LIMIT_MS = 10 * 60 * 1000; // ⏱️ 10 minutes
const results = [];

jest.setTimeout(allUrls.length * TIME_LIMIT_MS); // allow enough time

describe('PT-005 Large File Processing Test', () => {
  it(`should scan all files successfully within ≤ 10 minutes`, async () => {
    console.log(`📦 Starting PT-005: Large File Processing Test on ${allUrls.length} URLs`);

    for (let i = 0; i < allUrls.length; i++) {
      const url = allUrls[i];
      const message = `I want to download this file: ${url}`;
      const start = Date.now();
      let status = 'Success';
      let duration = 0;

      try {
        const res = await axios.post('http://localhost:3000/api/chat', { message });
        duration = Date.now() - start;

        const success = res.data?.result?.scan_result?.success ?? false;
        if (!success) status = 'ScanFailed';

      } catch (err) {
        duration = Date.now() - start;
        status = `Error: ${err.message}`;
      }

      console.log(`File ${i + 1}/${allUrls.length} | Status: ${status} | Time: ${duration}ms | URL: ${url}`);
      results.push({ index: i + 1, url, status, duration });
    }

    // Write results to file
    const reportText = results.map(r =>
      `File ${r.index} | Status: ${r.status} | Time: ${r.duration}ms | Within 10min: ${r.duration <= TIME_LIMIT_MS ? '✅' : '❌'} | URL: ${r.url}`
    ).join('\n');

    const reportPath = path.join(__dirname, 'pt005_large_file_test_report.txt');
    fs.writeFileSync(reportPath, reportText);
    console.log(`📝 Report written to ${reportPath}`);

    // Final assertion
    const successfulScans = results.filter(r => r.duration <= TIME_LIMIT_MS && r.status === 'Success');
    const successRate = (successfulScans.length / results.length) * 100;

    console.log(`📊 ${successfulScans.length}/${results.length} completed within time (≥ 90% expected)`);

    // ✅ Require at least 90% success rate
    expect(successRate).toBeGreaterThanOrEqual(90);
  });
});
