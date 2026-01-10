const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');
const path = require('path');
const axios = require('axios');
const { createApp } = require('../app.js');
const app = createApp();
const PORT = 3000;
const ANTIVIRUS_API_URL = process.env.SCAN_URL; 
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const {downloadFile, handleURL} = require('../file_handler.js');

require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function fetchScanStatus(userSessionId) {
  try {
    const res = await axios.get(`${ANTIVIRUS_API_URL}/user-scan-status/${userSessionId}`, {
      timeout: 5000 // Add timeout to prevent hanging
    });
    return res.data;
  } catch (err) {
    console.error(`❌ Error fetching scan status for user ${userSessionId?.slice(0, 8)}:`, err.message);
    return {
      success: false,
      activeScans: [],
      totalActive: 0,
      globalStop: false
    };
  }
}

class SimpleSSEManager {
  constructor() {
    this.connections = new Map(); // userSessionId -> response object
  }

  addConnection(userSessionId, res) {
    this.connections.set(userSessionId, res);
    console.log(`🔗 SSE connected for user: ${userSessionId.slice(0, 8)}...`);
    
    // Send connection confirmation
    this.sendToUser(userSessionId, {
      type: 'connected',
      message: 'Real-time updates active'
    });
  }

  removeConnection(userSessionId) {
    this.connections.delete(userSessionId);
    console.log(`🔌 SSE disconnected for user: ${userSessionId.slice(0, 8)}...`);
  }

  sendToUser(userSessionId, data) {
    const res = this.connections.get(userSessionId);
    if (res) {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
      } catch (error) {
        console.error(`❌ SSE send error for user ${userSessionId.slice(0, 8)}:`, error.message);
        this.removeConnection(userSessionId);
        return false;
      }
    }
    return false;
  }

  // Enhanced activity updates with better data handling
sendActivity(userSessionId, operationId, activityType, data = {}) {
  // Ensure data is serializable and clean
  const cleanData = this.sanitizeData(data);
  
  const success = this.sendToUser(userSessionId, {
    type: 'activity',
    operationId,
    activityType,
    data: cleanData,
    timestamp: Date.now()
  });

  if (success) {
    console.log(`📊 SSE Activity sent to ${userSessionId.slice(0, 8)}: ${activityType}`, cleanData);
  }

  return success;
}
  // Sanitize data to prevent JSON serialization issues
  sanitizeData(data) {
  if (!data || typeof data !== 'object') return data;
  
  const cleaned = {};
  
  // Define allowed data fields
  const allowedFields = {
    percent: 'number',
    percentage: 'number',
    loaded: ['string', 'number'],
    total: ['string', 'number'],
    speed: 'string',
    elapsed: 'number',
    estimated: 'boolean',
    downloadedFormatted: 'string',
    totalFormatted: 'string',
    sizeFormatted: 'string',
    filename: 'string',
    size: 'number',
    status: 'string',
    error: 'string',
    message: 'string'
  };
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null && allowedFields[key]) {
      const allowedTypes = Array.isArray(allowedFields[key]) ? allowedFields[key] : [allowedFields[key]];
      
      if (allowedTypes.includes(typeof value)) {
        if (key === 'percent' && (value < 0 || value > 100)) {
          cleaned[key] = Math.max(0, Math.min(100, value));
        } else if (typeof value === 'string' && value.length > 500) {
          cleaned[key] = value.substring(0, 500); // Limit string length
        } else {
          cleaned[key] = value;
        }
      }
    }
  }
  return cleaned;
}
}

const simpleSSE = new SimpleSSEManager();

// 🆕 ADD: User-specific links management class
class UserLinksManager {
  constructor() {
    this.userLinks = new Map(); // userSessionId -> { links, timestamp, sourceUrl }
    this.linkExpiryTime = 30 * 60 * 1000; // 30 minutes
  }

  storeLinksForUser(userSessionId, links, sourceUrl) {
    const linkData = {
      links: links,
      timestamp: Date.now(),
      sourceUrl: sourceUrl
    };
    
    this.userLinks.set(userSessionId, linkData);
    
    console.log(`📋 Stored ${links.length} links for user: ${userSessionId.slice(0, 8)}...`);
    console.log(`🕒 Timestamp: ${new Date(linkData.timestamp).toISOString()}`);
    console.log(`🔗 Source URL: ${sourceUrl}`);
    
    return linkData;
  }

  getLinksForUser(userSessionId) {
    const linkData = this.userLinks.get(userSessionId);
    
    if (!linkData) {
      console.log(`❌ No links found for user: ${userSessionId.slice(0, 8)}...`);
      return null;
    }

    if (this.isExpired(linkData.timestamp)) {
      console.log(`🕒 Links expired for user: ${userSessionId.slice(0, 8)}...`);
      this.userLinks.delete(userSessionId);
      return null;
    }

    return linkData;
  }

  areLinksValidForUser(userSessionId, requestUrl = null) {
    const linkData = this.getLinksForUser(userSessionId);
    
    if (!linkData) {
      return false;
    }

    if (requestUrl && linkData.sourceUrl && linkData.sourceUrl !== requestUrl) {
      console.log(`🔄 Different source URL for user: ${userSessionId.slice(0, 8)}...`);
    }

    return true;
  }

  getLinkForUser(userSessionId, linkIndex) {
    const linkData = this.getLinksForUser(userSessionId);
    
    if (!linkData || !linkData.links || linkIndex < 0 || linkIndex >= linkData.links.length) {
      return null;
    }

    return linkData.links[linkIndex];
  }

  clearLinksForUser(userSessionId) {
    const removed = this.userLinks.delete(userSessionId);
    if (removed) {
      console.log(`🧹 Cleared links for user: ${userSessionId.slice(0, 8)}...`);
    }
    return removed;
  }

  clearExpiredLinks() {
    let clearedCount = 0;
    for (const [userSessionId, linkData] of this.userLinks.entries()) {
      if (this.isExpired(linkData.timestamp)) {
        this.userLinks.delete(userSessionId);
        clearedCount++;
        console.log(`🧹 Auto-cleared expired links for user: ${userSessionId.slice(0, 8)}...`);
      }
    }
    return clearedCount;
  }

  getUserStatus(userSessionId) {
    const linkData = this.userLinks.get(userSessionId);
    
    if (!linkData) {
      return {
        hasLinks: false,
        linkCount: 0,
        timestamp: null,
        sourceUrl: null,
        isValid: false
      };
    }

    return {
      hasLinks: true,
      linkCount: linkData.links.length,
      timestamp: linkData.timestamp,
      sourceUrl: linkData.sourceUrl,
      isValid: !this.isExpired(linkData.timestamp),
      linksPreview: linkData.links.slice(0, 3).map(link => ({
        text: link.text,
        url: link.url.substring(0, 50) + '...'
      }))
    };
  }

  getSystemStats() {
    return {
      totalUsers: this.userLinks.size,
      totalLinks: Array.from(this.userLinks.values()).reduce((sum, data) => sum + data.links.length, 0),
      oldestTimestamp: Array.from(this.userLinks.values()).reduce((oldest, data) => 
        oldest ? Math.min(oldest, data.timestamp) : data.timestamp, null)
    };
  }

  isExpired(timestamp) {
    return Date.now() - timestamp > this.linkExpiryTime;
  }

  clearAll() {
    const count = this.userLinks.size;
    this.userLinks.clear();
    console.log(`🧹 Cleared all links for ${count} users`);
    return count;
  }
}

class OperationManager {
  constructor() {
    this.chatOperations = new Map();
    this.downloadOperations = new Map();
    this.userOperations = new Map();
    this.globalStop = false;
  }

  createChatOperation(userSessionId, metadata = {}) {
    const operationId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    
    const operation = {
      controller,
      type: 'chat',
      startTime: Date.now(),
      lastActivity: Date.now(), // ✅ NEW: Track last activity
      metadata,
      userSessionId
    };
    
    this.chatOperations.set(operationId, operation);
    
    if (!this.userOperations.has(userSessionId)) {
      this.userOperations.set(userSessionId, new Set());
    }
    this.userOperations.get(userSessionId).add(operationId);
    
    console.log(`🆔 Created chat operation: ${operationId} for user: ${userSessionId.slice(0, 8)}...`);
    return { operationId, signal: controller.signal };
  }

  createDownloadOperation(userSessionId, metadata = {}) {
    const operationId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const controller = new AbortController();
    
    const operation = {
      controller,
      type: 'download',
      startTime: Date.now(),
      lastActivity: Date.now(), // ✅ NEW: Track last activity
      metadata,
      userSessionId
    };
    
    this.downloadOperations.set(operationId, operation);
    
    if (!this.userOperations.has(userSessionId)) {
      this.userOperations.set(userSessionId, new Set());
    }
    this.userOperations.get(userSessionId).add(operationId);
    
    console.log(`🆔 Created download operation: ${operationId} for user: ${userSessionId.slice(0, 8)}...`);
    return { operationId, signal: controller.signal };
  }
  // ✅ NEW: Method to update operation activity
  updateOperationActivity(operationId, activityType = 'progress', additionalData = {}) {
  const chatOp = this.chatOperations.get(operationId);
  const downloadOp = this.downloadOperations.get(operationId);
  
  const operation = chatOp || downloadOp;
  if (operation) {
    operation.lastActivity = Date.now();
    const duration = Date.now() - operation.startTime;
    console.log(`🔄 Activity update for ${operationId.slice(-8)}...: ${activityType} (${Math.floor(duration/1000)}s elapsed)`);
    
    const safeAdditionalData = additionalData || {};
    simpleSSE.sendActivity(operation.userSessionId, operationId, activityType, safeAdditionalData);
    
    return true;
  }
  return false;
}

  // ✅ NEW: Get operation by any ID (helper method)
  getOperation(operationId) {
    return this.chatOperations.get(operationId) || this.downloadOperations.get(operationId);
  }

  // ✅ UPDATED: Activity-based cleanup instead of time-based
  cleanup() {
    const now = Date.now();
    
    // Cleanup chat operations (5 minutes of inactivity)
    for (const [operationId, operation] of this.chatOperations) {
      const lastActivity = operation.lastActivity || operation.startTime;
      if (now - lastActivity > 5 * 60 * 1000) { // 5 minutes inactive
        const totalDuration = Math.floor((now - operation.startTime) / 1000);
        const inactiveDuration = Math.floor((now - lastActivity) / 1000);
        console.log(`🧹 Cleaning up inactive chat operation: ${operationId} (total: ${totalDuration}s, inactive: ${inactiveDuration}s)`);
        this.completeOperation(operationId);
      }
    }
    
    // Cleanup download operations (10 minutes of inactivity)
    for (const [operationId, operation] of this.downloadOperations) {
      const lastActivity = operation.lastActivity || operation.startTime;
      if (now - lastActivity > 10 * 60 * 1000) { // 10 minutes inactive
        const totalDuration = Math.floor((now - operation.startTime) / 1000);
        const inactiveDuration = Math.floor((now - lastActivity) / 1000);
        console.log(`🧹 Cleaning up inactive download operation: ${operationId} (total: ${totalDuration}s, inactive: ${inactiveDuration}s)`);
        this.completeOperation(operationId);
      }
    }
  }

  // ✅ UPDATED: Include activity info in operation status
  getActiveOperations() {
    const now = Date.now();
    const allOps = [
      ...Array.from(this.chatOperations.entries()).map(([id, op]) => ({
        id, 
        type: op.type, 
        duration: now - op.startTime,
        lastActivity: now - (op.lastActivity || op.startTime),
        metadata: op.metadata, 
        userSessionId: op.userSessionId
      })),
      ...Array.from(this.downloadOperations.entries()).map(([id, op]) => ({
        id, 
        type: op.type, 
        duration: now - op.startTime,
        lastActivity: now - (op.lastActivity || op.startTime),
        metadata: op.metadata, 
        userSessionId: op.userSessionId
      }))
    ];
    return allOps;
  }

  stopAllUserOperations(userSessionId) {
  console.log(`⏹️ Stopping ALL operations for user: ${userSessionId.slice(0, 8)}...`);
  
  if (!this.userOperations.has(userSessionId)) {
    console.log(`   - No operations found for user: ${userSessionId.slice(0, 8)}...`);
    return { chatStopped: 0, downloadStopped: 0, totalStopped: 0 };
  }
  
  const userOps = this.userOperations.get(userSessionId);
  let chatStoppedCount = 0;
  let downloadStoppedCount = 0;
  
  for (const operationId of userOps) {
    // Stop chat operations
    const chatOperation = this.chatOperations.get(operationId);
    if (chatOperation && chatOperation.userSessionId === userSessionId) {
      console.log(`   - Stopping chat: ${operationId}`);
      chatOperation.controller.abort();
      this.chatOperations.delete(operationId);
      chatStoppedCount++;
    }
    
    // Stop download operations
    const downloadOperation = this.downloadOperations.get(operationId);
    if (downloadOperation && downloadOperation.userSessionId === userSessionId) {
      console.log(`   - Stopping download: ${operationId}`);
      downloadOperation.controller.abort();
      this.downloadOperations.delete(operationId);
      downloadStoppedCount++;
    }
  }
  
  // Remove user from tracking
  this.userOperations.delete(userSessionId);
  
  return {
    chatStopped: chatStoppedCount,
    downloadStopped: downloadStoppedCount,
    totalStopped: chatStoppedCount + downloadStoppedCount
  };
}

// Keep old method for backward compatibility
stopUserDownloadOperations(userSessionId) {
  const result = this.stopAllUserOperations(userSessionId);
  return result.downloadStopped;
}

  completeOperation(operationId) {
    const chatOp = this.chatOperations.get(operationId);
    const downloadOp = this.downloadOperations.get(operationId);
    
    const operation = chatOp || downloadOp;
    if (operation) {
      const userSessionId = operation.userSessionId;
      
      this.chatOperations.delete(operationId);
      this.downloadOperations.delete(operationId);
      
      if (this.userOperations.has(userSessionId)) {
        this.userOperations.get(userSessionId).delete(operationId);
        
        if (this.userOperations.get(userSessionId).size === 0) {
          this.userOperations.delete(userSessionId);
        }
      }
      
      console.log(`✅ Completed operation: ${operationId} for user: ${userSessionId.slice(0, 8)}...`);
    }
  }

  // ✅ FIX: Properly implement getUserActiveOperations with async scan status
async getUserActiveOperations(userSessionId) {
  if (!this.userOperations.has(userSessionId)) {
    // Still fetch scan status even if no local operations
    const scanStatus = await fetchScanStatus(userSessionId);
    return { 
      chat: 0, 
      download: 0, 
      scan: scanStatus.totalActive || 0, 
      total: scanStatus.totalActive || 0,
      scanDetails: scanStatus.activeScans || []
    };
  }
  
  const userOps = this.userOperations.get(userSessionId);
  let chatCount = 0;
  let downloadCount = 0;
  
  for (const operationId of userOps) {
    if (this.chatOperations.has(operationId)) chatCount++;
    if (this.downloadOperations.has(operationId)) downloadCount++;
  }
  
  // ✅ FIX: Properly await the scan status
  const scanStatus = await fetchScanStatus(userSessionId);
  const scanCount = scanStatus.totalActive || 0;
  
  return {
    chat: chatCount,
    download: downloadCount,
    scan: scanCount,
    total: chatCount + downloadCount + scanCount,
    scanDetails: scanStatus.activeScans || []
  };
}

  isGlobalStop() {
    return this.globalStop;
  }

  stopAllOperations() {
    console.log(`⏹️ SYSTEM-WIDE STOP: Stopping all operations for all users`);
    
    const totalCount = this.chatOperations.size + this.downloadOperations.size;
    
    for (const [id, op] of this.chatOperations) {
      op.controller.abort();
    }
    for (const [id, op] of this.downloadOperations) {
      op.controller.abort();
    }
    
    this.chatOperations.clear();
    this.downloadOperations.clear();
    this.userOperations.clear();
    
    this.globalStop = true;
    setTimeout(() => {
      this.globalStop = false;
      console.log('🔄 System ready for new operations');
    }, 5000);
    
    return totalCount;
  }
}
//  Create instance of the user links manager
const userLinksManager = new UserLinksManager();

const operationManager = new OperationManager();

global.operationManager = operationManager;

// Cleanup stale operations every minute
setInterval(() => operationManager.cleanup(), 60000);

const DOWNLOAD_DIR = path.resolve(__dirname, '../downloads');

// Ensure download directory exists
const fs = require('fs');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  console.log(`✅ Created download directory: ${DOWNLOAD_DIR}`);
}

// 🎯 NEW: Use existing verdict instead of GPT reanalysis
function mapExistingVerdict(scanResult) {
  console.log("🎯 Mapping existing verdict:", scanResult);
  
  // Handle scan failure cases first
  if (!scanResult.success) {
    // Check if it's a "file too big" error (status code 400 or explicit message)
    if (scanResult.error && (
        scanResult.error.includes('File is too big') || 
        scanResult.error.includes('status code 400')
    )) {
      return {
        verdict: "Error",
        explanation: "File is too big. Maximum allowed size is 1GB.",
        guidance: "Please try with a smaller file or contact support for large file scanning."
      };
    }
    
    // Handle other scan errors
    return {
      verdict: "Error",
      explanation: `Scan failed: ${scanResult.error || 'Unknown error occurred during scanning.'}`,
      guidance: "Please try scanning again or contact support if the issue persists."
    };
  }
  
  if (!scanResult.verdict) {
    return {
      verdict: "Unknown",
      explanation: "No verdict available from scan engines.",
      guidance: "Manual review recommended."
    };
  }
  
  const { verdict, validResultCount, maliciousCount, weightedScore } = scanResult.verdict;
  console.log(`The verdict is: ${verdict}`);
  switch (verdict) {
    case 'Safe':
      return {
        verdict: "Safe",
        explanation: `${validResultCount} antivirus engines confirmed the file is clean with no threats detected.`,
        guidance: "File appears safe to download based on multiple engine verification."
      };
      
    case 'Suspicious':
      return {
        verdict: "Suspicious",
        explanation: `Mixed results from ${validResultCount} engines. Proceed with caution.`,
        guidance: "Consider additional verification before downloading this file."
      };
      
    case 'Unsafe','Malicious':
      return {
        verdict: "Unsafe", 
        explanation: `${maliciousCount} engines detected threats out of ${validResultCount} scans.`,
        guidance: "Do not download this file - threats detected by multiple engines."
      };
      
    default:
      return {
        verdict: "Unknown",
        explanation: `Scan completed but verdict unclear. Score: ${weightedScore || 'N/A'}`,
        guidance: "Manual review recommended before downloading."
      };
  }
}

// 📚 Function to generate educational explanations about scan results
async function generateScanExplanation(scanResult, userQuestion) {
  const prompt = `You are a cybersecurity expert explaining file scan results to a user in a BRIEF and CLEAR way.

User question: "${userQuestion}"

Scan data available:
${JSON.stringify(scanResult, null, 2)}

IMPORTANT: Keep your response SHORT and EASY TO UNDERSTAND. Use:
- Simple bullet points or short paragraphs
- Plain language (avoid technical jargon)
- Focus on what matters most to the user
- Maximum 3-4 sentences for the main explanation
- Only include the most important details

Structure your response like this:
1. Quick verdict summary (1 sentence)
2. What the engines found (1-2 sentences)  
3. What this means for the user (1 sentence)
4. Simple recommendation (1 sentence)

Make it conversational and reassuring when appropriate.

ANTIVIRUS KNOWLEDGE: When users ask about antivirus service percentages or comparisons, explain that:
- Our system uses 3 antivirus services: Cloudmersive (37.6%), Bytescale (33.6%), and ClamAV (28.9%)
- These percentages come from weighted scoring across 6 factors:
  * Detection Rate (25% weight) - Most important for finding threats
  * Reliability (20% weight) - Service uptime and consistency  
  * Cost (15% weight) - Pricing and value
  * Response Time (15% weight) - Speed of scan results
  * Feature Set (15% weight) - Available capabilities
  * Integration Complexity (10% weight) - Ease of implementation
- Cloudmersive is recommended due to highest detection rates and reliability
- Each service scored 1-9 on each factor, then weighted to get final percentages
- Higher percentage means better overall performance for file scanning`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userQuestion }
      ]
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating scan explanation:', error.message);
    return "I'd be happy to explain the scan results, but I'm having trouble accessing the analysis right now. The main things to look for are: whether multiple security engines detected threats, the overall verdict (Safe/Suspicious/Unsafe), and any specific recommendations provided.";
  }
}

app.post('/api/clear-chat', (req, res) => {
  const { userSessionId } = req.body;
  
  console.log('🧹 Clearing chat history and user links');
  
  // Clear user-specific links if userSessionId provided
  if (userSessionId) {
    userLinksManager.clearLinksForUser(userSessionId);
  }
  
  res.json({
    success: true,
    reply: 'Chat history and your stored links cleared successfully! You can start fresh now.',
    message: 'Chat cleared'
  });
});

// 📝 Get example URLs endpoint
app.get('/api/example-urls', (req, res) => {
  console.log('📝 Providing example URLs');
  
  const exampleUrls = [
    {
      urls: [
       "https://www.dropbox.com/scl/fi/1blydyiwm2p0crzzmwf8k/rufus-4.7p.exe?rlkey=3kbnx7pf22wkd7r0vnk6gbcnh&e=4&st=wf1u1ea1&dl=0",
        "https://www.nexon.com/maplestory/",
        "https://github.com/vercel/next.js",
        "https://bots.zylongaming.com/index.php?action=downloads",
        "https://mega.nz/file/WkxkAIQK#BXPwgvGzojhF0m3w52_DkAsPFemif25VwlTysUI-ZTQ",
        "https://onedrive.live.com/?redeem=aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9iZTAwMjI3ZTlkMDBkNmM3L0VadnJKNmhLZDBwUGtiVUozR1N4RmNJQjExcWlqcVdlRXVubWJtU2hhLVd3OHc%5FZT1MeFhWMTE&cid=BE00227E9D00D6C7&id=BE00227E9D00D6C7%21sa827eb9b774a4f4a91b509dc64b115c2&parId=root&o=OneUp"
      ]
    }
  ];
  
  res.json({
    success: true,
    examples: exampleUrls,
    message: 'Here are some example URLs you can try'
  });
});

// New endpoint for stopping only user's downloads
app.post('/api/stop-downloads', (req, res) => {
  const { userSessionId } = req.body;
  
  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId',
      message: 'User session ID is required for operation cancellation'
    });
  }
  
  console.log(`⏹️ Stop downloads requested for user: ${userSessionId.slice(0, 8)}...`);
  
  try {
  const result = operationManager.stopAllUserOperations(userSessionId);
  
  const message = result.totalStopped > 0 
    ? `Stopped ${result.totalStopped} operation(s): ${result.chatStopped} chat + ${result.downloadStopped} downloads. Other users unaffected.`
    : 'No active operations to stop for your session.';
  
  res.json({
    success: true,
    message: message,
    stoppedOperations: result.totalStopped,
    chatOperations: result.chatStopped,
    downloadOperations: result.downloadStopped,
    userSessionId
  });
  
} catch (error) {
  console.error('❌ Error stopping user operations:', error);
  res.status(500).json({
    success: false,
    error: 'Failed to stop operations',
    message: error.message
  });
}
});

// ⏹️ Stop processing endpoint
app.post('/api/stop-processing', (req, res) => {
  console.log('⏹️ Stop processing requested');
  
  try {
    // Stop all active operations
    const stoppedCount = operationManager.stopAllOperations();
    
    // Clear any ongoing global state
    globalLinks = [];
    
    const message = stoppedCount > 0 
      ? `Successfully stopped ${stoppedCount} active operation(s). All downloads, scans, and AI processing have been cancelled.`
      : 'No active operations found. System is ready for new requests.';
    
    res.json({
      success: true,
      reply: `⏹️ ${message}`,
      stoppedOperations: stoppedCount,
      message: 'All operations stopped'
    });
    
  } catch (error) {
    console.error('❌ Error stopping operations:', error);
    res.status(500).json({
      success: false,
      reply: '❌ Error occurred while stopping operations. Please try again.',
      error: error.message
    });
  }
});
// Enhanced status endpoint
app.get('/api/status', (req, res) => {
  const activeOps = operationManager.getActiveOperations();
  res.json({
    success: true,
    globalStop: operationManager.isGlobalStop(),
    activeOperations: activeOps,
    totalActive: activeOps.length
  });
});

app.get('/api/user-status', async (req, res) => {
  const { userSessionId } = req.query;

  if (!userSessionId) {
    return res.status(400).json({ success: false, error: 'Missing userSessionId' });
  }

  try {
    const localOps = await operationManager.getUserActiveOperations(userSessionId); // ✅ ADD: await

    res.json({
      success: true,
      userSessionId,
      chat: localOps.chat,
      download: localOps.download,
      scan: localOps.scan,
      total: localOps.total,
      globalStop: operationManager.isGlobalStop(),
      scanDetails: localOps.scanDetails || []
    });
  } catch (error) {
    console.error('❌ Error fetching user status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user status',
      message: error.message
    });
  }
});

app.post('/api/chat', async (req, res) => {
  const { message, lastScanResult, userSessionId } = req.body;

  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId',
      message: 'User session ID is required'
    });
  }

  // Check if system is in global stop mode
  if (operationManager.isGlobalStop()) {
    return res.json({
      reply: '⏹️ System is currently stopping all operations. Please wait a moment and try again.',
      result: { success: false, error: 'System stopping' }
    });
  }

  const { operationId, signal } = operationManager.createChatOperation(userSessionId, { message });
  operationManager.updateOperationActivity(operationId, 'analyzing_message');
  
  try {

    if (signal.aborted) {
    operationManager.completeOperation(operationId);
    return res.json({
      reply: '⏹️ Operation was cancelled before processing could begin.',
      result: { success: false, error: 'Cancelled' },
      operationCompleted: true
    });
  }

    // Step 1: Use GPT to understand user intent
    const systemPrompt = `You are "SafeDLBuddy", a helpful assistant that provides real-time AI-based file scanning for safer downloads. You:
    
1. **URL Detection**: If a user provides a download page URL, respond ONLY with: {"action": "scan", "url": "<the url>"}

2. **Security Explanation**: If a user asks about scan results, security analysis, or wants explanations about file safety, provide helpful explanations about:
   - What the scan results mean
   - How different antivirus engines work
   - What AI analysis verdicts mean (Safe/Suspicious/Unsafe/Unknown)
   - File security best practices
   - How to interpret weighted scores, valid results, and malicious indicators

3. **Antivirus Comparison Knowledge**: When users ask about antivirus service percentages or comparisons, explain that:
   - Our system uses 3 antivirus services: Cloudmersive (37.6%), Bytescale (33.6%), and ClamAV (28.9%)
   - These percentages come from weighted scoring across 6 factors:
     * Detection Rate (25% weight) - Most important for finding threats
     * Reliability (20% weight) - Service uptime and consistency  
     * Cost (15% weight) - Pricing and value
     * Response Time (15% weight) - Speed of scan results
     * Feature Set (15% weight) - Available capabilities
     * Integration Complexity (10% weight) - Ease of implementation
   - Cloudmersive is recommended due to highest detection rates and reliability
   - Each service scored 1-9 on each factor, then weighted to get final percentages
   - Higher percentage means better overall performance for file scanning

4. **General Help**: Answer questions about file downloads, security, and provide guidance.

5. **Context Awareness**: If the user has recent scan results, reference them in your explanations.

Always be helpful, informative, and focused on file security and downloads. Keep explanations brief and user-friendly.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    // Add context about recent scan results if available
    if (lastScanResult && lastScanResult.scan_result) {
      const contextMessage = `Recent scan context: File "${lastScanResult.filename}" was scanned with results: ${JSON.stringify(lastScanResult.scan_result, null, 2)}`;
      messages.splice(1, 0, { role: 'system', content: contextMessage });
    }
    // Check for abort before making OpenAI call
if (signal.aborted) {
  operationManager.completeOperation(operationId);
  return res.json({
    reply: '⏹️ Operation was cancelled before processing could begin.',
    result: { success: false, error: 'Cancelled' }
  });
}

    operationManager.updateOperationActivity(operationId, 'calling_openai');
    const chatCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages
      }, {
      signal: signal
    });
    // Check if aborted after OpenAI call
    if (signal.aborted) {
      operationManager.completeOperation(operationId);
      return res.json({
        reply: '⏹️ Chat processing was cancelled.',
        result: { success: false, error: 'Cancelled' },
        operationCompleted: true
      });
    }

    operationManager.updateOperationActivity(operationId, 'openai_response_received');
    const assistantMessage = chatCompletion.choices[0].message.content;
    console.log("assistantMessage: ", assistantMessage);
    
    // Check if this is a request for explanation about recent scan results
    const isExplanationRequest = /explain|what does|what do|mean|interpret|understand|results|analysis|verdict|safe|dangerous|malicious|percentage|comparison|why|how.*calculate|score/i.test(message);
    
    if (isExplanationRequest && lastScanResult && lastScanResult.scan_result) {
      console.log("🧠 Generating detailed scan explanation");
      try {
        operationManager.updateOperationActivity(operationId, 'generating_explanation');
        const detailedExplanation = await generateScanExplanation(lastScanResult.scan_result, message);
        operationManager.completeOperation(operationId);
        return res.json({ 
          reply: detailedExplanation,
          result: {
            success: true,
            type: 'explanation',
            referencedScan: lastScanResult.filename
          }
        });
      } catch (explanationError) {
        console.error('Error generating explanation:', explanationError);
        // Fall through to normal chat response
      }
    }
    
    try {
      const parsed = JSON.parse(assistantMessage);
      console.log("parsed: ", parsed);
      
      if (parsed.action === 'scan' && parsed.url) {
        console.log("parsed.url: ", parsed.url);
        
        // Step 2: Trigger the file handler
        try {
        // Create separate DOWNLOAD operation for this specific user
        const { operationId: downloadId, signal: downloadSignal } = 
        operationManager.createDownloadOperation(userSessionId, { url: parsed.url });

        operationManager.updateOperationActivity(operationId, 'Processing file');
        const result = await handleURL(parsed.url, false, downloadSignal, userSessionId, downloadId);
        console.log(`⬇️ Processing URL for user: ${userSessionId.slice(0, 8)}...`);

        operationManager.completeOperation(downloadId);

          console.log("result:" ,result.message);
          if(result.message === 'Could not download the file. Please try another link'){
            console.log("I am here");
          }

          console.log("File handler result:", result);
          
          // Check if result exists
          if (!result) {
            operationManager.completeOperation(operationId);
            return res.json({ 
              reply: 'Error: No result returned from the file handler.' 
            });
          }
          
          // Handle multiple links case
          if (result.multiple && result.links) {
            // Store the links globally for later selection
            const linkData = userLinksManager.storeLinksForUser(userSessionId, result.links, parsed.url);

            operationManager.completeOperation(operationId);
            
             return res.json({ 
              reply: `Found ${result.links.length} download links. Please select one to download:`,
              result: {
                ...result,
                originalUrl: parsed.url,
                timestamp: linkData.timestamp,
                userSpecific: true
              },
              operationCompleted: true
            });
          }

          // Handle single href case - download immediately and add AI analysis
          if(result.single){
            const scanResult = await handleURL(result.url, false, signal, userSessionId);

             // Check if the single URL actually found multiple links
          if (scanResult && scanResult.multiple && scanResult.links) {
            // Store the newly found links for this user
            const linkData = userLinksManager.storeLinksForUser(userSessionId, scanResult.links, scanResult.url || result.url);
            
            operationManager.completeOperation(operationId);
            return res.json({ 
              reply: `Found ${scanResult.links.length} download links. Please select one to download:`,
              result: {
                ...scanResult,
                originalUrl: scanResult.url || result.url,
                timestamp: linkData.timestamp,
                userSpecific: true
              },
              operationCompleted: true
            });
          }
            
            // 🎯 FIXED: Use existing verdict instead of GPT analysis - handle both success and error cases
            if (scanResult && scanResult.scan_result) {
              console.log("🔍 Raw scan results (single download):", JSON.stringify(scanResult.scan_result, null, 2));
              try {
                const aiVerdict = mapExistingVerdict(scanResult.scan_result);
                scanResult.scan_result.ai_verdict = aiVerdict.verdict;
                scanResult.scan_result.ai_explanation = aiVerdict.explanation;
                scanResult.scan_result.ai_guidance = aiVerdict.guidance;
                console.log("🎯 Verdict mapping complete:", aiVerdict);
              } catch (e) {
                console.error("Error mapping verdict (single):", e.message);
              }
            }
            operationManager.completeOperation(operationId);
            return res.json({
              reply: scanResult.message || 'Download and scan complete.',
              result: scanResult,
              operationCompleted: true 
            });
          }

          // Handle error cases
          if (!result.success) {
            operationManager.completeOperation(operationId);
            return res.json({ 
              reply: result.message || 'Error processing the URL.',
              result: result,
              operationCompleted: true
            });
          }
          
          // Handle successful download with scan and AI analysis - handle both success and error cases
          if (result.path && result.filename && result.scan_result) {
            try {
              operationManager.updateOperationActivity(operationId, 'mapping_ai_verdict');
              const aiVerdict = mapExistingVerdict(result.scan_result);
              result.scan_result.ai_verdict = aiVerdict.verdict;
              result.scan_result.ai_explanation = aiVerdict.explanation;
              result.scan_result.ai_guidance = aiVerdict.guidance;
              console.log("🎯 Verdict mapping complete:", aiVerdict);
            } catch (e) {
              console.error("Error mapping verdict:", e.message);
            }
            
            let replyMessage = `Successfully downloaded: ${result.filename}`;
            
            // Add scan result info if available
            if (result.scan_result) {
              if (result.scan_result.success) {
                replyMessage += `. Scan completed successfully.`;
                if (result.scan_result.ai_verdict) {
                  replyMessage += ` AI Analysis: ${result.scan_result.ai_verdict}`;
                }
              } else {
                replyMessage += `. ${result.scan_result.ai_explanation || result.scan_result.error || 'Scan completed with issues'}`;
              }
            }
            operationManager.completeOperation(operationId);
            return res.json({ 
              reply: replyMessage,
              result: result,
              operationCompleted: true 
            });
          }
          
          operationManager.completeOperation(operationId);
          // Generic success case
          return res.json({ 
            reply: result.message || 'Successfully processed the URL.',
            result: result,
            operationCompleted: true 
          });
        } catch (handlerError) {
          console.error('Error in file handler:', handlerError);
  
          // Handle download cancellation gracefully
          if (handlerError.message.includes('cancelled') || downloadSignal?.aborted) {
            operationManager.completeOperation(operationId);
            return res.json({ 
              reply: '⏹️ Your download was cancelled. Other users unaffected. You can continue chatting or try another link.',
              result: { success: false, error: 'Download cancelled' },
              operationCompleted: true 
            });
          }
          
          operationManager.completeOperation(operationId);
          return res.json({ 
            reply: `Error processing the URL: ${handlerError.message}`,
            result: {
              success: false,
              error: handlerError.message
            },
            operationCompleted: true
          });
        }
      }
    } catch (jsonError) {
      // Not a structured JSON response - just chat
      console.log('Not a scan action, continuing with normal chat');
    }
    
    operationManager.updateOperationActivity(operationId, 'chat_response_ready');
    operationManager.completeOperation(operationId);
    res.json({ reply: assistantMessage ,
      operationCompleted: true
    });
  } catch (error) {
   operationManager.completeOperation(operationId);
  
  // Add this cancellation check
  if (error.name === 'AbortError' || signal.aborted || error.message.includes('cancelled')) {
    console.log('⏹️ Chat operation was cancelled');
    return res.json({
      reply: '⏹️ Operation was cancelled.',
      result: { success: false, error: 'Cancelled' },
      operationCompleted: true 
    });
  }
    console.error('GPT or Handler Error:', error.message);
    res.status(500).json({ 
      reply: 'Something went wrong with processing your request.',
      result: {
        success: false,
        error: error.message
      },
      operationCompleted: true
    });
  }
});

// Add a custom endpoint to choose a specific link from href_handler results
app.post('/api/select-link', async (req, res) => {
  const { linkIndex , userSessionId } = req.body;

  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId',
      message: 'User session ID is required'
    });
  }

  // Check if system is in global stop mode
  if (operationManager.isGlobalStop()) {
    return res.json({
      reply: '⏹️ System is currently stopping all operations. Please wait a moment and try again.',
      success: false
    });
  }

   // ✅ FIX 1: Create operation IMMEDIATELY and send initial activity
  const { operationId, signal } = operationManager.createDownloadOperation(userSessionId, { linkIndex });
  
  // ✅ FIX 2: Send immediate activity update so frontend knows operation started
  operationManager.updateOperationActivity(operationId, 'link_selection_started', {
    linkIndex: linkIndex + 1,
    status: 'starting'
  });

  console.log(`💬 Received request to select link #${linkIndex+1} for user: ${userSessionId.slice(0, 8)}...`);
  
  if (linkIndex === undefined) {
  console.error(`❌ Missing link index for user: ${userSessionId.slice(0, 8)}...`);
  operationManager.completeOperation(operationId);
  return res.status(400).json({
    reply: 'Error: Missing link index.',
    success: false
  });
}

// Check if user has valid links
if (!userLinksManager.areLinksValidForUser(userSessionId)) {
  console.error(`❌ No valid links available for user: ${userSessionId.slice(0, 8)}...`);
  operationManager.completeOperation(operationId);
  return res.status(400).json({
    reply: 'Error: No valid links available or your links have expired. Please generate new links first.',
    success: false
  });
}

// Get user's specific link
const selectedLink = userLinksManager.getLinkForUser(userSessionId, linkIndex);

if (!selectedLink) {
  const userStatus = userLinksManager.getUserStatus(userSessionId);
  console.error(`❌ Invalid link index ${linkIndex+1} for user: ${userSessionId.slice(0, 8)}... (has ${userStatus.linkCount} links)`);
  operationManager.completeOperation(operationId);
  return res.status(400).json({
    reply: `Error: Invalid link selection. Please choose a number between 1 and ${userStatus.linkCount}.`,
    success: false
  });
}

  // Add this after your existing linkIndex validation
if (signal.aborted) {
  operationManager.completeOperation(operationId);
  return res.json({
    reply: '⏹️ Operation was cancelled before processing could begin.',
    result: { success: false, error: 'Cancelled' }
  });
}
  
  try {
    console.log(`🎯 Selected link #${linkIndex+1}:`, selectedLink);
    console.log(`🔗 Target URL for download: ${selectedLink.url}`);

    // ✅ FIX 3: Update activity with selected link details
    operationManager.updateOperationActivity(operationId, 'processing_selected_link', {
      linkText: selectedLink.text,
      linkUrl: selectedLink.url.substring(0, 100), // Truncate for display
      linkIndex: linkIndex + 1
    });
    
    // Call downloadFile with the required parameters
    console.log(`⬇️ Sending selected URL to file handler for download: ${selectedLink.url}`);
    
    // Try direct download with proper download directory parameter
    let scanResult = await handleURL(selectedLink.url, false, signal, userSessionId, operationId);
    console.log(`⬇️ Processing URL for user: ${userSessionId.slice(0, 8)}...`);
    if (signal.aborted) {
  operationManager.completeOperation(operationId);
  return res.json({
    reply: '⏹️ Link processing was cancelled.',
    result: { success: false, error: 'Cancelled' }
  });
}
    
    console.log("📊 Scan result:", scanResult);
    
    if (!scanResult) {
      console.error('❌ File handler returned no result');
      operationManager.completeOperation(operationId);
      return res.json({
        reply: `Error downloading the selected link: No result returned from file handler`,
        success: false ,
        operationCompleted: true
      });
    }
    
    if (!scanResult.success) {
      console.error('❌ File handler returned error:', scanResult.error || 'Unknown error');
      operationManager.completeOperation(operationId);
      return res.json({
        reply: scanResult?.message || `Error downloading or scanning the selected link: ${selectedLink.text || selectedLink.url}`,
        result: scanResult || { success: false, error: 'Unknown error' },
        operationCompleted: true 
      });
    }

    // 🎯 FIXED: Use existing verdict instead of GPT analysis - handle both success and error cases
    if (scanResult.scan_result) {
      console.log("🔍 Raw scan results (selected link):", JSON.stringify(scanResult.scan_result, null, 2));
      try {
        operationManager.updateOperationActivity(operationId, 'mapping_selected_link_verdict');
        const aiVerdict = mapExistingVerdict(scanResult.scan_result);
        scanResult.scan_result.ai_verdict = aiVerdict.verdict;
        scanResult.scan_result.ai_explanation = aiVerdict.explanation;
        scanResult.scan_result.ai_guidance = aiVerdict.guidance;
        console.log("🎯 Verdict mapping complete:", aiVerdict);
      } catch (e) {
        console.error("Error mapping verdict (selected link):", e.message);
      }
    }
        
    if (scanResult.scan_result) {
      console.log(`🔍 Scan results:`, {
        success: scanResult.scan_result.success,
        verdict: scanResult.scan_result.verdict,
        ai_verdict: scanResult.scan_result.ai_verdict
      });
    }
    
    let replyMessage = `Successfully downloaded and scanned: ${scanResult.filename || 'file'}`;
    if (scanResult.scan_result?.ai_verdict) {
      replyMessage += ` - AI Analysis: ${scanResult.scan_result.ai_verdict}`;
    }
    operationManager.completeOperation(operationId);
    return res.json({
      reply: replyMessage,
      result: scanResult,
      operationCompleted: true 
    });
  } catch (error) {
    operationManager.completeOperation(operationId);
  
  if (error.name === 'AbortError' || signal.aborted || error.message.includes('cancelled')) {
  console.log('⏹️ Link download operation was cancelled');
  return res.json({
    reply: '⏹️ Download was cancelled. You can continue chatting or select another link.',
    result: { success: false, error: 'Download cancelled' },
    operationCompleted: true 
  });
}
    console.error('❌ Error selecting link:', error);
    return res.status(500).json({
      reply: `Error selecting and downloading the link: ${error.message}`,
      result: {
        success: false,
        error: error.message
      },
      operationCompleted: true
    });
  } 
});

// New endpoint to check user's specific operation status
app.get('/api/user-status/:userSessionId', (req, res) => {
  const { userSessionId } = req.params;
  
  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId'
    });
  }
  
  const operations = operationManager.getUserActiveOperations(userSessionId);
  
  res.json({
    success: true,
    userSessionId,
    activeOperations: operations,
    globalStop: operationManager.isGlobalStop(),
    totalSystemOperations: operationManager.chatOperations.size + operationManager.downloadOperations.size + operations.scan
  });
});

// 🆕 NEW: User-specific links status endpoint
app.get('/api/user-links-status/:userSessionId', (req, res) => {
  const { userSessionId } = req.params;
  
  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId'
    });
  }
  
  const userStatus = userLinksManager.getUserStatus(userSessionId);
  
  res.json({
    success: true,
    userSessionId,
    ...userStatus
  });
});

// 🆕 NEW: Clear user-specific links
app.post('/api/clear-user-links', (req, res) => {
  const { userSessionId } = req.body;
  
  if (!userSessionId) {
    return res.status(400).json({
      success: false,
      error: 'Missing userSessionId'
    });
  }
  
  const cleared = userLinksManager.clearLinksForUser(userSessionId);
  
  res.json({
    success: true,
    message: cleared ? 'Your stored links cleared successfully' : 'No links to clear',
    cleared
  });
});

// 🆕 NEW: Admin endpoint for system stats
app.get('/api/admin/links-stats', (req, res) => {
  const stats = userLinksManager.getSystemStats();
  
  res.json({
    success: true,
    ...stats,
    activeUsers: Array.from(userLinksManager.userLinks.keys()).map(id => id.slice(0, 8) + '...')
  });
});

// 🆕 NEW: Cleanup expired links every 10 minutes
setInterval(() => {
  const clearedCount = userLinksManager.clearExpiredLinks();
  if (clearedCount > 0) {
    console.log(`🧹 Auto-cleanup: Removed expired links for ${clearedCount} users`);
  }
}, 10 * 60 * 1000); // 10 minutes

app.get('/api/events/:userSessionId', (req, res) => {
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
  simpleSSE.addConnection(userSessionId, res);
  
  // Handle client disconnect
  req.on('close', () => simpleSSE.removeConnection(userSessionId));
  req.on('error', () => simpleSSE.removeConnection(userSessionId));
  
  // Send keepalive every 30 seconds
  const keepAlive = setInterval(() => {
    try {
      res.write(`data: ${JSON.stringify({ type: 'keepalive', timestamp: Date.now() })}\n\n`);
    } catch (error) {
      clearInterval(keepAlive);
      simpleSSE.removeConnection(userSessionId);
    }
  }, 30000);
  
  // Clean up on disconnect
  req.on('close', () => clearInterval(keepAlive));
});

app.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));