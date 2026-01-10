const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { handleURL } = require('../../file_handler');

let scanBackendProcess;

// Helper function to start backend with specific TEST_MODE
const startBackend = (testMode = null) => {
  return new Promise((resolve) => {
    console.log(`🚀 Launching Antivirus Scan Backend${testMode ? ` in TEST_MODE=${testMode}` : ''}`);
    
    const backendPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');
    
    const env = { ...process.env };
    if (testMode !== null) {
      env.TEST_MODE = testMode.toString();
      console.log(`🔧 Setting TEST_MODE to: ${env.TEST_MODE}`);
    }
    
    scanBackendProcess = spawn('node', [backendPath], {
      stdio: 'inherit',
      shell: false,
      env: env,
    });

    setTimeout(() => {
      console.log(`✅ Antivirus backend should be ready`);
      resolve();
    }, 7000);
  });
};

// Helper function to stop backend
const stopBackend = () => {
  return new Promise((resolve) => {
    if (scanBackendProcess) {
      console.log('🛑 Stopping Antivirus backend...');
      scanBackendProcess.kill();
      scanBackendProcess = null;
      
      setTimeout(() => {
        console.log('✅ Backend stopped');
        resolve();
      }, 3000);
    } else {
      resolve();
    }
  });
};

describe('ST-003 Conflicting Antivirus Results Tests', () => {

  // Load test files from urls.json
  let testFiles = [];
  
  beforeAll(async () => {
    // Load URLs from urls.json file
    const urlsFilePath = path.join(__dirname, '../urls.json');
    
    try {
      const urlsData = JSON.parse(fs.readFileSync(urlsFilePath, 'utf8'));
      
      // Get first 10 safe files
      const safeFiles = urlsData.safe.slice(0, 10).map(url => ({
        url: url,
        expectedCategory: 'Safe',
        description: `Safe file: ${url.split('/').pop() || 'unknown'}`
      }));
      
      // Get 10 malicious files (indices 10-19 from your screenshot)
      const maliciousFiles = urlsData.malicious.slice(9, 19).map(url => ({
        url: url,
        expectedCategory: 'Malicious',
        description: `Malicious file: ${url.split('/').pop() || 'unknown'}`
      }));
      
      testFiles = [...safeFiles, ...maliciousFiles];
      
      console.log(`📋 Loaded ${testFiles.length} test files from urls.json:`);
      console.log(`✅ Safe files: ${safeFiles.length}`);
      console.log(`🦠 Malicious files: ${maliciousFiles.length}`);
      
    } catch (error) {
      console.error('❌ Failed to load urls.json:', error.message);
      throw new Error('Cannot proceed without test URLs');
    }
    
    await startBackend(); // Normal mode - all engines active
  }, 20000);

  afterAll(async () => {
    await stopBackend();
  }, 15000);

  test('should handle conflicting antivirus results correctly with urls.json dataset', async () => {
    console.log('🧪 Starting ST-003: Testing system behavior with conflicting AV results');
    console.log(`📋 Testing ${testFiles.length} files from urls.json (10 safe + 10 malicious)`);
    
    // Validate we have test files
    if (testFiles.length === 0) {
      throw new Error('No test files loaded from urls.json');
    }
    
    const results = [];
    let conflictCount = 0;
    let correctClassifications = 0;
    
    // Test each file in the dataset
    for (let i = 0; i < testFiles.length; i++) {
      const testFile = testFiles[i];
      console.log(`\n🔍 [${i + 1}/${testFiles.length}] Testing: ${testFile.description}`);
      console.log(`📁 Expected: ${testFile.expectedCategory}`);
      
      try {
        const result = await handleURL(testFile.url, false);
        
        if (!result.success || !result.scan_result) {
          console.log(`❌ Failed to scan file: ${testFile.url}`);
          continue;
        }
        
        const { scan_result } = result;
        const { results: engineResults, verdict, allocation } = scan_result;
        
        // Convert results array to engines object
        const engines = {};
        engineResults.forEach(result => {
          engines[result.engine] = result;
        });
        
        console.log(`🎯 System verdict: ${verdict.verdict} (score: ${verdict.weightedScore})`);
        console.log(`📊 Engine results:`, engineResults.map(r => `${r.engine}: ${r.result}`).join(', '));
        
        // Check for conflicts between engines
        const engineVerdicts = engineResults
          .filter(r => {
            // Include all meaningful results for conflict detection
            return ['Malicious', 'Suspicious', 'Safe', 'Infected', 'Clean ✅', 'Infected ❌'].includes(r.result);
          })
          .map(r => {
            // Normalize results to standard categories
            if (r.result === 'Infected' || r.result === 'Infected ❌') return 'Malicious';
            if (r.result === 'Clean ✅') return 'Safe';
            return r.result;
          });
        
        const uniqueVerdicts = [...new Set(engineVerdicts)];
        const hasConflict = uniqueVerdicts.length > 1;
        
        if (hasConflict) {
          conflictCount++;
          console.log(`⚡ CONFLICT DETECTED: Engines disagree - ${uniqueVerdicts.join(' vs ')}`);
          
          // Analyze how system resolved the conflict
          console.log(`🤖 System resolution: ${verdict.verdict}`);
          console.log(`📈 Weighted score: ${verdict.weightedScore}`);
          
          if (allocation) {
            console.log(`⚖️ Engine allocation:`, allocation);
          }
        }
        
        // Check if system classification matches expected category
        // Treat "Suspicious" as "Malicious" for test evaluation
        const normalizedVerdict = verdict.verdict === 'Suspicious' ? 'Malicious' : verdict.verdict;
        const isCorrect = normalizedVerdict === testFile.expectedCategory;
        if (isCorrect) {
          correctClassifications++;
          console.log(`✅ Correct classification${verdict.verdict === 'Suspicious' ? ' (Suspicious treated as Malicious)' : ''}`);
        } else {
          console.log(`❌ Incorrect classification - Expected: ${testFile.expectedCategory}, Got: ${verdict.verdict}${verdict.verdict === 'Suspicious' ? ' (treated as Malicious)' : ''}`);
        }
        
        // Store results for analysis
        results.push({
          file: testFile.description,
          url: testFile.url,
          expected: testFile.expectedCategory,
          systemVerdict: verdict.verdict,
          normalizedVerdict: verdict.verdict === 'Suspicious' ? 'Malicious' : verdict.verdict,
          weightedScore: verdict.weightedScore,
          engineResults: engineResults,
          hasConflict: hasConflict,
          conflictTypes: uniqueVerdicts,
          isCorrect: isCorrect,
          allocation: allocation
        });
        
      } catch (error) {
        console.log(`💥 Error scanning ${testFile.url}:`, error.message);
      }
      
      // Add delay between scans to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Final analysis
    console.log('\n📊 ST-003 FINAL ANALYSIS');
    console.log('=' * 50);
    console.log(`📋 Total files tested: ${results.length}`);
    console.log(`⚡ Conflicts detected: ${conflictCount}`);
    console.log(`✅ Correct classifications: ${correctClassifications}/${results.length}`);
    console.log(`📈 Accuracy rate: ${((correctClassifications / results.length) * 100).toFixed(1)}%`);
    console.log(`⚔️ Conflict rate: ${((conflictCount / results.length) * 100).toFixed(1)}%`);
    
    // Analyze conflict resolution patterns
    const conflictingResults = results.filter(r => r.hasConflict);
    if (conflictingResults.length > 0) {
      console.log('\n🔍 CONFLICT RESOLUTION ANALYSIS:');
      conflictingResults.forEach((result, index) => {
        console.log(`${index + 1}. ${result.file}`);
        console.log(`   Engines: ${result.conflictTypes.join(' vs ')}`);
        console.log(`   System chose: ${result.systemVerdict} (score: ${result.weightedScore})`);
        console.log(`   Expected: ${result.expected} | Correct: ${result.isCorrect ? '✅' : '❌'}`);
      });
    }
    
    // Test assertions
    expect(results.length).toBeGreaterThan(0);
    expect(conflictCount).toBeGreaterThan(0); // We expect some conflicts in mixed dataset
    
    // System should handle conflicts gracefully
    conflictingResults.forEach(result => {
      expect(result.systemVerdict).toBeDefined();
      expect(['Malicious', 'Suspicious', 'Safe', 'Unkonwn file status']).toContain(result.systemVerdict);
      expect(result.weightedScore).toBeGreaterThanOrEqual(0);
    });
    
    // Accuracy should be reasonable (at least 70% for focused dataset)
    const accuracy = (correctClassifications / results.length) * 100;
    expect(accuracy).toBeGreaterThanOrEqual(70);
    
    console.log('\n✅ ST-003 completed successfully');
    console.log('🎯 System demonstrates proper conflict resolution logic');
    
    if (conflictCount > 0) {
      console.log('💡 RECOMMENDATION: Review conflict resolution algorithm if accuracy < 80%');
    }
    
  }, 1800000); // 30 minutes timeout per test
  
  // Additional focused test for known conflicting file
  test('should handle EICAR test file conflicts appropriately', async () => {
    console.log('🧪 Testing known conflicting file: EICAR');
    
    const result = await handleURL('https://secure.eicar.org/eicar_com.zip', false);
    
    expect(result.success).toBe(true);
    expect(result.scan_result).toBeDefined();
    
    const { results: engineResults, verdict } = result.scan_result;
    
    // Convert results to engines object
    const engines = {};
    engineResults.forEach(result => {
      engines[result.engine] = result;
    });
    
    console.log('🔍 EICAR scan results:', engineResults.map(r => `${r.engine}: ${r.result}`).join(', '));
    console.log('🎯 System verdict:', verdict.verdict);
    
    // EICAR should trigger detection (Malicious or Suspicious, both treated as threats)
    expect(['Malicious', 'Suspicious'].includes(verdict.verdict)).toBeTruthy();
    
    // Check if engines disagree (common with EICAR)
    const detectionResults = engineResults.filter(r => 
      ['Malicious', 'Suspicious', 'Safe'].includes(r.result)
    );
    
    if (detectionResults.length > 1) {
      const uniqueResults = [...new Set(detectionResults.map(r => r.result))];
      if (uniqueResults.length > 1) {
        console.log('⚡ Conflict detected with EICAR file - engines disagree');
        console.log('🤖 System resolved conflict appropriately');
      }
    }
    
    console.log('✅ EICAR conflict test completed');
  }, 900000); // 15 minutes timeout per test
});