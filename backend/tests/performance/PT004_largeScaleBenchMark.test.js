const axios = require('axios');
const path = require('path');
const fs = require('fs');
const urls = require('../urls.json');

const TOTAL_USERS = 100;
const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
jest.setTimeout(120 * 60 * 1000);  // 2 hours

let resultReport = [];

describe('PT-004 Benchmark: 100 Concurrent File Scans', () => {
  it('should process ≥ 90% of files within ≤ 15 minutes', async () => {
    // ✅ Shuffle and pad the URLs
    let allUrls = [...urls.safe, ...urls.malicious].sort(() => Math.random() - 0.5);
    if (allUrls.length < TOTAL_USERS) {
      const pad = Array.from({ length: TOTAL_USERS - allUrls.length }, (_, i) => allUrls[i % allUrls.length]);
      allUrls = allUrls.concat(pad);
    }

    allUrls = allUrls.slice(0, TOTAL_USERS);
    console.log(`🚀 Launching ${TOTAL_USERS} concurrent scan requests...`);

    await Promise.all(
      allUrls.map((url, i) => sendRequest(url, i))
    );

    console.log("✅ Benchmark Completed");

    // Save report as TXT
    const reportText = resultReport.map(r =>
      `File ${r.file} | Status: ${r.status} | Time: ${r.duration}ms | Timeout: ${r.timedOut ? 'YES' : 'No'} | URL: ${r.url} | Message: ${r.message}`
    ).join('\n');
    const reportPath = path.join(__dirname, 'pt004_benchmark_report.txt');
    fs.writeFileSync(reportPath, reportText);
    console.log(`📝 Report saved to: ${reportPath}`);

    // Save report as JSON (optional)
    fs.writeFileSync(path.join(__dirname, 'pt004_benchmark_report.json'), JSON.stringify(resultReport, null, 2));

    // Summary
    const completed = resultReport.filter(r => r.status === 200 && !r.timedOut);
    const withinLimit = completed.filter(r => r.duration <= TIMEOUT_MS);
    const successRate = (withinLimit.length / TOTAL_USERS) * 100;
    console.log(`📊 Scans completed ≤ 15 min: ${withinLimit.length} / ${TOTAL_USERS} (${successRate.toFixed(1)}%)`);
    expect(successRate).toBeGreaterThanOrEqual(90);
  });
});

async function sendRequest(url, index) {
  const message = `I want to download this file: ${url}`;
  const start = Date.now();

  try {
    // 🚀 NO AbortController. Let backend queue handle it.
    const res = await axios.post('http://localhost/api/chat', { message });

    const duration = Date.now() - start;
    const scanResult = res.data.result?.scan_result;
    const verdict = scanResult?.verdict?.verdict ?? 'Unknown';
    if (verdict !== 'Safe' && verdict !== 'Malicious') {
     console.log("❌ Unexpected verdict — scan result content is:", scanResult);
    }

    console.log(`✅ [${index + 1}/${TOTAL_USERS}] Scanned in ${duration}ms → Verdict: ${verdict}`);

    resultReport.push({
      file: index + 1,
      url,
      status: res.status,
      duration,
      timedOut: false,
      message: scanResult?.success ?? 'Unknown'
    });

  } catch (err) {
    const duration = Date.now() - start;
    const isTimeout = err.code === 'ECONNABORTED' || err.message.includes('timeout') || err.message.includes('Timeout');

    console.error(`❌ [${index + 1}/${TOTAL_USERS}] ${isTimeout ? '⏰ Timed out' : 'Error'} after ${duration}ms: ${err.message}`);

    resultReport.push({
      file: index + 1,
      url,
      status: 'Error',
      duration,
      timedOut: isTimeout,
      message: err.message
    });
  }
}


