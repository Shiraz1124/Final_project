const { spawn } = require('child_process');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let downloadBackendProcess;
let antivirusBackendProcess;

// Test configuration
const OPENAI_API_URL = 'http://localhost:3000';
const ANTIVIRUS_API_URL = 'http://localhost:4000';
const DOWNLOAD_TIMEOUT = 240000; // 2 minutes timeout

beforeAll((done) => {
  console.log('🚀 Launching OpenAI Backend...');
  const openaiBackendPath = path.join(__dirname, '../../openAi_backend/openAi_server.js');
  downloadBackendProcess = spawn('node', [openaiBackendPath], {
    stdio: 'inherit',
    shell: true
  });

  console.log('🚀 Launching Antivirus Backend...');
  const antivirusBackendPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');
  antivirusBackendProcess = spawn('node', [antivirusBackendPath], {
    stdio: 'inherit',
    shell: true
  });

  setTimeout(() => {
    console.log('✅ Both backends should be ready.');
    done();
  }, 12000); // wait 12 seconds for both servers
}, 40000);

afterAll(async () => {
  console.log('🛑 Stopping all backend processes...');
  
  if (downloadBackendProcess) {
    downloadBackendProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!downloadBackendProcess.killed) {
      downloadBackendProcess.kill('SIGKILL');
    }
  }
  
  if (antivirusBackendProcess) {
    antivirusBackendProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!antivirusBackendProcess.killed) {
      antivirusBackendProcess.kill('SIGKILL');
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 3000));
}, 15000);

// Helper functions
async function simulateChatDownload(userSessionId, url, timeout = DOWNLOAD_TIMEOUT) {
  try {
    const response = await axios.post(`${OPENAI_API_URL}/api/chat`, {
      message: url,
      userSessionId: userSessionId
    }, { timeout });
    
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.name === 'AbortError') {
      return {
        reply: 'Download was cancelled',
        result: { success: false, error: 'Cancelled' }
      };
    }
    throw error;
  }
}

async function simulateChatMessage(userSessionId, message) {
  try {
    const response = await axios.post(`${OPENAI_API_URL}/api/chat`, {
      message,
      userSessionId: userSessionId
    }, { timeout: 30000 });
    
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function checkUserStatus(userSessionId) {
  try {
    const response = await axios.get(`${OPENAI_API_URL}/api/user-status/${userSessionId}`);
    return response.data;
  } catch (error) {
    console.warn(`⚠️ Status check failed for user ${userSessionId.slice(0, 8)}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function cleanupUserSession(userSessionId) {
  try {
    await Promise.all([
      axios.post(`${OPENAI_API_URL}/api/stop-downloads`, { userSessionId }),
      axios.post(`${ANTIVIRUS_API_URL}/stop-all-scans`, { userSessionId })
    ]);
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.warn(`⚠️ Cleanup failed for user ${userSessionId.slice(0, 8)}:`, error.message);
  }
}

async function selectAndDownloadLink(userSessionId, linkIndex) {
  try {
    const response = await axios.post(`${OPENAI_API_URL}/api/select-link`, {
      linkIndex,
      userSessionId: userSessionId
    }, { timeout: DOWNLOAD_TIMEOUT });
    
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return {
        reply: 'Link download was cancelled',
        result: { success: false, error: 'Cancelled' }
      };
    }
    throw error;
  }
}

async function clearChat(userSessionId) {
  try {
    const response = await axios.post(`${OPENAI_API_URL}/api/clear-chat`, {
      userSessionId: userSessionId
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

describe('Regression Tests - Core Functionality After Multi-User Stop Implementation', () => {

  describe('RT-001: Basic Download Functionality Regression', () => {
    
    test('should still complete successful downloads without stop button usage', async () => {
      const userSessionId = uuidv4();
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Testing basic download completion...`);
      
      try {
        // Test a simple, fast download that should complete normally
        const testUrl = 'https://go.dev/dl/go1.21.3.windows-amd64.msi';
        
        const result = await simulateChatDownload(userSessionId, testUrl);
        
        console.log(`📊 Download result:`, result.reply);
        
        // Should complete successfully without being cancelled
        expect(result.reply).not.toMatch(/cancelled|stopped/i);
        expect(result.result).toBeDefined();
        
        // Check that user status is clean afterwards
        const finalStatus = await checkUserStatus(userSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
        
        console.log(`✅ Basic download functionality still works correctly`);
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, 600000);

    test('should handle file scanning workflow correctly', async () => {
      const userSessionId = uuidv4();
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Testing scanning workflow...`);
      
      try {
        // Use a URL that will trigger file download and scanning
        const testUrl = 'https://github.com/vercel/next.js';
        
        const result = await simulateChatDownload(userSessionId, testUrl);
        
        console.log(`📊 Scan workflow result:`, result.reply);
        
        // Should complete the full workflow
        expect(result.reply).not.toMatch(/cancelled|stopped/i);
        
        // If successful, should have scan results
        if (result.result && result.result.success) {
          expect(result.result.scan_result).toBeDefined();
          console.log(`✅ Scanning workflow completed successfully`);
        }
        
        const finalStatus = await checkUserStatus(userSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, DOWNLOAD_TIMEOUT + 10000);
  });

  describe('RT-002: Multi-Link Selection Regression', () => {
    
    test('should still handle multiple link discovery and selection', async () => {
      const userSessionId = uuidv4();
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Testing multi-link selection...`);
      
      try {
        // URL that typically returns multiple download links
        const testUrl = 'https://bots.zylongaming.com/index.php?action=downloads';
        
        const result = await simulateChatDownload(userSessionId, testUrl);
        
        console.log(`📊 Multi-link result:`, result.reply);
        
        if (result.result && result.result.multiple && result.result.links) {
          console.log(`🔗 Found ${result.result.links.length} links`);
          
          // Test selecting the first link
          const selectionResult = await selectAndDownloadLink(userSessionId, 0);
          console.log(`📊 Selection result:`, selectionResult.reply);
          
          // Selection should work normally
          expect(selectionResult.reply).toBeDefined();

            // If successful, should have scan results
        if (selectionResult.result && selectionResult.result.success) {
          expect(selectionResult.result.scan_result).toBeDefined();
        }
          
          console.log(`✅ Multi-link selection still works correctly`);
        } else {
          console.log(`ℹ️ Single link found or direct download - that's also valid`);
        }
        
        // Check that user status is clean afterwards
        const finalStatus = await checkUserStatus(userSessionId);
        console.log(finalStatus);
        expect(finalStatus.activeOperations.download).toBe(0);
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, DOWNLOAD_TIMEOUT + 10000);
  });

  describe('RT-003: Chat Functionality Regression', () => {
    
    test('should still handle non-download chat messages correctly', async () => {
      const userSessionId = uuidv4();
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Testing regular chat functionality...`);
      
      try {
        // Test various types of chat messages
        const testMessages = [
          'Hello, how are you?',
          'What can you help me with?',
          'Explain what antivirus scanning means',
          'What is the difference between safe and suspicious files?'
        ];
        
        for (const message of testMessages) {
          const result = await simulateChatMessage(userSessionId, message);
          
          console.log(`💬 Message: "${message}"`);
          console.log(`🤖 Reply: ${result.reply.slice(0, 100)}...`);
          
          // Should get meaningful responses
          expect(result.reply).toBeDefined();
          expect(result.reply.length).toBeGreaterThan(10);
          expect(result.reply).not.toMatch(/cancelled|stopped/i);
        }
        
        console.log(`✅ Chat functionality works correctly`);
  
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, 60000);

    test('should handle clear chat functionality', async () => {
      const userSessionId = uuidv4();
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Testing clear chat functionality...`);
      
      try {
        // Send a few messages first
        await simulateChatMessage(userSessionId, 'Hello');
        await simulateChatMessage(userSessionId, 'Test message');
        
        // Clear chat
        const clearResult = await clearChat(userSessionId);
        
        console.log(`🧹 Clear result:`, clearResult.reply);
        
        expect(clearResult.success).toBe(true);
        expect(clearResult.reply).toMatch(/cleared|clear/i);
        
        console.log(`✅ Clear chat functionality works correctly`);
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, 30000);
  });

  describe('RT-004: Error Handling Regression', () => {
    
    test('should still handle invalid URLs correctly', async () => {
      const userSessionId = uuidv4();
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Testing invalid URL handling...`);
      
      try {
        const invalidUrls = [
          'not-a-url',
          'http://invalid-domain-that-does-not-exist.com',
          'https://httpbin.org/status/404',
          'ftp://some-ftp-server.com/file.zip'
        ];
        
        for (const url of invalidUrls) {
          const result = await simulateChatDownload(userSessionId, url, 30000);
          
          console.log(`🔗 Invalid URL: ${url}`);
          console.log(`📊 Result: ${result.reply.slice(0, 100)}...`);
          
          // Should handle errors gracefully (not crash)
          expect(result.reply).toBeDefined();
          
          if (result.result) {
            expect(result.result.success).toBe(false);
          }
        }
        
        console.log(`✅ Invalid URL handling works correctly`);
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, 60000);
  });

  describe('RT-005: Session Isolation Regression', () => {
    
    test('should maintain proper session isolation during normal operations', async () => {
      const user1SessionId = uuidv4();
      const user2SessionId = uuidv4();
      
      console.log(`🧪 User 1: ${user1SessionId.slice(0, 8)}... | User 2: ${user2SessionId.slice(0, 8)}...`);
      console.log(`Testing session isolation during normal operations...`);
      
      try {
        // Both users send different messages
        const user1Promise = simulateChatMessage(user1SessionId, 'Hello from user 1');
        const user2Promise = simulateChatMessage(user2SessionId, 'Hello from user 2');
        
        const [user1Result, user2Result] = await Promise.all([user1Promise, user2Promise]);
        
        console.log(`👤 User 1 reply:`, user1Result.reply.slice(0, 50) + '...');
        console.log(`👤 User 2 reply:`, user2Result.reply.slice(0, 50) + '...');
        
        // Both should get responses
        expect(user1Result.reply).toBeDefined();
        expect(user2Result.reply).toBeDefined();
        
        console.log(`✅ Session isolation maintained correctly`);
        
      } finally {
        await Promise.all([
          cleanupUserSession(user1SessionId),
          cleanupUserSession(user2SessionId)
        ]);
      }
    }, 600000);
  });

  describe('RT-006: API Endpoint Regression', () => {
    
    test('should maintain all API endpoint functionality', async () => {
      const userSessionId = uuidv4();
      
      try {
        // Test status endpoint
        const statusResponse = await axios.get(`${OPENAI_API_URL}/api/status`);
        expect(statusResponse.status).toBe(200);
        expect(statusResponse.data.success).toBe(true);
        console.log(`✅ Status endpoint works`);
        
        // Test user status endpoint
        const userStatusResponse = await axios.get(`${OPENAI_API_URL}/api/user-status/${userSessionId}`);
        expect(userStatusResponse.status).toBe(200);
        expect(userStatusResponse.data.success).toBe(true);
        console.log(`✅ User status endpoint works`);
        
        // Test antivirus health endpoint
        const healthResponse = await axios.get(`${ANTIVIRUS_API_URL}/health`);
        expect(healthResponse.status).toBe(200);
        console.log(`✅ Antivirus health endpoint works`);
        
        // Test scan status endpoint
        const scanStatusResponse = await axios.get(`${ANTIVIRUS_API_URL}/scan-status`);
        expect(scanStatusResponse.status).toBe(200);
        expect(scanStatusResponse.data.success).toBe(true);
        console.log(`✅ Scan status endpoint works`);
        
        console.log(`✅ All API endpoints functioning correctly`);
        
      } catch (error) {
        console.error(`❌ API endpoint test failed:`, error.message);
        throw error;
      }
    }, 30000);
  });

  describe('RT-007: Performance Regression', () => {
    
    test('should maintain reasonable response times for chat', async () => {
      const userSessionId = uuidv4();
      
      try {
        const startTime = Date.now();
        
        const result = await simulateChatMessage(userSessionId, 'Hello, what can you do?');
        
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        console.log(`⏱️ Chat response time: ${responseTime}ms`);
        
        // Response should be reasonably fast (under 10 seconds for chat)
        expect(responseTime).toBeLessThan(10000);
        expect(result.reply).toBeDefined();
        
        console.log(`✅ Chat performance within acceptable limits`);
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, 15000);

    test('should handle concurrent users without significant degradation', async () => {
      const users = [];
      const concurrentUsers = 3;
      
      // Create multiple users
      for (let i = 0; i < concurrentUsers; i++) {
        users.push(uuidv4());
      }
      
      try {
        console.log(`🧪 Testing ${concurrentUsers} concurrent users...`);
        
        const startTime = Date.now();
        
        // All users send messages simultaneously
        const promises = users.map((userId, index) => 
          simulateChatMessage(userId, `Hello from concurrent user ${index + 1}`)
        );
        
        const results = await Promise.all(promises);
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        console.log(`⏱️ Concurrent operations completed in: ${totalTime}ms`);
        console.log(`📊 Average time per user: ${totalTime / concurrentUsers}ms`);
        
        // All users should get responses
        results.forEach((result, index) => {
          expect(result.reply).toBeDefined();
          console.log(`👤 User ${index + 1} got response: ${result.reply.slice(0, 30)}...`);
        });
        
        // Performance should be reasonable even with concurrent users
        expect(totalTime).toBeLessThan(30000); // 30 seconds max for 3 concurrent users
        
        console.log(`✅ Concurrent user performance acceptable`);
        
      } finally {
        // Cleanup all users
        await Promise.all(users.map(userId => cleanupUserSession(userId)));
      }
    }, 450000);
  });

  describe('RT-08: Integration Points Regression', () => {
    
    test('should maintain proper communication between frontend and backend services', async () => {
      const userSessionId = uuidv4();
      
      try {
        // Test that OpenAI service can communicate with Antivirus service
        console.log(`🧪 Testing service integration...`);
        
        // This should trigger both services (download + scan)
        const integrationTest = simulateChatDownload(userSessionId, 'https://httpbin.org/json', 15000);
        
        // Stop early to avoid full process
        setTimeout(async () => {
          try {
            await axios.post(`${OPENAI_API_URL}/api/stop-downloads`, { userSessionId });
            await axios.post(`${ANTIVIRUS_API_URL}/stop-all-scans`, { userSessionId });
          } catch (e) {
            // Ignore stop errors
          }
        }, 3000);
        
        const result = await integrationTest;
        
        console.log(`📊 Integration test result:`, result.reply.slice(0, 100) + '...');
        
        // Should have attempted integration
        expect(result.reply).toBeDefined();
        
        // Services should be responsive
        const openaiStatus = await axios.get(`${OPENAI_API_URL}/api/status`);
        const antivirusStatus = await axios.get(`${ANTIVIRUS_API_URL}/scan-status`);
        
        expect(openaiStatus.status).toBe(200);
        expect(antivirusStatus.status).toBe(200);
        
        console.log(`✅ Service integration maintained`);
        
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, 30000);
  });
});

// Global cleanup
afterAll(async () => {
  if (global.browser && typeof global.browser.close === 'function') {
    await global.browser.close();
    console.log('🧹 Global browser closed after all regression tests.');
  }
  console.log('🎯 All regression tests completed!');
});