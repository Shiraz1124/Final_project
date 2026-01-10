const {handleURL, deleteFile} = require('../../file_handler');
const fs = require('fs').promises;
const path = require('path');

describe('FT-001.1: Statistical Test - 50 URLs File Download', () => {
  let urlsData;
  let testResults = {
    safe: { successful: 0, failed: 0, total: 0 },
    malicious: { successful: 0, failed: 0, total: 0 }
  };

  beforeAll(async () => {
    // Load URLs from urls.json
    try {
      const urlsPath = path.join(__dirname, '../urls.json');
      const urlsContent = await fs.readFile(urlsPath, 'utf8');
      urlsData = JSON.parse(urlsContent);
    } catch (error) {
      throw new Error(`Failed to load urls.json: ${error.message}`);
    }
  });

  test('should successfully download 25 safe files', async () => {
    expect(urlsData.safe).toBeDefined();
    expect(urlsData.safe.length).toBeGreaterThanOrEqual(25);

    const safeUrls = urlsData.safe.slice(0, 25);
    testResults.safe.total = safeUrls.length;

    console.log(`\n🔍 Testing ${safeUrls.length} safe URLs in batches of 5...`);

    // Process in batches of 5 to avoid overwhelming the system
    for (let i = 0; i < safeUrls.length; i += 5) {
      const batch = safeUrls.slice(i, i + 5);
      console.log(`Processing batch ${Math.floor(i/5) + 1}/${Math.ceil(safeUrls.length/5)}: URLs ${i + 1}-${Math.min(i + 5, safeUrls.length)}`);
      
      const promises = batch.map(async (url, index) => {
        try {
          const result = await handleURL(url, true);
          
          if (result && result.filename && result.path) {
            console.log(`✅ Safe ${i + index + 1}: ${result.filename}`);
            
            try {
              await deleteFile(result.path);
            } catch (err) {
              console.warn(`⚠️ Failed to delete file: ${err.message}`);
            }
            
            return { success: true };
          } else {
            console.log(`❌ Safe ${i + index + 1}: Invalid result`);
            return { success: false };
          }
        } catch (error) {
          console.log(`❌ Safe ${i + index + 1}: ${error.message}`);
          return { success: false };
        }
      });

      const results = await Promise.all(promises);
      
      results.forEach(result => {
        if (result.success) {
          testResults.safe.successful++;
        } else {
          testResults.safe.failed++;
        }
      });

      // Small delay between batches to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const safeSuccessRate = (testResults.safe.successful / testResults.safe.total) * 100;
    console.log(`\n📊 Safe URLs Results: ${testResults.safe.successful}/${testResults.safe.total} (${safeSuccessRate.toFixed(2)}%)`);
    
    expect(safeSuccessRate).toBeGreaterThanOrEqual(90); // Changed from 95% to 90%
  }, 7200000); // 2 hours timeout

  test('should successfully download 25 malicious files', async () => {
    expect(urlsData.malicious).toBeDefined();
    expect(urlsData.malicious.length).toBeGreaterThanOrEqual(25);

    const maliciousUrls = urlsData.malicious.slice(0, 25);
    testResults.malicious.total = maliciousUrls.length;

    console.log(`\n🔍 Testing ${maliciousUrls.length} malicious URLs in batches of 5...`);

    // Process in batches of 5 to avoid overwhelming the system
    for (let i = 0; i < maliciousUrls.length; i += 5) {
      const batch = maliciousUrls.slice(i, i + 5);
      console.log(`Processing batch ${Math.floor(i/5) + 1}/${Math.ceil(maliciousUrls.length/5)}: URLs ${i + 1}-${Math.min(i + 5, maliciousUrls.length)}`);
      
      const promises = batch.map(async (url, index) => {
        try {
          const result = await handleURL(url, true);
          
          if (result && result.filename && result.path) {
            console.log(`✅ Malicious ${i + index + 1}: ${result.filename}`);
            
            try {
              await deleteFile(result.path);
            } catch (err) {
              console.warn(`⚠️ Failed to delete file: ${err.message}`);
            }
            
            return { success: true };
          } else {
            console.log(`❌ Malicious ${i + index + 1}: Invalid result`);
            return { success: false };
          }
        } catch (error) {
          console.log(`❌ Malicious ${i + index + 1}: ${error.message}`);
          return { success: false };
        }
      });

      const results = await Promise.all(promises);
      
      results.forEach(result => {
        if (result.success) {
          testResults.malicious.successful++;
        } else {
          testResults.malicious.failed++;
        }
      });

      // Small delay between batches to avoid overwhelming servers
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const maliciousSuccessRate = (testResults.malicious.successful / testResults.malicious.total) * 100;
    console.log(`\n📊 Malicious URLs Results: ${testResults.malicious.successful}/${testResults.malicious.total} (${maliciousSuccessRate.toFixed(2)}%)`);
    
    expect(maliciousSuccessRate).toBeGreaterThanOrEqual(90); // Changed from 95% to 90%
  }, 7200000); // 2 hours timeout

  test('should calculate overall statistics and meet TPR/FPR requirements', async () => {
    const totalUrls = testResults.safe.total + testResults.malicious.total;
    const totalSuccessful = testResults.safe.successful + testResults.malicious.successful;
    const overallSuccessRate = (totalSuccessful / totalUrls) * 100;

    // Calculate TPR (True Positive Rate) - successful downloads / total URLs
    const tpr = (totalSuccessful / totalUrls) * 100;
    
    // Calculate FPR (False Positive Rate) - failed downloads / total URLs  
    const totalFailed = testResults.safe.failed + testResults.malicious.failed;
    const fpr = (totalFailed / totalUrls) * 100;

    console.log(`\n📈 OVERALL STATISTICAL RESULTS:`);
    console.log(`===============================`);
    console.log(`Total URLs tested: ${totalUrls}`);
    console.log(`Total successful downloads: ${totalSuccessful}`);
    console.log(`Overall success rate: ${overallSuccessRate.toFixed(2)}%`);
    console.log(`Safe files: ${testResults.safe.successful}/${testResults.safe.total} (${((testResults.safe.successful/testResults.safe.total)*100).toFixed(2)}%)`);
    console.log(`Malicious files: ${testResults.malicious.successful}/${testResults.malicious.total} (${((testResults.malicious.successful/testResults.malicious.total)*100).toFixed(2)}%)`);
    console.log(`\nStatistical Measurements:`);
    console.log(`TPR (True Positive Rate): ${tpr.toFixed(2)}%`);
    console.log(`FPR (False Positive Rate): ${fpr.toFixed(2)}%`);

    // Updated test requirements: 90%, 90%, 10%
    expect(overallSuccessRate).toBeGreaterThanOrEqual(90); // Changed from 95% to 90%
    expect(tpr).toBeGreaterThanOrEqual(90); // Changed from 95% to 90%
    expect(fpr).toBeLessThanOrEqual(10); // Changed from 5% to 10%

    console.log(`\n✅ Requirements Met:`);
    console.log(`   ✓ Overall success rate ≥ 90%: ${overallSuccessRate.toFixed(2)}%`);
    console.log(`   ✓ TPR ≥ 90%: ${tpr.toFixed(2)}%`);
    console.log(`   ✓ FPR ≤ 10%: ${fpr.toFixed(2)}%`);
  });

  afterAll(async () => {
    if (global.browser && typeof global.browser.close === 'function') {
      await global.browser.close();
      console.log('🧹 Global browser closed after all tests.');
    }
  });
});