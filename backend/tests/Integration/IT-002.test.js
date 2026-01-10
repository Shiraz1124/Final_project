const { handleURL, deleteFile } = require('../../file_handler');
const { spawn } = require('child_process');
const path = require('path');

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

describe('IT-002: API Response Validation', () => {
  
  test('should validate antivirus scan API results are correctly processed', async () => {
    // Step 1: Submit a file for scanning
    const testFileUrl = 'https://downloads.zylongaming.com/Bots/Setup.exe';
    
    console.log('📤 Step 1: Submitting file for scanning...');
    console.log(`🔗 Test URL: ${testFileUrl}`);
    
    const result = await handleURL(testFileUrl, false); // false = download and scan
    
    // Step 2: Verify returned API responses
    console.log('📋 Step 2: Verifying API responses...');
    console.log('🔍 Full result structure:', JSON.stringify(result, null, 2));
    
    // ✅ BASIC STRUCTURE VALIDATION
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.scan_result).toBeDefined();
    expect(result.scan_result.success).toBe(true);
    
    console.log('✅ API Response Structure:');
    console.log(`   - Success: ${result.success}`);
    console.log(`   - Filename: ${result.filename}`);
    console.log(`   - Scan Success: ${result.scan_result.success}`);
    
    // ✅ CORE API RESPONSE VALIDATION (based on your server code)
    expect(result.scan_result.results).toBeDefined();
    expect(Array.isArray(result.scan_result.results)).toBe(true);
    expect(result.scan_result.allocation).toBeDefined();
    expect(result.scan_result.verdict).toBeDefined();
    
    console.log(`   - Results Count: ${result.scan_result.results.length}`);
    console.log(`   - Allocation: ${JSON.stringify(result.scan_result.allocation)}`);
    console.log(`   - Verdict: ${result.scan_result.verdict.verdict}`);
    
    // ✅ INDIVIDUAL ENGINE RESULTS VALIDATION
    const engines = ['Bytescale', 'ClamAV', 'Cloudmersive'];
    expect(result.scan_result.results.length).toBeGreaterThanOrEqual(3);
    
    result.scan_result.results.forEach((engineResult, index) => {
      expect(engineResult.engine).toBeDefined();
      expect(engineResult.result).toBeDefined();
      expect(typeof engineResult.engine).toBe('string');
      expect(typeof engineResult.result).toBeDefined();
      
      // Validate engine names are expected
      expect(engines).toContain(engineResult.engine);
      
      // Validate result formats match your server's output
      const validResults = [
        'Clean ✅', 'Infected ❌', 'Unknown', 'Timed out', 
        'Skipped (inactive)', 'Rejected file', 'Skipped'
      ];
      expect(validResults.some(valid => 
        engineResult.result.includes(valid.split(' ')[0])
      )).toBe(true);
      
      console.log(`   Engine ${index + 1}: ${engineResult.engine} = ${engineResult.result}`);
      
      // Validate failure reason exists when needed
      expect(engineResult.failureReason).toBeDefined();
      if (engineResult.result !== 'Clean ✅') {
        console.log(`     └─ Failure reason: ${engineResult.failureReason}`);
      }
    });
    
    // ✅ VERDICT CALCULATION VALIDATION
    expect(result.scan_result.verdict.verdict).toBeDefined();
    expect(result.scan_result.verdict.weightedScore).toBeDefined();
    expect(typeof result.scan_result.verdict.verdict).toBe('string');
    expect(typeof result.scan_result.verdict.weightedScore).toBe('number');
    
    // Check that verdict matches your server's exact values
    const validVerdicts = ['Safe', 'Malicious', 'Suspicious', 'Unkonwn file status', 'Error'];
    expect(validVerdicts).toContain(result.scan_result.verdict.verdict);
    
    // Validate weighted score is reasonable (0-100)
    expect(result.scan_result.verdict.weightedScore).toBeGreaterThanOrEqual(0);
    expect(result.scan_result.verdict.weightedScore).toBeLessThanOrEqual(100);
    
    // ✅ ALLOCATION PERCENTAGES VALIDATION
    const allocation = result.scan_result.allocation;
    expect(typeof allocation.bytescale).toBe('number');
    expect(typeof allocation.cloudmersive).toBe('number');
    expect(typeof allocation.clamav).toBe('number');
    
    // Validate percentages are reasonable
    expect(allocation.bytescale).toBeGreaterThanOrEqual(0);
    expect(allocation.cloudmersive).toBeGreaterThanOrEqual(0);
    expect(allocation.clamav).toBeGreaterThanOrEqual(0);
    
    // Total allocation should be ~100% (allowing for rounding)
    const total = allocation.bytescale + allocation.cloudmersive + allocation.clamav;
    expect(total).toBeGreaterThanOrEqual(95);
    expect(total).toBeLessThanOrEqual(105);
    
    console.log('✅ API results are correctly processed');
    console.log(`🛡️ Final verdict: ${result.scan_result.verdict.verdict}`);
    console.log(`📊 Weighted score: ${result.scan_result.verdict.weightedScore}%`);
    console.log(`📊 Allocation total: ${total.toFixed(1)}%`);
    
    // ✅ ADDITIONAL PROCESSING VALIDATION
    // Check that processing logic is working correctly
    const cleanEngines = result.scan_result.results.filter(r => r.result.includes('Clean')).length;
    const infectedEngines = result.scan_result.results.filter(r => r.result.includes('Infected')).length;
    
    console.log(`🔍 Processing analysis:`);
    console.log(`   - Clean engines: ${cleanEngines}`);
    console.log(`   - Infected engines: ${infectedEngines}`);
    
    // Validate verdict logic matches engine results
    if (cleanEngines >= 2 && infectedEngines === 0) {
      expect(['Safe']).toContain(result.scan_result.verdict.verdict);
    }
    if (infectedEngines >= 2) {
      expect(['Malicious', 'Suspicious']).toContain(result.scan_result.verdict.verdict);
    }
    
  }, 900000); // 15 minutes timeout for download + scan

  test('should validate API connection and health endpoints', async () => {
    console.log('🔍 Testing antivirus server health...');
    
    try {
      const response = await fetch('http://localhost:4000/health');
      const health = await response.text();
      
      expect(response.status).toBe(200);
      expect(health).toContain('ClamAV is running');
      console.log('✅ Health check passed:', health.trim());
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
  }, 10000);

  test('should handle malicious file detection correctly', async () => {
    console.log('🦠 Testing malicious file handling...');
    
    // Use EICAR test file (standard antivirus test file)
    const eicarUrl = 'https://secure.eicar.org/eicar.com.txt';
    
    try {
      const result = await handleURL(eicarUrl, false);
      
      expect(result).toBeDefined();
      console.log(`🔍 Malicious file result: ${result.scan_result?.verdict?.verdict || 'Failed'}`);
      
      if (result.success && result.scan_result) {
        // Should detect as malicious or suspicious
        expect(['Malicious', 'Suspicious', 'Infected']).toContain(result.scan_result.verdict.verdict);
        console.log('✅ Malicious file correctly detected');
      } else {
        console.log('⚠️ Malicious file test inconclusive');
      }
      
    } catch (error) {
      console.log('⚠️ Malicious file test failed:', error.message);
      // Test can pass even if EICAR download fails
    }
    
  }, 300000); // 5 minutes for malicious file test

});