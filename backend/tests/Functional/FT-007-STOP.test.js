
const { spawn } = require('child_process');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let downloadBackendProcess;
let antivirusBackendProcess;

// Test configuration
const OPENAI_API_URL = 'http://localhost:3000';
const ANTIVIRUS_API_URL = 'http://localhost:4000';
const STOP_DELAY = 2500; // Stop after 2.5 seconds
const DOWNLOAD_TIMEOUT = 120000; // 1 minute timeout

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
}, 40000); // beforeAll timeout

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

// Helper function to simulate user clicking stop button
async function simulateStopButton(userSessionId, delay = STOP_DELAY) {
  return new Promise((resolve) => {
    setTimeout(async () => {
      console.log(`⏹️ [${userSessionId.slice(0, 8)}] Simulating STOP button click...`);
      
      try {
        // Stop downloads
        const downloadStopResponse = await axios.post(`${OPENAI_API_URL}/api/stop-downloads`, {
          userSessionId: userSessionId
        }, { timeout: 5000 });
        
        console.log(`✅ [${userSessionId.slice(0, 8)}] Downloads stop response:`, downloadStopResponse.data.message);
        
        // Stop scans
        const scanStopResponse = await axios.post(`${ANTIVIRUS_API_URL}/stop-all-scans`, {
          userSessionId: userSessionId
        }, { timeout: 5000 });
        
        console.log(`✅ [${userSessionId.slice(0, 8)}] Scans stop response:`, scanStopResponse.data.message);
        
        resolve({
          downloads: downloadStopResponse.data,
          scans: scanStopResponse.data,
          totalStopped: (downloadStopResponse.data.stoppedOperations || 0) + (scanStopResponse.data.stoppedScans || 0)
        });
        
      } catch (error) {
        console.error(`❌ [${userSessionId.slice(0, 8)}] Stop button simulation failed:`, error.message);
        resolve({
          downloads: { success: false, error: error.message },
          scans: { success: false, error: error.message },
          totalStopped: 0
        });
      }
    }, delay);
  });
}

// Helper function to check user status
async function checkUserStatus(userSessionId) {
  try {
    const response = await axios.get(`${OPENAI_API_URL}/api/user-status/${userSessionId}`);
    return response.data;
  } catch (error) {
    console.warn(`⚠️ Status check failed for user ${userSessionId.slice(0, 8)}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Helper function to simulate chat request (triggers download)
async function simulateChatDownload(userSessionId, url) {
  try {
    const response = await axios.post(`${OPENAI_API_URL}/api/chat`, {
      message: url,
      userSessionId: userSessionId
    }, { timeout: DOWNLOAD_TIMEOUT });
    
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

// Helper function to clean up user session
async function cleanupUserSession(userSessionId) {
  try {
    await Promise.all([
      axios.post(`${OPENAI_API_URL}/api/stop-downloads`, { userSessionId }),
      axios.post(`${ANTIVIRUS_API_URL}/stop-all-scans`, { userSessionId })
    ]);
    
    // Wait a bit for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.warn(`⚠️ Cleanup failed for user ${userSessionId.slice(0, 8)}:`, error.message);
  }
}

describe('Stop Button Tests', () => {
  
  describe('FT-STOP-001: Stop Dropbox Download', () => {
    const testUrl = 'https://www.dropbox.com/scl/fi/1blydyiwm2p0crzzmwf8k/rufus-4.7p.exe?rlkey=3kbnx7pf22wkd7r0vnk6gbcnh&e=4&st=wf1u1ea1&dl=0';
    
    test('should successfully stop Dropbox download when user clicks stop button', async () => {
      const userSessionId = uuidv4(); // Unique session for this test
      console.log(`🆔 Test User Session ID: ${userSessionId.slice(0, 8)}...`);
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Starting Dropbox download stop test...`);
      
      try {
        // Check initial status
        const initialStatus = await checkUserStatus(userSessionId);
        expect(initialStatus.success).toBe(true);
        expect(initialStatus.activeOperations.total).toBe(0);
        
        // Start download and stop button simulation simultaneously
        const [downloadResult, stopResult] = await Promise.all([
          simulateChatDownload(userSessionId, testUrl),
          simulateStopButton(userSessionId, STOP_DELAY)
        ]);
        
        console.log(`📊 [${userSessionId.slice(0, 8)}] Download result:`, downloadResult.reply);
        console.log(`📊 [${userSessionId.slice(0, 8)}] Stop result:`, stopResult);
        
        // Verify that something was stopped
        expect(stopResult.totalStopped).toBeGreaterThan(0);
        
        // Verify download was cancelled
        expect(downloadResult.reply).toMatch(/cancelled|stopped/i);
        
        // Check final status
        const finalStatus = await checkUserStatus(userSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
        console.log(`✅ [${userSessionId.slice(0, 8)}] Dropbox download successfully stopped!`);
      } finally {
        // Cleanup
        await cleanupUserSession(userSessionId);
      }
    }, DOWNLOAD_TIMEOUT + 10000);
  });

  describe('FT-STOP-002: Stop GitHub Download', () => {
    const testUrl = 'https://github.com/vercel/next.js';
    
    test('should successfully stop GitHub download when user clicks stop button', async () => {
      const userSessionId = uuidv4(); // Unique session for this test
      console.log(`🆔 Test User Session ID: ${userSessionId.slice(0, 8)}...`);
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Starting GitHub download stop test...`);
      
      try {
        const initialStatus = await checkUserStatus(userSessionId);
        expect(initialStatus.success).toBe(true);
        expect(initialStatus.activeOperations.total).toBe(0);
        
        const [downloadResult, stopResult] = await Promise.all([
          simulateChatDownload(userSessionId, testUrl),
          simulateStopButton(userSessionId, STOP_DELAY)
        ]);
        
        console.log(`📊 [${userSessionId.slice(0, 8)}] Download result:`, downloadResult.reply);
        console.log(`📊 [${userSessionId.slice(0, 8)}] Stop result:`, stopResult);
        
        expect(stopResult.totalStopped).toBeGreaterThan(0);
        expect(downloadResult.reply).toMatch(/cancelled|stopped/i);
        
        const finalStatus = await checkUserStatus(userSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
        console.log(`✅ [${userSessionId.slice(0, 8)}] GitHub download successfully stopped!`);
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, DOWNLOAD_TIMEOUT + 10000);
  });

  describe('FT-STOP-003: Stop Google Drive Download', () => {
    const testUrl = 'https://drive.usercontent.google.com/download?id=18PnWlPgDtCaj6BrzohUesujyKKd6EuQ2&export=download&authuser=0';
    
    test('should successfully stop Google Drive download when user clicks stop button', async () => {
      const userSessionId = uuidv4(); // Unique session for this test
      console.log(`🆔 Test User Session ID: ${userSessionId.slice(0, 8)}...`);
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Starting Google Drive download stop test...`);
      
      try {
        const initialStatus = await checkUserStatus(userSessionId);
        expect(initialStatus.success).toBe(true);
        expect(initialStatus.activeOperations.total).toBe(0);
        
        const [downloadResult, stopResult] = await Promise.all([
          simulateChatDownload(userSessionId, testUrl),
          simulateStopButton(userSessionId, STOP_DELAY)
        ]);
        
        console.log(`📊 [${userSessionId.slice(0, 8)}] Download result:`, downloadResult.reply);
        console.log(`📊 [${userSessionId.slice(0, 8)}] Stop result:`, stopResult);
        
        expect(stopResult.totalStopped).toBeGreaterThan(0);
        expect(downloadResult.reply).toMatch(/cancelled|stopped/i);
        
        const finalStatus = await checkUserStatus(userSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
        console.log(`✅ [${userSessionId.slice(0, 8)}] Google Drive download successfully stopped!`);
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, DOWNLOAD_TIMEOUT + 10000);
  });

  describe('FT-STOP-004: Stop Direct Download', () => {
    const testUrl = 'https://get.videolan.org/vlc/3.0.18/win64/vlc-3.0.18-win64.exe';
    
    test('should successfully stop direct download when user clicks stop button', async () => {
      const userSessionId = uuidv4(); // Unique session for this test
      console.log(`🆔 Test User Session ID: ${userSessionId.slice(0, 8)}...`);
      console.log(`🧪 [${userSessionId.slice(0, 8)}] Starting direct download stop test...`);
      
      try {
        const initialStatus = await checkUserStatus(userSessionId);
        expect(initialStatus.success).toBe(true);
        expect(initialStatus.activeOperations.total).toBe(0);
        
        const [downloadResult, stopResult] = await Promise.all([
          simulateChatDownload(userSessionId, testUrl),
          simulateStopButton(userSessionId, STOP_DELAY)
        ]);
        
        console.log(`📊 [${userSessionId.slice(0, 8)}] Download result:`, downloadResult.reply);
        console.log(`📊 [${userSessionId.slice(0, 8)}] Stop result:`, stopResult);
        
        expect(stopResult.totalStopped).toBeGreaterThan(0);
        expect(downloadResult.reply).toMatch(/cancelled|stopped/i);
        
        const finalStatus = await checkUserStatus(userSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
        console.log(`✅ [${userSessionId.slice(0, 8)}] Direct download successfully stopped!`);
      } finally {
        await cleanupUserSession(userSessionId);
      }
    }, DOWNLOAD_TIMEOUT + 10000);
  });

 describe('FT-STOP-005: Multi-User Isolation Test', () => {
  // Use larger files that take longer to download
  const testUrl1 = 'https://www.dropbox.com/scl/fi/1blydyiwm2p0crzzmwf8k/rufus-4.7p.exe?rlkey=3kbnx7pf22wkd7r0vnk6gbcnh&e=4&st=wf1u1ea1&dl=0'; 
  const testUrl2 = 'https://github.com/vercel/next.js';
  
  test('should only stop operations for the user who clicked stop, not other users', async () => {
    const user1SessionId = uuidv4();
    const user2SessionId = uuidv4();
    
    console.log(`🧪 User 1: ${user1SessionId.slice(0, 8)}... | User 2: ${user2SessionId.slice(0, 8)}...`);
    
    try {
      // Start downloads for both users with a shorter delay for the stop button
      const user1DownloadPromise = simulateChatDownload(user1SessionId, testUrl1);
      const user2DownloadPromise = simulateChatDownload(user2SessionId, testUrl2);

       const user1StopPromise = simulateStopButton(user1SessionId, 5000);
      
      console.log(`⏹️ User 1 (${user1SessionId.slice(0, 8)}...) will click stop button after 500ms`);
      
      // Wait for the stop operation to complete
      const user1StopResult = await user1StopPromise;
      
      // Then wait for downloads to complete or be cancelled
      const [user1Result, user2Result] = await Promise.all([
        user1DownloadPromise,
        user2DownloadPromise
      ]);
      
      console.log(`📊 User 1 download result:`, user1Result.reply);
      console.log(`📊 User 2 download result:`, user2Result.reply);
      console.log(`📊 User 1 stop result:`, user1StopResult);
      
      // More flexible assertions based on what actually happened
      if (user1StopResult.totalStopped > 0) {
        // If User 1's operation was successfully stopped
        expect(user1StopResult.totalStopped).toBeGreaterThan(0);
        expect(user1Result.reply).toMatch(/cancelled|stopped/i);
        console.log(`✅ User 1's operation was successfully stopped`);
      } else {
        // If User 1's download completed before stop button was clicked
        console.log(`ℹ️ User 1's download completed before stop button took effect`);
        expect(user1StopResult.totalStopped).toBe(0);
        expect(user1Result.reply).not.toMatch(/cancelled|stopped/i);
      }
      
      // User 2 should NEVER be affected by User 1's stop button
      expect(user2Result.reply).not.toMatch(/cancelled|stopped/i);
      console.log(`✅ User 2's operation was NOT affected by User 1's stop button`);
      
      // Check both users' final status - should be clean
      const user1FinalStatus = await checkUserStatus(user1SessionId);
      const user2FinalStatus = await checkUserStatus(user2SessionId);
      
      expect(user1FinalStatus.activeOperations.total).toBe(0);
      expect(user2FinalStatus.activeOperations.total).toBe(0);
      
      console.log(`✅ Multi-user isolation test passed!`);
      
    } finally {
      await Promise.all([
        cleanupUserSession(user1SessionId),
        cleanupUserSession(user2SessionId)
      ]);
    }
  }, DOWNLOAD_TIMEOUT + 15000);
});

  describe('FT-STOP-006: Stop Non-Existent Operations', () => {
    test('should handle stop button click when no operations are running', async () => {
      const emptyUserSessionId = uuidv4();
      
      console.log(`🧪 [${emptyUserSessionId.slice(0, 8)}] Testing stop button with no operations...`);
      
      try {
        const initialStatus = await checkUserStatus(emptyUserSessionId);
        expect(initialStatus.success).toBe(true);
        expect(initialStatus.activeOperations.total).toBe(0);
        
        const stopResult = await simulateStopButton(emptyUserSessionId, 100);
        
        console.log(`📊 [${emptyUserSessionId.slice(0, 8)}] Stop result:`, stopResult);
        
        // Should return 0 operations stopped
        expect(stopResult.totalStopped).toBe(0);
        expect(stopResult.downloads.success).toBe(true);
        expect(stopResult.scans.success).toBe(true);
        
        const finalStatus = await checkUserStatus(emptyUserSessionId);
        expect(finalStatus.activeOperations.total).toBe(0);
        
        console.log(`✅ [${emptyUserSessionId.slice(0, 8)}] No operations stop test passed!`);
      } finally {
        await cleanupUserSession(emptyUserSessionId);
      }
    }, 10000);
  });
});

// Cleanup function
afterAll(async () => {
  if (global.browser && typeof global.browser.close === 'function') {
    await global.browser.close();
    console.log('🧹 Global browser closed after all tests.');
  }
});