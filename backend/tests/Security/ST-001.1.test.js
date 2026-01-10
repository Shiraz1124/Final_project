const fs = require('fs');
const path = require('path');
const { handleURL } = require('../../file_handler');
const { spawn } = require('child_process');

let scanBackendProcess;

beforeAll((done) => {
  console.log('🚀 Launching Antivirus Scan Backend...');
  
  const backendPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');
  scanBackendProcess = spawn('node', [backendPath], {
    stdio: 'inherit',
    shell: true
  });
  
  setTimeout(() => {
    console.log('✅ Antivirus backend should be ready.');
    done();
  }, 5000); // wait 5 seconds
}, 15000); // beforeAll timeout

afterAll(() => {
  if (scanBackendProcess) {
    console.log('🛑 Stopping Antivirus backend...');
    scanBackendProcess.kill();
  }
});

describe('ST-001.1: Statistical Malware Detection Accuracy Test', () => {
  const maliciousURLs = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../urls.json'), 'utf8')
  ).malicious;
  
  let falseNegatives = 0;
  let truePositives = 0;
  let totalEvaluated = 0;
  let skippedUnknown = 0;
  
  test.each(maliciousURLs)(
    '🦠 Should detect malware: %s',
    async (url) => {
      console.log(`🔬 Testing URL: ${url}`);
      const result = await handleURL(url, false);
      
      expect(result.success).toBe(true);
      expect(result.scan_result?.verdict?.verdict).toBeDefined();
      
      const verdict = result.scan_result.verdict.verdict;
      console.log(`📊 Verdict: ${verdict}`);
      
      if (verdict === 'Unknown') {
        skippedUnknown++;
        console.warn('⚠️ Skipping: Unknown verdict');
        return;
      }
      
      totalEvaluated++;
      
      if (verdict === 'Malicious' || verdict === 'Suspicious') {
        truePositives++;
        console.log('✅ Correct detection');
      } else if (verdict === 'Safe') {
        falseNegatives++;
        console.warn('❌ False Negative');
      }
      
      await new Promise((r) => setTimeout(r, 2000)); // Wait 2s between scans
    },
    1200000 // ⏱ 20-minute timeout per test
  );
  
  afterAll(() => {
    const detectionAccuracy =
      totalEvaluated > 0 ? (truePositives / totalEvaluated) * 100 : 0;
    const fnr =
      totalEvaluated > 0 ? (falseNegatives / totalEvaluated) * 100 : 0;
    
    console.log('\n📈 FINAL STATISTICS:');
    console.log(`🧪 Total evaluated (excluding Unknown): ${totalEvaluated}`);
    console.log(`⏭️ Skipped Unknown verdicts: ${skippedUnknown}`);
    console.log(`✅ True Positives: ${truePositives}`);
    console.log(`❌ False Negatives: ${falseNegatives}`);
    console.log(`📊 Detection Accuracy: ${detectionAccuracy.toFixed(2)}%`);
    console.log(`📉 False Negative Rate (FNR): ${fnr.toFixed(2)}%`);
    
    expect(detectionAccuracy).toBeGreaterThanOrEqual(90);
    expect(fnr).toBeLessThanOrEqual(10);
  });
});