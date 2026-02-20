const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
// ✅ Allow runtime override of TEST_MODE (from spawn environment)
const testMode = parseInt(process.env.TEST_MODE || '0');
console.log("🚦 Server running in TEST_MODE:", testMode, typeof testMode);
const { createApp } = require('../app');
const app = createApp();
const PORT = 4000; // or 3002, 3003 per service

// API keys
const BYTESCALE_SECRET = process.env.BYTESCALE_SECRET_KEY;
const CLOUDMERSIVE_KEY = process.env.CLOUDMERSIVE_API_KEY;

const upload = multer({ dest: 'uploads/' });

// Add this after your existing imports and before the ScanOperationManager class
class ScanSSEManager {
  constructor() {
    this.connections = new Map(); // userSessionId -> response object
  }

  addConnection(userSessionId, res) {
    this.connections.set(userSessionId, res);
    console.log(`🔗 Scan SSE connected for user: ${userSessionId.slice(0, 8)}...`);
    
    this.sendToUser(userSessionId, {
      type: 'connected',
      message: 'Scan updates active'
    });
  }

  removeConnection(userSessionId) {
    this.connections.delete(userSessionId);
    console.log(`🔌 Scan SSE disconnected for user: ${userSessionId.slice(0, 8)}...`);
  }

  sendToUser(userSessionId, data) {
    const res = this.connections.get(userSessionId);
    if (res) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
      } catch (error) {
        console.error(`❌ Scan SSE send error for user ${userSessionId.slice(0, 8)}:`, error.message);
        this.removeConnection(userSessionId);
        return false;
      }
    }
    return false;
  }

  sendScanActivity(userSessionId, scanId, activityType, data = {}) {
    const success = this.sendToUser(userSessionId, {
      type: 'scan_activity',
      scanId,
      activityType,
      data,
      timestamp: Date.now()
    });

    if (success) {
      console.log(`📊 Scan SSE Activity sent to ${userSessionId.slice(0, 8)}: ${activityType}`, data);
    }

    return success;
  }
}

// Create the SSE manager instance
const scanSSE = new ScanSSEManager();

class ScanOperationManager {
  constructor() {
    this.activeScans = new Map(); // scanId -> { controller, type, startTime, filePath, userSessionId, status }
    this.userScans = new Map();   // ✅ NEW: userSessionId -> Set of scanIds
    this.globalStop = false;
  }

  cleanupScanFile(scan) {
    if (scan.metadata.filePath && fs.existsSync(scan.metadata.filePath)) {
      try {
        fs.unlinkSync(scan.metadata.filePath);
        console.log(`🗑️ Cleaned up file: ${scan.metadata.filePath}`);
      } catch (err) {
        console.warn(`⚠️ Failed to clean up file: ${err.message}`);
      }
    }
  }

  // Add method to check if scan was cancelled
  isScanCancelled(scanId) {
    const scan = this.activeScans.get(scanId);
    return !scan || scan.status === 'cancelled' || scan.controller.signal.aborted;
  }

  // ✅ UPDATED: Now accepts userSessionId as first parameter
  createScan(userSessionId, type, metadata = {}) {
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    
    const scan = {
      controller,
      type,
      startTime: Date.now(),
      lastActivity: Date.now(),
      metadata,
      status: 'running',
      userSessionId  // ✅ NEW: Track which user owns this scan
    };
    
    this.activeScans.set(scanId, scan);
    
    // ✅ NEW: Track scan by user
    if (!this.userScans.has(userSessionId)) {
      this.userScans.set(userSessionId, new Set());
    }
    this.userScans.get(userSessionId).add(scanId);
    
    console.log(`🆔 Created scan: ${scanId} (${type}) for user: ${userSessionId.slice(0, 8)}...`);
    return { scanId, signal: controller.signal };
  }
 updateScanActivity(scanId, activityType = 'progress', data = {}) {
  const scan = this.activeScans.get(scanId);
  if (scan) {
    scan.lastActivity = Date.now();
    const duration = Date.now() - scan.startTime;
    console.log(`🔄 Scan activity update for ${scanId.slice(-8)}...: ${activityType} (${Math.floor(duration/1000)}s elapsed)`);
    
    // Send SSE update to user
    if (scan.userSessionId) {
      scanSSE.sendScanActivity(scan.userSessionId, scanId, activityType, data);
    }
    
    return true;
  }
  return false;
}

  stopScan(scanId) {
    const scan = this.activeScans.get(scanId);
    if (scan) {
      console.log(`⏹️ Forcefully aborting scan: ${scanId}`);
      
      // Immediately abort the controller
      scan.controller.abort();
      scan.status = 'cancelled';
      
      // Clean up file if exists
      this.cleanupScanFile(scan);
      
      // Remove from active scans
      this.activeScans.delete(scanId);
      
      // ✅ NEW: Remove from user tracking
      if (this.userScans.has(scan.userSessionId)) {
        this.userScans.get(scan.userSessionId).delete(scanId);
        
        // Clean up empty user entries
        if (this.userScans.get(scan.userSessionId).size === 0) {
          this.userScans.delete(scan.userSessionId);
        }
      }
      
      return true;
    }
    return false;
  }

  // ✅ NEW: User-specific scan stopping
  stopUserScans(userSessionId) {
    console.log(`⏹️ Force stopping scans for user: ${userSessionId.slice(0, 8)}...`);
    
    if (!this.userScans.has(userSessionId)) {
      console.log(`   - No scans found for user: ${userSessionId.slice(0, 8)}...`);
      return { stoppedCount: 0, stoppedScans: [] };
    }
    
    const userScanIds = this.userScans.get(userSessionId);
    const stoppedScans = [];
    
    for (const scanId of userScanIds) {
      const scan = this.activeScans.get(scanId);
      if (scan && scan.userSessionId === userSessionId) {
        console.log(`   - Force aborting: ${scanId} (${scan.type})`);
        
        // Immediately abort
        scan.controller.abort();
        scan.status = 'cancelled';
        
        // Clean up files
        this.cleanupScanFile(scan);
        
        // Remove from active scans
        this.activeScans.delete(scanId);
        stoppedScans.push(scanId);
      }
    }
    
    // Remove user from tracking
    this.userScans.delete(userSessionId);
    
    return {
      stoppedCount: stoppedScans.length,
      stoppedScans
    };
  }

  stopAllScans() {
    console.log(`⏹️ SYSTEM-WIDE STOP: Force stopping all ${this.activeScans.size} active scans...`);
    
    const stoppedScans = [];
    
    for (const [scanId, scan] of this.activeScans) {
      console.log(`   - Force aborting: ${scanId} (${scan.type}) for user: ${scan.userSessionId?.slice(0, 8)}...`);
      
      // Immediately abort
      scan.controller.abort();
      scan.status = 'cancelled';
      
      // Clean up files
      this.cleanupScanFile(scan);
      
      stoppedScans.push(scanId);
    }
    
    const stoppedCount = this.activeScans.size;
    this.activeScans.clear();
    this.userScans.clear(); // ✅ NEW: Clear user tracking too
    this.globalStop = true;
    
    // Reset global stop after 3 seconds
    setTimeout(() => {
      this.globalStop = false;
      console.log('🔄 Antivirus system ready for new scans');
    }, 3000);
    
    return {
      stoppedCount,
      stoppedScans
    };
  }

  isGlobalStop() {
    return this.globalStop;
  }

  getActiveScans() {
    return Array.from(this.activeScans.entries()).map(([id, scan]) => ({
      id,
      type: scan.type,
      duration: Date.now() - scan.startTime,
      status: scan.status,
      metadata: scan.metadata,
      userSessionId: scan.userSessionId
    }));
  }

  // ✅ NEW: Get active scans for specific user
  getUserActiveScans(userSessionId) {
    if (!this.userScans.has(userSessionId)) {
      return [];
    }
    
    const userScanIds = this.userScans.get(userSessionId);
    const userScans = [];
    
    for (const scanId of userScanIds) {
      const scan = this.activeScans.get(scanId);
      if (scan) {
        userScans.push({
          id: scanId,
          type: scan.type,
          duration: Date.now() - scan.startTime,
          status: scan.status,
          metadata: scan.metadata
        });
      }
    }
    
    return userScans;
  }

  completeScan(scanId) {
    const scan = this.activeScans.get(scanId);
    if (scan) {
      const userSessionId = scan.userSessionId;
      
      scan.status = 'completed';
      this.activeScans.delete(scanId);
      
      // ✅ NEW: Remove from user tracking
      if (this.userScans.has(userSessionId)) {
        this.userScans.get(userSessionId).delete(scanId);
        
        // Clean up empty user entries
        if (this.userScans.get(userSessionId).size === 0) {
          this.userScans.delete(userSessionId);
        }
      }
      
      console.log(`✅ Completed scan: ${scanId} for user: ${userSessionId?.slice(0, 8)}...`);
    }
  }

  cleanup() {
  const now = Date.now();
  for (const [scanId, scan] of this.activeScans) {
    const lastActivity = scan.lastActivity || scan.startTime;
    // Clean up scans inactive for 15 minutes (scans can take longer)
    if (now - lastActivity > 15 * 60 * 1000) {
      const totalDuration = Math.floor((now - scan.startTime) / 1000);
      const inactiveDuration = Math.floor((now - lastActivity) / 1000);
      console.log(`🧹 Cleaning up inactive scan: ${scanId} (total: ${totalDuration}s, inactive: ${inactiveDuration}s) for user: ${scan.userSessionId?.slice(0, 8)}...`);
      this.stopScan(scanId);
    }
  }
}
}

const scanManager = new ScanOperationManager();

// Cleanup stale scans every 2 minutes
setInterval(() => scanManager.cleanup(), 120000);

// AntivirusApiManager for managing multiple scanning engines
class AntivirusApiManager {
  constructor(apiConfigurations) {
    this.apis = apiConfigurations;
    this.originalPercentages = {};
    
    // Store original percentage allocations
    for (const api of Object.keys(this.apis)) {
      this.originalPercentages[api] = this.apis[api].percentage;
    }
  }
  
  // Recalculate percentages when APIs are unavailable
  recalculatePercentages(unavailableApis = []) {
    if (unavailableApis.length === 0) return this.apis;
    if (unavailableApis.length === Object.keys(this.apis).length) {
      console.error("All APIs are unavailable");
      return this.apis;
    }
    
    // Get available APIs
    const availableApis = Object.keys(this.apis).filter(api => !unavailableApis.includes(api));
    
    // Calculate percentages to redistribute
    let percentageToRedistribute = 0;
    for (const api of unavailableApis) {
      percentageToRedistribute += this.originalPercentages[api];
    }
    
    let totalAvailablePercentage = 0;
    for (const api of availableApis) {
      totalAvailablePercentage += this.originalPercentages[api];
    }
    
    // Create updated configuration
    const updatedApis = JSON.parse(JSON.stringify(this.apis));
    
    // Set unavailable APIs to 0%
    for (const api of unavailableApis) {
      updatedApis[api].percentage = 0;
    }
    
    // Redistribute percentages
    for (const api of availableApis) {
      const proportionalShare = this.originalPercentages[api] / totalAvailablePercentage;
      const additionalPercentage = percentageToRedistribute * proportionalShare;
      updatedApis[api].percentage = this.originalPercentages[api] + additionalPercentage;
    }
    
    return updatedApis;
  }
  
  // Get scan tasks based on available APIs
  getScanTasks(filePath, bytescaleResult, bytescaleFailureReason = "", signal = null, scanId = null) {
    // Check which APIs are available
    const unavailableApis = [];
    for (const [apiName, apiConfig] of Object.entries(this.apis)) {
      if (!apiConfig.isAvailable) {
        unavailableApis.push(apiName);
      }
    }
    
    // Recalculate percentages
    const currentConfig = this.recalculatePercentages(unavailableApis);
    console.log("🔄 Current API allocation:", Object.fromEntries(
      Object.entries(currentConfig).map(([api, config]) => [api, config.percentage.toFixed(1) + '%'])
    ));
    
    const tasks = [];
    
    // Include Bytescale result if provided
    if (bytescaleResult) {
      tasks.push(Promise.resolve({
        engine: 'Bytescale', 
        result: bytescaleResult,
        failureReason: bytescaleResult === "Clean ✅" ? "" : bytescaleFailureReason
      }));
    } else if (currentConfig.bytescale.percentage > 0) {
      tasks.push(Promise.resolve({
        engine: 'Bytescale',
        result: 'Unknown',
        failureReason: 'No result data available from service'
      }));
    }
    
    // Add ClamAV task if available
    if (currentConfig.clamav.percentage > 0) {
      tasks.push(
        scanWithClamAV(filePath, signal, scanId)
          .catch(err => {
            if (signal?.aborted || err.message.includes('cancelled')) {
    return { 
      engine: 'ClamAV', 
      result: 'Cancelled',
      failureReason: 'Scan was cancelled by user'
    };
  }
            console.warn("⚠️ ClamAV scan failed:", err);
            this.setApiAvailability('clamav', false);
            return { 
              engine: 'ClamAV', 
              result: 'Unknown',
              failureReason: `Engine error: ${err.message || 'Unknown error'}`
            };
          })
      );
    } else {
      tasks.push(Promise.resolve({
        engine: 'ClamAV',
        result: 'Skipped (inactive)',
        failureReason: 'Service disabled by system or user'
      }));
    }
    
    // Add Cloudmersive task if available
    if (currentConfig.cloudmersive.percentage > 0) {
      tasks.push(
        scanWithCloudmersive(filePath, signal, scanId)
          .catch(err => {
             if (signal?.aborted || err.message.includes('cancelled')) {
    return { 
      engine: 'Cloudmersive', 
      result: 'Cancelled',
      failureReason: 'Scan was cancelled by user'
    };
  }
            console.warn("⚠️ Cloudmersive scan failed:", err);
            this.setApiAvailability('cloudmersive', false);
            return { 
              engine: 'Cloudmersive', 
              result: 'Unknown',
              failureReason: err.failureReason || `API error: ${err.message || 'Unknown error'}`
            };
          })
      );
    } else {
      tasks.push(Promise.resolve({
        engine: 'Cloudmersive',
        result: 'Skipped (inactive)',
        failureReason: 'Service disabled by system or user'
      }));
    }
    
    return tasks;
  }
  
  // Set API availability
  setApiAvailability(apiName, isAvailable) {
    if (this.apis[apiName]) {
      this.apis[apiName].isAvailable = isAvailable;
      console.log(`🔄 API ${apiName} is now ${isAvailable ? 'available' : 'unavailable'}`);
    }
  }
  
  // Get current API allocation
  getCurrentAllocation() {
    const unavailableApis = Object.keys(this.apis).filter(api => !this.apis[api].isAvailable);
    const currentConfig = this.recalculatePercentages(unavailableApis);
    
    return Object.fromEntries(
      Object.entries(currentConfig).map(([api, config]) => [api, parseFloat(config.percentage.toFixed(1))])
    );
  }
  
  // Calculate final verdict
 // Calculate final verdict
calculateVerdict(results) {
  // Get normalized weights
  const allocation = this.getCurrentAllocation();
  const totalAllocation = Object.values(allocation).reduce((sum, val) => sum + val, 0);
  
  const weights = {};
  for (const [api, percentage] of Object.entries(allocation)) {
    weights[api] = percentage / totalAllocation;
  }
  
  // Convert results to scores
  const scores = {};
  let validResultCount = 0;
  let maliciousCount = 0;
  let nullCount = 0;

  for (const result of results) {
    const apiName = result.engine.toLowerCase();
    
    if (result.result === 'Clean ✅' || result.result.includes('Clean')) {
      scores[apiName] = 1;
      validResultCount++;
    } else if (result.result === 'Infected ❌' || result.result.includes('Infected')) {
      scores[apiName] = 0;
      validResultCount++;
      maliciousCount++;
    } else {
      scores[apiName] = null;
      nullCount++;
    }
  }

  // Check if 2 or more APIs are unavailable
  let weightedScore = 0;
  if (nullCount >= 2) {
    weightedScore = 0;
  } 
  else {
    // Calculate weighted score
    let usedWeightSum = 0;

    for (const [api, score] of Object.entries(scores)) {
      if (score !== null && weights[api] > 0) {
        weightedScore += score * weights[api];
        usedWeightSum += weights[api];
      }
    }

    if (usedWeightSum > 0) {
      weightedScore = weightedScore / usedWeightSum * 100;
    }
  }

  // // Determine verdict
  // let verdict;
  // if (validResultCount <= 1 || nullCount >= 2) {
  //   verdict = "Unkonwn file status";
  // } else if (weightedScore >= 80 && maliciousCount === 0) {
  //   verdict = "Safe";
  // } else if (weightedScore >= 50 ) {
  //   verdict = "Suspicious";
  // } else {
  //   verdict = "Malicious";
  // }


  // Determine verdict
  let verdict;
  if (validResultCount <= 1 || nullCount >= 2) {
    verdict = "Unkonwn file status";
  } else if (weightedScore >= 80 && (maliciousCount < (validResultCount-1))) {
    verdict = "Safe";
  } else if (weightedScore >= 50  && (maliciousCount <= (validResultCount-1))) {
    verdict = "Suspicious";
  } else {
    verdict = "Malicious";
  }




  return {
    weightedScore: parseFloat(weightedScore.toFixed(2)),
    verdict,
    validResultCount,
    maliciousCount
  };
}

}

// Initialize API manager with initial configuration
const antivirusManager = new AntivirusApiManager({
  bytescale: {
    percentage: 34,
    isAvailable: true
  },
  cloudmersive: {
    percentage: 37,
    isAvailable: true
  },
  clamav: {
    percentage: 29,
    isAvailable: true
  }
});

// Scan with ClamAV
function scanWithClamAV(filePath, signal, scanId = null) {
  return new Promise((resolve, reject) => {
    console.log("🧪 Scanning with ClamAV...");
    
    if (signal?.aborted) {
      return reject(new Error('Scan cancelled before starting'));
    }
    if (scanId) {
      scanManager.updateScanActivity(scanId, 'clamav_scan_start', { 
        engine: 'ClamAV',
        status: 'starting'
      });
    }
    const child = exec(`clamscan "${filePath}"`, (err, stdout) => {
      if (signal?.aborted) {
        return reject(new Error('Scan was cancelled'));
      }
      
      if (err && !stdout) {
        console.error("❌ ClamAV error:", err);
        if (scanId) {
          scanManager.updateScanActivity(scanId, 'clamav_scan_error', { 
            engine: 'ClamAV',
            error: err.message
          });
        }
        return reject(err);
      }
      
      const infected = stdout.includes('FOUND');
      if (scanId) {
        scanManager.updateScanActivity(scanId, 'clamav_scan_complete', { 
          engine: 'ClamAV',
          result: infected ? 'Infected' : 'Clean',
          status: 'completed'
        });
      }
      resolve({
        engine: 'ClamAV',
        result: infected ? 'Infected ❌' : 'Clean ✅',
        failureReason: ''
      });
    });
    
    // Handle abort signal - KILL the process immediately
    if (signal) {
      signal.addEventListener('abort', () => {
        console.log('⏹️ Force killing ClamAV process...');
        try {
        // Kill the process group to ensure child processes are also killed
        if (child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch (killError) {
        console.log('⚠️ Process already terminated (expected):', killError.message);
        // Try regular kill as fallback
        try {
          if (child.pid) {
            child.kill('SIGKILL');
          }
        } catch (fallbackError) {
          console.log('⚠️ Process cleanup complete');
        }
      }
        reject(new Error('ClamAV scan was cancelled'));
      });
    }
  });
}


// Scan with Cloudmersive
function scanWithCloudmersive(filePath, signal, scanId = null) {
  console.log("🌐 Scanning with Cloudmersive...");
  
  if (signal?.aborted) {
    return Promise.reject(new Error('Scan cancelled before starting'));
  }
  if (scanId) {
    scanManager.updateScanActivity(scanId, 'cloudmersive_scan_start', { 
      engine: 'Cloudmersive',
      status: 'starting'
    });
  }
  const fileBuffer = fs.readFileSync(filePath);
  
  return axios.post('https://api.cloudmersive.com/virus/scan/file', fileBuffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Apikey': CLOUDMERSIVE_KEY
    },
    signal: signal, // Pass abort signal to axios
  }).then(res => {
    if (signal?.aborted) {
      throw new Error('Scan was cancelled');
    }
    if (scanId) {
      scanManager.updateScanActivity(scanId, 'cloudmersive_scan_complete', { 
        engine: 'Cloudmersive',
        result: res.data.CleanResult ? 'Clean' : 'Infected',
        status: 'completed'
      });
    }
    return {
      engine: 'Cloudmersive',
      result: res.data.CleanResult ? 'Clean ✅' : 'Infected ❌',
      failureReason: ''
    };
  }).catch(err => {
    if (signal?.aborted || err.message.includes('cancelled')) {
      throw new Error('Cloudmersive scan was cancelled');
    }
    if (scanId) {
      scanManager.updateScanActivity(scanId, 'cloudmersive_scan_error', { 
        engine: 'Cloudmersive',
        error: err.message
      });
    }
    const failureReason = err.response?.data || err.message || 'API error';
    err.failureReason = failureReason;
    throw err;
  });
}

// Delete file from Bytescale
async function deleteFileFromBytescale({ accountId, apiKey, querystring }) {
  const baseUrl = "https://api.bytescale.com";
  const path = `/v2/accounts/${accountId}/files`;
  const entries = obj => Object.entries(obj).filter(([, val]) => (val ?? null) !== null);
  const query = entries(querystring ?? {})
    .flatMap(([k, v]) => Array.isArray(v) ? v.map(v2 => [k, v2]) : [[k, v]])
    .map(kv => kv.join("=")).join("&");

  const response = await fetch(`${baseUrl}${path}${query.length > 0 ? "?" : ""}${query}`, {
    method: "DELETE",
    headers: Object.fromEntries(entries({
      "Authorization": `Bearer ${apiKey}`,
    }))
  });

  if (response.status === 200 || response.status === 204) {
    console.log("🧽 Bytescale deletion successful: No content returned.");
    return;
  }

  const text = await response.text();
  if (text) {
    const result = JSON.parse(text);
    if (Math.floor(response.status / 100) !== 2) {
      throw new Error(`Bytescale API Error: ${JSON.stringify(result)}`);
    }
  } else {
    throw new Error(`Unexpected empty response with status ${response.status}`);
  }
}

// Upload to Bytescale
async function basicUploadToBytescale(file, fileName) {
  console.log("📤 Uploading to Bytescale...");
  
  try {
    const baseUrl = "https://api.bytescale.com";
    const path = "/v2/accounts/G22nj7v/uploads/binary";
    const queryString = `fileName=${fileName}&folderPath=/uploads`;
    
    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
      method: "POST",
      body: file.buffer || fs.readFileSync(file.path),
      headers: {
        "Authorization": `Bearer ${BYTESCALE_SECRET}`,
        "X-Upload-Metadata": JSON.stringify({})
      }
    });
    
    const result = await response.json();
    
    if (Math.floor(response.status / 100) !== 2) {
      console.warn("⚠️ Bytescale rejected the file");
      return { message: "Rejected file" };
    }
    
    return result;
  } catch (error) {
    console.error("❌ Upload error:", error);
    return { message: "Rejected file" };
  }
}

// Poll for antivirus scan results
async function pollAntivirusScan(url) {
  console.log("🔁 Polling Bytescale antivirus results...");
  for (let attempt = 1; attempt <= 10; attempt++) {
    console.log(`⏳ Poll attempt ${attempt}`);
    try {
      const res = await fetch(url);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.warn(`⚠️ Poll attempt ${attempt} failed with status ${res.status}: ${errorText}`);
        
        if (attempt === 10) {
          return {
            status: "Failed",
            summary: {
              result: {
                files: [{
                  status: "Failed", 
                  message: `API returned status ${res.status}`
                }]
              }
            }
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      const data = await res.json();
      
      if (data.status === "Succeeded") {
        console.log("✅ Scan succeeded:", data);
        return data;
      } else if (data.status === "Failed") {
        console.warn("❌ Scan failed:", data);
        return {
          summary: {
            result: {
              files: [{
                status: "Failed",
                message: data.message || "Scan failed with no specific error message"
              }]
            }
          }
        };
      }
      
      // If still processing, wait and try again
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Poll attempt ${attempt} error:`, error);
      
      if (attempt === 10) {
        return {
          summary: {
            result: {
              files: [{
                status: "Error",
                message: error.message || "Network or parsing error"
              }]
            }
          }
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.warn("⏱️ Scan timed out.");
  return {
    summary: {
      result: {
        files: [{
          status: "Timed out",
          message: "Scan did not complete within the allocated time"
        }]
      }
    }
  };
}

// Main scan endpoint
app.post('/scan', upload.single('file'), async (req, res) => {
  const file = req.file;
  const bytescaleActive = req.body.bytescaleActive !== "false";
  const userSessionId = req.body.userSessionId;
  
  console.log("📥 Received scan request with file:", file?.filename);

  if (!userSessionId) {
  if (file && file.path) {
    try { fs.unlinkSync(file.path); } catch (e) {}
  }
  return res.status(400).json({
    success: false,
    error: 'Missing userSessionId',
    message: 'User session ID is required for file scanning'
  });
}
console.log("👤 User Session ID:", userSessionId?.slice(0, 8) + "...");

  // Check if system is in global stop mode
if (scanManager.isGlobalStop()) {
  if (file && file.path) {
    try { fs.unlinkSync(file.path); } catch (e) {}
  }
  return res.status(503).json({
    success: false,
    error: 'System stopping',
    message: 'Antivirus system is currently stopping all operations. Please wait and try again.'
  });
}

// Create scan operation
const { scanId, signal } = scanManager.createScan(userSessionId, 'file_scan', {
  filename: file?.originalname || 'unknown',
  filePath: file?.path
});
scanManager.updateScanActivity(scanId, 'file_validation_start');

  if(testMode === 1){
    antivirusManager.setApiAvailability('bytescale', false);
  }else if(testMode === 2){
    antivirusManager.setApiAvailability('cloudmersive', false);
  }else if(testMode === 3){
    antivirusManager.setApiAvailability('clamav', false);
  }else if(testMode === 4){
    antivirusManager.setApiAvailability('bytescale', false);
    antivirusManager.setApiAvailability('cloudmersive', false);
  }else if(testMode === 5){
    antivirusManager.setApiAvailability('bytescale', false);
    antivirusManager.setApiAvailability('clamav', false);
  }else if(testMode === 6){
    antivirusManager.setApiAvailability('cloudmersive', false);
    antivirusManager.setApiAvailability('clamav', false);
  }
  
  // Validate file
  if (!file) {
    return res.status(400).send({ error: 'Missing file' });
  }
  if (signal.aborted) {
  scanManager.stopScan(scanId);
  return res.status(499).json({
    success: false,
    error: 'Cancelled',
    message: 'Scan was cancelled before processing'
  });
}
  // Size validation
  const fileSize = file.size;
  if (fileSize > 1073741824) { // 1GB
    console.warn("❌ File too large:", fileSize);
    try {
      fs.unlinkSync(file.path);
    } catch (err) {
      console.warn("⚠️ Cleanup error:", err);
    }
    return res.status(400).send({ error: 'File is too big. Maximum allowed size is 1GB.' });
  }
  scanManager.updateScanActivity(scanId, 'file_validation_complete');
  
  if (signal.aborted) {
  scanManager.stopScan(scanId);
  return res.status(499).json({ success: false, error: 'Cancelled' });
}
  let bytescaleResult = "Unknown";
  let bytescaleFailureReason = "";
  let fileUrl = null;
  
  try {
    // Handle Bytescale upload if active
    if (bytescaleActive && antivirusManager.apis.bytescale.isAvailable) {
      scanManager.updateScanActivity(scanId, 'bytescale_upload_start', {
    engine: 'Bytescale',
    status: 'uploading'
  });
      const bytescaleResponse = await basicUploadToBytescale(file, file.originalname);
      
      if (bytescaleResponse.message === "Rejected file") {
        scanManager.updateScanActivity(scanId, 'bytescale_upload_rejected', {
      engine: 'Bytescale',
      status: 'rejected'
    });
        bytescaleResult = "Rejected file";
        bytescaleFailureReason = "Service rejected this file type or content";
      } else {
        fileUrl = bytescaleResponse.fileUrl;
        console.log("📁 File uploaded to:", fileUrl);
        
        // Poll for antivirus scan results
        const antivirusUrl = fileUrl.replace("/raw/", "/antivirus/");
        scanManager.updateScanActivity(scanId, 'bytescale_scan_start', {
      engine: 'Bytescale',
      status: 'scanning'
    });
        const scanResult = await pollAntivirusScan(antivirusUrl);
        scanManager.updateScanActivity(scanId, 'bytescale_scan_complete', {
      engine: 'Bytescale',
      result: scanResult?.summary?.result?.files?.[0]?.status || "Unknown",
      status: 'completed'
    });
        
        const rawStatus = scanResult?.summary?.result?.files?.[0]?.status || "Unknown";
        const statusMessage = scanResult?.summary?.result?.files?.[0]?.skippedReason || "";
        
        bytescaleResult = rawStatus === "Healthy" ? "Clean ✅" : rawStatus;
        
        if (rawStatus !== "Healthy") {
          bytescaleFailureReason = statusMessage ||
            (rawStatus === "Timed out" ? "Scan timed out after multiple attempts" :
              rawStatus === "Failed" ? "Scan failed on service side" :
                "Service returned unknown status");
        }
      }
    } else {
      console.log("📝 Bytescale is inactive, skipping upload");
      bytescaleResult = "Skipped";
      bytescaleFailureReason = "Service disabled by user";
    }
    
    // Update Bytescale availability based on the result
    if (bytescaleResult === "Unknown" || bytescaleResult === "Timed out" || bytescaleResult === "Rejected file" || bytescaleResult === "Skipped"){
      antivirusManager.setApiAvailability('bytescale', false);
    } else {
      antivirusManager.setApiAvailability('bytescale', true);
    }
    
    if (signal.aborted) {
  scanManager.stopScan(scanId);
  return res.status(499).json({ success: false, error: 'Cancelled' });
}
    // Get scan tasks based on current API availability
    const scanTasks = antivirusManager.getScanTasks(file.path, bytescaleResult, bytescaleFailureReason, signal, scanId);
    
    // Run all available scan tasks in parallel
    scanManager.updateScanActivity(scanId, 'multi_engine_scan_start');
    const results = await Promise.all(scanTasks);
    scanManager.updateScanActivity(scanId, 'all_scans_complete');

      if (signal.aborted) {
  scanManager.stopScan(scanId);
  return res.status(499).json({ success: false, error: 'Cancelled' });
}
    
    // Clean up the uploaded file
    try {
      fs.unlinkSync(file.path);
      console.log("🗑️ File deleted locally.");
    } catch (err) {
      console.warn('⚠️ Failed to delete local file:', err.message);
    }
    
    // Filter for valid results
    const validResults = results.filter(result => 
      result.result !== "Unknown" && 
      result.result !== "Timed out" && 
      result.result !== "Skipped"
    );
    
    // Calculate verdict
    const verdict = antivirusManager.calculateVerdict(results);
    console.log("🏁 Final verdict:", verdict);
    
    // Delete file from Bytescale
    if (fileUrl) {
      try {
        const cleanPath = new URL(fileUrl).pathname.replace(`/G22nj7v/raw`, "");
        console.log("🗑️ Deleting file from Bytescale:", cleanPath);
        
        await deleteFileFromBytescale({
          accountId: "G22nj7v",
          apiKey: BYTESCALE_SECRET,
          querystring: { filePath: cleanPath }
        });
        
        console.log("✅ File deleted from Bytescale.");
      } catch (deleteErr) {
        console.warn("⚠️ Failed to delete from Bytescale:", deleteErr);
      }
    }
    
    scanManager.completeScan(scanId);
    // Send response
    if (validResults.length <= 1) {
      console.warn("⚠️ Only one or zero APIs returned valid results");
      res.send({ 
        success: false, 
        error: "Insufficient scan coverage - too few antivirus engines responded",
        results,
        allocation: antivirusManager.getCurrentAllocation(),
        verdict: {
          ...verdict,
          verdict: "Unkown file status"
        }
      });
    } else {
      res.send({ 
        success: true, 
        results,
        allocation: antivirusManager.getCurrentAllocation(),
        verdict
      });
    }
    
    // Reset availability for all APIs
    antivirusManager.setApiAvailability('bytescale', true);
    antivirusManager.setApiAvailability('cloudmersive', true);
    antivirusManager.setApiAvailability('clamav', true);
  } catch (err) {
    console.error("❌ Unexpected error:", err);

     scanManager.stopScan(scanId);
  
  // Check if it was a cancellation error
  if (err.message.includes('cancelled') || signal?.aborted) {
    return res.status(499).json({
      success: false,
      error: 'Cancelled',
      message: 'Scan was cancelled during processing'
    });
  }
    
    // Clean up in case of error
    try {
      fs.unlinkSync(file.path);
    } catch (cleanupErr) {
      console.warn('⚠️ Failed to clean up after error:', cleanupErr.message);
    }
    
    if (fileUrl) {
      try {
        const cleanPath = new URL(fileUrl).pathname.replace(`/G22nj7v/raw`, "");
        await deleteFileFromBytescale({
          accountId: "G22nj7v",
          apiKey: BYTESCALE_SECRET,
          querystring: { filePath: cleanPath }
        });
      } catch (deleteErr) {
        console.warn("⚠️ Failed to delete from Bytescale after error:", deleteErr);
      }
    }
    
    // Send error response
    res.status(500).send({
      success: false,
      error: `Scan failed: ${err.message}`,
      results: [
        { 
          engine: 'Bytescale', 
          result: bytescaleResult || 'Unknown',
          failureReason: bytescaleFailureReason || 'General system error'
        },
        { 
          engine: 'ClamAV', 
          result: 'Unknown',
          failureReason: 'Service unavailable due to system error'
        },
        { 
          engine: 'Cloudmersive', 
          result: 'Unknown',
          failureReason: 'Service unavailable due to system error'
        }
      ],
      allocation: antivirusManager.getCurrentAllocation(),
      verdict: {
        weightedScore: 0,
        verdict: "Error",
        validResultCount: 0,
        maliciousCount: 0
      }
    });
  }
});

// Stop all scans endpoint
app.post('/stop-all-scans', (req, res) => {
  const { userSessionId } = req.body;  // ✅ CHANGED: Get userSessionId from body
  
  // ✅ CHANGED: Validate userSessionId instead of doing global stop
  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId',
      message: 'User session ID is required for scan cancellation'
    });
  }
  
  console.log(`⏹️ Force stop scans requested for user: ${userSessionId.slice(0, 8)}...`);
  
  try {
    // ✅ CHANGED: Call stopUserScans instead of stopAllScans
    const result = scanManager.stopUserScans(userSessionId);
    
    res.json({
      success: true,
      // ✅ CHANGED: User-specific messaging
      message: `Forcefully stopped ${result.stoppedCount} of your active scan(s).`,
      stoppedScans: result.stoppedCount,
      stoppedScanIds: result.stoppedScans,
      userSessionId  // ✅ ADDED: Include userSessionId in response
    });
    
  } catch (error) {
    console.error('❌ Error stopping user scans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop scans',
      message: error.message
    });
  }
});

app.post('/admin/stop-all-scans', (req, res) => {
  const { adminKey } = req.body;
  
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized',
      message: 'Admin key required for system-wide operations'
    });
  }
  
  console.log('⏹️ ADMIN: System-wide force stop all scans requested');
  
  try {
    const result = scanManager.stopAllScans();
    
    res.json({
      success: true,
      message: `ADMIN: Forcefully stopped ALL ${result.stoppedCount} active scan(s) for ALL users.`,
      stoppedScans: result.stoppedCount,
      stoppedScanIds: result.stoppedScans
    });
    
  } catch (error) {
    console.error('❌ Error stopping all scans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop all scans',
      message: error.message
    });
  }
});

app.get('/user-scan-status/:userSessionId', (req, res) => {
  const { userSessionId } = req.params;
  
  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId'
    });
  }
  
  const userScans = scanManager.getUserActiveScans(userSessionId);
  
  res.json({
    success: true,
    userSessionId,
    activeScans: userScans,
    totalActive: userScans.length,
    globalStop: scanManager.isGlobalStop(),
    lastUpdate: Date.now()
  });
});

// Scan status endpoint
app.get('/scan-status', (req, res) => {
  const { userSessionId } = req.query;  // ✅ ADDED: Get userSessionId from query
  
  if (userSessionId) {
    // ✅ ADDED: Return status for specific user
    const userScans = scanManager.getUserActiveScans(userSessionId);
    res.json({
      success: true,
      userSessionId,
      activeScans: userScans,
      totalActive: userScans.length,
      globalStop: scanManager.isGlobalStop()
    });
  } else {
    // ✅ ENHANCED: Return system-wide status with user count
    const activeScans = scanManager.getActiveScans();
    res.json({
      success: true,
      activeScans: activeScans,
      totalActive: activeScans.length,
      globalStop: scanManager.isGlobalStop(),
      userCount: scanManager.userScans.size  // ✅ ADDED: Number of users with active scans
    });
  }
});

app.get('/health', (req, res) => {
  // Use shell: true to let the system find clamscan
  exec('clamscan --version', { shell: true, timeout: 10000 }, (err, stdout) => {
    if (err) {
      console.log('❌ ClamAV health check failed:', err.message);
      return res.status(500).send('ClamAV not responding');
    }
    console.log('✅ ClamAV health check passed');
    res.status(200).send(`ClamAV is running: ${stdout.trim()}`);
  });
});

// Add SSE endpoint for scan updates
app.get('/scan-events/:userSessionId', (req, res) => {
  const { userSessionId } = req.params;
  
  if (!userSessionId) {
    return res.status(400).json({ error: 'Missing userSessionId' });
  }
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Add connection to SSE manager
  scanSSE.addConnection(userSessionId, res);
  
  // Handle client disconnect
  req.on('close', () => scanSSE.removeConnection(userSessionId));
  req.on('error', () => scanSSE.removeConnection(userSessionId));
  
  // Send keepalive every 30 seconds
  const keepAlive = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'keepalive', timestamp: Date.now() })}\n\n`);
    } catch (error) {
      clearInterval(keepAlive);
      scanSSE.removeConnection(userSessionId);
    }
  }, 30000);
  
  // Clean up on disconnect
  req.on('close', () => clearInterval(keepAlive));
});

// Start server
app.listen(PORT, () => console.log('🚀 Server running on http://localhost:4000'));
