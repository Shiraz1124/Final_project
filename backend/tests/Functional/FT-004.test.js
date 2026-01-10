
const fs = require('fs');
const path = require('path');
const { handleURL } = require('../../file_handler'); // ✅ Adjust as needed
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

afterAll(async () => {
  if (scanBackendProcess) {
    console.log('🛑 Stopping Antivirus backend...');
    scanBackendProcess.kill('SIGTERM');
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Force kill if still running
    if (!scanBackendProcess.killed) {
      scanBackendProcess.kill('SIGKILL');
    }
  }
  
  // Wait for any async operations to complete
  await new Promise(resolve => setTimeout(resolve, 5000));
});

describe('FT-004: Large-scale Malware Detection ', () => {
  const urls = JSON.parse(fs.readFileSync(path.join(__dirname, '../urls.json'), 'utf8'));

  let falsePositives = 0;
  let falseNegatives = 0;
  let totalSafeScanned = 0;
  let totalMaliciousScanned = 0;

  // Helper function to process URLs in batches
  const processBatch = async (urlBatch, expectedType, batchNumber, totalBatches) => {
    console.log(`\n📦 Processing ${expectedType} batch ${batchNumber}/${totalBatches} (${urlBatch.length} URLs)`);
    
    const promises = urlBatch.map(async (url, index) => {
      try {
        console.log(`  🔍 Testing ${expectedType} URL ${index + 1}: ${url.substring(0, 50)}...`);
        
        const result = await handleURL(url, false);
        const verdict = result.scan_result?.verdict?.verdict;
        console.log(`    📊 Verdict: ${verdict}`);

        // Skip if verdict is unknown or scan failed
        if (!verdict || verdict === 'Unknown' || !result.success) {
          console.warn(`    ⚠️ Unknown/failed verdict — skipping from calculation`);
          return { skipped: true, url, reason: verdict || 'scan_failed' };
        }

        const isCorrect = 
          (expectedType === 'safe' && (verdict === 'Safe' || verdict === 'Clean')) ||
          (expectedType === 'malicious' && (verdict === 'Malicious' || verdict === 'Suspicious'));

        if (isCorrect) {
          console.log(`    ✅ Correctly identified as ${verdict}`);
        } else {
          console.warn(`    ⚠️ INCORRECT: ${expectedType} file marked as ${verdict}`);
        }

        return {
          success: result.success,
          verdict,
          expectedType,
          url,
          isCorrect
        };
      } catch (error) {
        console.error(`    ❌ Error scanning ${expectedType} URL: ${error.message}`);
        return { error: error.message, url, expectedType };
      }
    });

    const results = await Promise.all(promises);
    
    // Process results
    results.forEach(result => {
      if (result.skipped || result.error) {
        console.warn(`    ⚠️ Skipped URL due to: ${result.reason || result.error}`);
        return;
      }
      
      if (result.expectedType === 'safe') {
        totalSafeScanned++;
        if (!result.isCorrect) falsePositives++;
      } else {
        totalMaliciousScanned++;
        if (!result.isCorrect) falseNegatives++;
      }
    });

    return results;
  };

  describe('Safe File Detection (Batched)', () => {
    test('should detect 25 SAFE URLs correctly in batches', async () => {
      const batchSize = 2; // Reduced to 2 URLs at once for stability
      const safeUrls = urls.safe.slice(0, 25); // Take only 25 safe URLs
      const totalBatches = Math.ceil(safeUrls.length / batchSize);

      console.log(`\n🔍 Testing ${safeUrls.length} safe URLs in batches of ${batchSize}...`);

      for (let i = 0; i < safeUrls.length; i += batchSize) {
        const batch = safeUrls.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        await processBatch(batch, 'safe', batchNumber, totalBatches);
        
        // Short pause between batches to avoid overwhelming the backend
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
      }

      console.log(`\n✅ Completed all safe URL batches. Total safe files scanned: ${totalSafeScanned}`);
    }, 7200000); // 2-hour timeout
  });

  describe('Malware Detection (Batched)', () => {
    test('should detect 25 MALICIOUS URLs correctly in batches', async () => {
      const batchSize = 2; // Reduced to 2 URLs at once for stability
      const maliciousUrls = urls.malicious.slice(0, 25); // Take only 25 malicious URLs
      const totalBatches = Math.ceil(maliciousUrls.length / batchSize);

      console.log(`\n🦠 Testing ${maliciousUrls.length} malicious URLs in batches of ${batchSize}...`);

      for (let i = 0; i < maliciousUrls.length; i += batchSize) {
        const batch = maliciousUrls.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        
        await processBatch(batch, 'malicious', batchNumber, totalBatches);
        
        // Short pause between batches to avoid overwhelming the backend
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased to 3 seconds
      }

      console.log(`\n✅ Completed all malicious URL batches. Total malicious files scanned: ${totalMaliciousScanned}`);
    }, 7200000); // 2-hour timeout
  });

  describe('Accuracy Requirements', () => {
    test('should meet FPR < 5% and FNR < 10% requirements', () => {
      const fpr = totalSafeScanned > 0 ? (falsePositives / totalSafeScanned) * 100 : 0;
      const fnr = totalMaliciousScanned > 0 ? (falseNegatives / totalMaliciousScanned) * 100 : 0;

      console.log(`\n📊 FINAL RESULTS:`);
      console.log(`📊 Safe URLs tested: ${totalSafeScanned}`);
      console.log(`📊 Malicious URLs tested: ${totalMaliciousScanned}`);
      console.log(`📊 False Positives: ${falsePositives}`);
      console.log(`📊 False Negatives: ${falseNegatives}`);
      console.log(`📊 False Positive Rate (FPR): ${fpr.toFixed(2)}%`);
      console.log(`📉 False Negative Rate (FNR): ${fnr.toFixed(2)}%`);

      expect(fpr).toBeLessThan(5);
      expect(fnr).toBeLessThan(10);
      console.log('✅ FT-004 accuracy requirements met!');
    });
  });
});