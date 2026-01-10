const psl = require('psl');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { chromium } = require('playwright');
const {zipFolder} = require("./zip_folder_handler.js");
require('dotenv').config();

// Import handlers
const { handleGoogleDriveDownload } = require('./google_drive_handling.js');
const { handleDropboxDownload } = require('./dropbox_handling.js');
const { handleGithubDownload } = require('./github_handling.js');
const { handleMegaNZDownload } = require('./mega_nz_handling.js');
const { handleOneDriveDownload } = require('./OneDrive_handling.js');
const { handleGeneralURLDownload } = require('./general_handler.js');
const { handleHrefDownload } = require('./href_handling.js');
const scanurl = process.env.SCAN_URL;
console.log('🔍 SCAN_URL loaded as:', scanurl);

// IMPROVED: Faster timeout for testing scenarios
const NETWORK_TIMEOUT = 15000; // 15 seconds instead of 30
const BROWSER_TIMEOUT = 10000;  // 10 seconds for browser operations

function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
}
// IMPROVED: Quick HTTP status check function
async function quickHttpCheck(url, signal) {
  try {
    console.log(`🔍 Quick HTTP check for: ${url}`);
    const response = await axios.head(url, { 
      timeout: 5000,  // Only 5 seconds for quick check
      validateStatus: () => true,  // Don't throw on 4xx/5xx
      signal: signal
    });
    
    const status = response.status;
    console.log(`📊 HTTP Status: ${status}`);
    
    // Return early for obvious non-download URLs
    if (status >= 400) {
      return {
        success: false,
        error: `HTTP ${status}`,
        message: `Server returned HTTP ${status} error`,
        quickFail: true  // Flag to skip other methods
      };
    }
    
    return { success: true, status };
  } catch (error) {
    console.log(`⚠️ Quick check failed: ${error.message}`);
    
    // Check for network-level errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: "Network error",
        message: "Cannot reach the specified domain",
        quickFail: true
      };
    }
    
    if (error.message.includes('timeout')) {
      return {
        success: false,
        error: "Timeout",
        message: "Connection timed out",
        quickFail: true
      };
    }
    
    // For other errors, allow fallback methods
    return { success: false, allowFallback: true };
  }
}

/**
 * Downloads a file directly from a URL and sends it to the scanner
 * @param {string} urlString - URL to download from
 * @param {string} DOWNLOAD_DIR - Directory to save downloaded files
 * @returns {Promise<Object|null>} - Object with download and scan results or null on failure
 */

async function downloadFile(urlString, DOWNLOAD_DIR, signal = null, updateActivity = null, operationId = null) {
  let result = null;
  let browser = null;
  console.log('🔍 SCAN_URL loaded as:', scanurl);

  if (signal?.aborted) {
  throw new Error('Operation cancelled before starting');
}

  try {
    if (signal?.aborted) {
  throw new Error('Operation cancelled before starting');
}
    browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Better Docker compatibility
    });
  
    const context = await browser.newContext({ 
      acceptDownloads: true,
      extraHTTPHeaders: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
  
    const page = await context.newPage();

    console.log(`🚀 Starting download from: ${urlString}`);

     // IMPROVED: Set shorter timeouts for testing
     page.setDefaultTimeout(BROWSER_TIMEOUT);
     page.setDefaultNavigationTimeout(BROWSER_TIMEOUT);

     if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
    // Method 1: Try direct navigation first (works for text files and images)
    try {
      if (updateActivity) updateActivity('browser_navigation_start');
      const response = await page.goto(urlString, { 
        waitUntil: 'networkidle',
        timeout: BROWSER_TIMEOUT 
      });

      if (response && response.ok()) {
        const contentType = response.headers()['content-type'] || '';
        const contentDisposition = response.headers()['content-disposition'] || '';
        
        console.log(`📄 Content-Type: ${contentType}`);
        console.log(`📎 Content-Disposition: ${contentDisposition}`);

        // For text files, images, and other content that browsers display
        if (contentType.includes('text/') || contentType.includes('image/') || 
            contentType.includes('application/') || contentDisposition.includes('attachment')) {
          
          // Extract filename from URL or Content-Disposition
          let filename = '';
          
          if (contentDisposition && contentDisposition.includes('filename=')) {
            const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (matches && matches[1]) {
              filename = matches[1].replace(/['"]/g, '');
            }
          }
          
          if (!filename) {
            filename = path.basename(new URL(urlString).pathname) || 'downloaded_file';
            
            // Add extension based on content type if missing
            if (!path.extname(filename)) {
              if (contentType.includes('text/plain')) filename += '.txt';
              else if (contentType.includes('image/png')) filename += '.png';
              else if (contentType.includes('image/jpeg')) filename += '.jpg';
              else if (contentType.includes('image/gif')) filename += '.gif';
              else if (contentType.includes('application/pdf')) filename += '.pdf';
            }
          }

          const filePath = path.join(DOWNLOAD_DIR, filename);
          
          // Get the file content as buffer
          const buffer = await response.body();
          if (buffer) {
            fs.writeFileSync(filePath, buffer);
            console.log(`✅ File saved to: ${filePath}`);
            if (updateActivity) updateActivity('browser_download_complete');
            
            result = { path: filePath, filename, success: true };
            return result;
          }
        }
      }
    } catch (navError) {
      console.log('⚠️ Direct navigation method failed:', navError.message);
    }

    if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
    // Method 2: Try download event trigger (for files that actually trigger downloads)
    try {
      console.log('🔄 Trying download event method...');
      
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }); // Shorter timeout

      await page.evaluate(url => {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, urlString);

      const download = await downloadPromise;

      if (download) {
  const filename = download.suggestedFilename() || `download_${Date.now()}`;
  const filePath = path.join(DOWNLOAD_DIR, filename);
  
  console.log(`📥 Browser download started: ${filename}`);
  
  if (updateActivity) {
    updateActivity('browser_download_started', { filename });
  }

  // Add progress monitoring
  const downloadStartTime = Date.now();
  let lastSize = 0;
  
  const progressInterval = setInterval(async () => {
    if (signal?.aborted) {
      clearInterval(progressInterval);
      return;
    }
    
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const currentSize = stats.size;
        const sizeMB = (currentSize / 1024 / 1024).toFixed(1);
        const elapsed = Math.floor((Date.now() - downloadStartTime) / 1000);
        const speed = formatSpeed(currentSize - lastSize);
        
        console.log(`📥 Browser Download: ${sizeMB} MB downloaded (${speed}) - ${elapsed}s`);
        
        if (updateActivity) {
          updateActivity('browser_downloading', {
            downloaded: sizeMB,
            downloadedFormatted: `${sizeMB} MB`,
            speed: speed,
            elapsed: elapsed,
            filename: filename
          });
        }
        
        lastSize = currentSize;
      }
    } catch (err) {
      // File might not exist yet
    }
  }, 1000);

  try {
    await download.saveAs(filePath);
    
    // Clear progress monitoring
    clearInterval(progressInterval);
    
    // Get final stats
    const finalStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    const finalSizeMB = finalStats ? (finalStats.size / 1024 / 1024).toFixed(1) : 'unknown';
    const totalTime = ((Date.now() - downloadStartTime) / 1000).toFixed(1);
    
    console.log(`✅ Browser download completed: ${filename} (${finalSizeMB} MB in ${totalTime}s)`);
    
    if (updateActivity) {
      updateActivity('browser_download_complete', {
        filename: filename,
        size: finalStats?.size || 0,
        sizeFormatted: `${finalSizeMB} MB`,
        duration: `${totalTime}s`,
        percentage: 100
      });
    }

    result = { path: filePath, filename, success: true };
    return result;
    
  } catch (downloadError) {
    clearInterval(progressInterval);
    
    if (signal?.aborted || downloadError.message.includes('cancelled')) {
      console.log('⏹️ Browser download was cancelled');
      return { success: false, cancelled: true };
    } else {
      console.error('❌ Browser download save error:', downloadError.message);
      throw downloadError;
    }
  }
}
    } catch (downloadError) {
      console.log('⚠️ Download event method failed:', downloadError.message);
    }

    console.log('❌ All browser methods failed');
    return null;

  } catch (error) {
    if (error.message.includes('cancelled') || signal?.aborted) {
    console.log('⏹️ Download operation was cancelled');
    throw new Error('Operation cancelled');
  }
    console.error('❌ Browser download failed:', error.message);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function downloadFileWithAxios(urlString, DOWNLOAD_DIR, signal = null, updateActivity = null, operationId = null) {
  try {
    console.log(`🚀 Downloading with Axios: ${urlString}`);
    if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
    
    if (updateActivity) updateActivity('axios_download_start');
    let startTime = Date.now();
    let lastTime = startTime;
    let lastLoaded = 0;
    const response = await axios({
      method: 'GET',
      url: urlString,
      responseType: 'arraybuffer', // Changed from 'stream' to 'arraybuffer'
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: NETWORK_TIMEOUT , // Use configurable timeout
      signal: signal,
     // 🆕 ADD: Progress tracking
  onDownloadProgress: (progressEvent) => {
  if (signal?.aborted) {
    throw new Error('Download cancelled by user');
  }
  
  const currentTime = Date.now();
  const downloadedBytes = progressEvent.loaded;
  const totalBytes = progressEvent.total || 0;
  
  // Calculate speed every 500ms
  let speed = '';
  if (currentTime - lastTime >= 500) {
    const timeDiff = (currentTime - lastTime) / 1000;
    const bytesDiff = downloadedBytes - lastLoaded;
    const bytesPerSecond = bytesDiff / timeDiff;
    speed = formatSpeed(bytesPerSecond);
    lastTime = currentTime;
    lastLoaded = downloadedBytes;
  }
  
  const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
  const loadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
  const totalMB = totalBytes ? (totalBytes / 1024 / 1024).toFixed(1) : null;
  
  if (totalBytes > 0) {
    const percent = Math.round((downloadedBytes * 100) / totalBytes);
    
    const progressData = {
      percent: percent,
      loaded: loadedMB,
      total: totalMB,
      downloadedFormatted: `${loadedMB} MB`,
      totalFormatted: `${totalMB} MB`,
      speed: speed,
      elapsed: elapsedSeconds
    };
    
    if (percent % 5 === 0 || percent === 100) {
      console.log(`📥 Direct Download: ${percent}% (${loadedMB}/${totalMB} MB) - ${speed}`);
    }
    
    if (updateActivity) {
      updateActivity('axios_downloading', progressData);
    }
  } else {
    const progressData = {
      loaded: loadedMB,
      downloadedFormatted: `${loadedMB} MB`,
      speed: speed,
      elapsed: elapsedSeconds
    };
    
    if (updateActivity) {
      updateActivity('axios_downloading_unknown_size', progressData);
    }
  }
}
    });
    if (updateActivity) updateActivity('axios_download_complete');

    // Extract filename from URL or headers
    let filename = '';
    const contentDisposition = response.headers['content-disposition'];
    
    if (contentDisposition && contentDisposition.includes('filename=')) {
      const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (matches && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }
    
    if (!filename) {
      filename = path.basename(new URL(urlString).pathname) || 'downloaded_file';
      
      // Add extension based on content type
      const contentType = response.headers['content-type'] || '';
      if (!path.extname(filename)) {
        if (contentType.includes('text/plain')) filename += '.txt';
        else if (contentType.includes('image/png')) filename += '.png';
        else if (contentType.includes('image/jpeg')) filename += '.jpg';
        else if (contentType.includes('image/gif')) filename += '.gif';
        else if (contentType.includes('application/pdf')) filename += '.pdf';
        else if (contentType.includes('application/zip')) filename += '.zip';
      }
    }

    const filePath = path.join(DOWNLOAD_DIR, filename);
    
    if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
    // Write the buffer directly to file
    fs.writeFileSync(filePath, response.data);
    
    console.log(`✅ File saved to: ${filePath}`);
    
    const result = { path: filePath, filename, success: true };
    
    return result;

  } catch (error) {
     if (error.name === 'AbortError' || signal?.aborted || error.message.includes('cancelled')) {
    throw new Error('Operation cancelled');
  }
    console.error('❌ Axios download failed:', error.message);
    throw error;
  }
}

async function deleteFile(filePath) {
  try {
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Delete directory and all its contents
      fs.rmSync(filePath, { recursive: true, force: true });
      console.log("🗑️ Directory deleted from file_handler!.");
    } else {
      // Delete regular file
      fs.unlinkSync(filePath);
      console.log("🗑️ File deleted from file_handler!.");
    }
  } catch (err) {
    console.warn('⚠️ Failed to delete from file_handler!:', err.message);
  }
}

async function sendFileToScanner(filePath, filename, signal = null, userSessionId = null, updateActivity = null) {
  console.log("👤 User Session ID:", userSessionId?.slice(0, 8) + "...");
  if (signal?.aborted) {
  throw new Error('Operation cancelled before scan');
}
  console.log("🚀 Uploading to /scan:", filename);
  console.log("file path: ",filePath);
  const stats = fs.statSync(filePath);
  let fileToSend = filePath;
  
  // It's a folder? → zip it
   if (stats.isDirectory()) {
    const zipName =`${filename}.zip`;
    const zipPath = path.join(__dirname, 'downloads', zipName);
    await zipFolder(filePath, zipPath);
    fileToSend = zipPath;
    filename = zipName;
    try{
       fs.rmSync(filePath, { recursive: true, force: true });

    }catch(err){
      console.log("Couldn't delete the folder after zip");
  }

  }
  

  const form = new FormData();
  form.append('file', fs.createReadStream(fileToSend), filename);
  if (userSessionId) {
    form.append('userSessionId', userSessionId);
  }

  if (signal?.aborted) {
  throw new Error('Operation cancelled before upload');
}
  try {
    console.log('Hitting:', scanurl);
    if (updateActivity) updateActivity('uploading_to_scanner');
    const response = await axios.post(`${scanurl}/scan`, form, {
      headers: form.getHeaders(),
      timeout: 1800000, 
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      signal: signal 
    });
    //const response = await scanTheFile(filePath);

    console.log('✅ File sent to scanner:', response.data);
    if (updateActivity) updateActivity('scan_response_received');
    // delete file 
    deleteFile(fileToSend);
    return response.data;
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted || err.message.includes('cancelled')) {
    console.log('⏹️ Scan operation was cancelled');
    deleteFile(fileToSend);
    throw new Error('Scan cancelled');
  }
    console.error('❌ Error uploading file:', err.message);
    // delete file 
    deleteFile(fileToSend);
    return { success: false, error: err.message };
  }
}

async function directDownloadUrl(urlString,parsedUrl, signal, updateActivity = null, operationId = null){

  if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
  // IMPROVED: Quick HTTP check first
  const quickCheck = await quickHttpCheck(urlString, signal);
  if (quickCheck.quickFail) {
    console.log(`⚡ Quick fail for ${urlString}: ${quickCheck.message}`);
    return quickCheck;
  }
   // Add additional validation before attempting download
   if (parsedUrl.hostname.includes('invalid') || parsedUrl.hostname.includes('missing')) {
    console.error("❌ Detected test/invalid domain in direct download");
    return {
      success: false,
      error: "Invalid URL format",
      message: "Cannot download from invalid or test domains"
    };
  }

  let result = null;

    // For simple files, try Axios first (but only if quick check allows it)
  if (!quickCheck.quickFail && quickCheck.allowFallback !== false) {
    try {
      console.log("🔄 Trying Axios method first...");
      result = await downloadFileWithAxios(urlString, path.resolve(__dirname, 'downloads'), signal, updateActivity, operationId);
      if (result && result.success) {
        return result;
      }
    } catch (axiosError) {
      console.log("❌ Axios method failed:", axiosError.message);
      
      // If it's a network error, treat as invalid URL
      if (axiosError.message.includes('ENOTFOUND') || axiosError.message.includes('ECONNREFUSED')) {
        return {
          success: false,
          error: "Invalid URL format",
          message: "Cannot reach the specified domain - URL may be invalid"
        };
      }
    }
  }

  // Only try browser method if Axios failed but quick check didn't indicate a definite failure
  if (!quickCheck.quickFail) {
    console.log("🔄 Axios failed, trying browser method...");
    result = await downloadFile(urlString, path.resolve(__dirname, 'downloads'), signal, updateActivity, operationId);
  }
  
  // If all methods fail, return appropriate error
  if (!result) {
    return quickCheck.success === false ? quickCheck : {
      success: false,
      error: "Download failed", 
      message: "Unable to download from the provided URL"
    };
  }
  
  return result;
}

async function handleURL(urlString, skipScan = false, signal = null, userSessionId = null, operationId = null) {
  console.log("👤 User Session ID:", userSessionId?.slice(0, 8) + "...");
  console.log("🆔 Operation ID:", operationId?.slice(-8) + "...");

  // Helper function to update activity (if operation ID provided)
  const updateActivity = (activityType, data = {}) => {
    console.log(`🐛 updateActivity called with:`, { operationId, activityType, data });
    if (operationId && global.operationManager) {
      return global.operationManager.updateOperationActivity(operationId, activityType, data);
    }
    return false;
  };

   // Add default return value for error cases
   let errorResponse = {
    success: false,
    error: null,
    message: null
  };

  // 1. Check if URL is provided
  if (!urlString || typeof urlString !== 'string' || urlString.trim().length === 0) {
    console.error("❌ No URL provided to handleURL.");
    errorResponse.error = "No URL provided";
    errorResponse.message = "No URL was provided to process";
    return errorResponse;
  }

  // Trim whitespace
  urlString = urlString.trim();

  let matchKey = 'other';
  let parsedUrl;

  // 2. Basic URL syntax validation
  try {
    parsedUrl = new URL(urlString);
  } catch (err) {
    console.error("❌ Invalid URL syntax:", urlString);
    errorResponse.error = "Invalid URL format";
    errorResponse.message = `The URL "${urlString}" has invalid syntax`;
    return errorResponse;
  }

  // 3. Protocol validation - only allow http, https, magnet
  const allowedProtocols = ['http:', 'https:', 'magnet:'];
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    console.error(`❌ Unsupported protocol: ${parsedUrl.protocol}`);
    errorResponse.error = "Unsupported protocol";
    errorResponse.message = `Protocol "${parsedUrl.protocol}" is not supported. Only HTTP, HTTPS, and magnet links are allowed.`;
    return errorResponse;
  }

  // 4. Additional validation for http/https URLs
  if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
    // Check if hostname exists and is not empty
    if (!parsedUrl.hostname || parsedUrl.hostname.trim().length === 0) {
      console.error("❌ Invalid hostname:", urlString);
      errorResponse.error = "Invalid URL format";
      errorResponse.message = "URL must have a valid hostname";
      return errorResponse;
    }

    // Enhanced hostname validation - check for obviously invalid domains
    const hostnameRegex = /^[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/;
    
    // Additional checks for suspicious patterns
    const suspiciousPatterns = [
      /invalid[_-]?domain/i,     // Contains "invalid_domain" or "invalid-domain"
      /missing[_-]?colon/i,      // Contains "missing_colon" or "missing-colon"
      /test[_-]?domain/i,        // Contains "test_domain" or "test-domain"
      /fake[_-]?domain/i,        // Contains "fake_domain" or "fake-domain"
      /example[_-]?bad/i,        // Contains "example_bad" or "example-bad"
    ];

    const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
      pattern.test(parsedUrl.hostname)
    );

    if (!hostnameRegex.test(parsedUrl.hostname) || hasSuspiciousPattern) {
      console.error("❌ Invalid hostname format:", parsedUrl.hostname);
      errorResponse.error = "Invalid URL format";
      errorResponse.message = "URL hostname has invalid format or contains invalid domain name";
      return errorResponse;
    }

    // Check for incomplete URLs like "https://"
    if (parsedUrl.hostname.length === 0 || parsedUrl.href === `${parsedUrl.protocol}//`) {
      console.error("❌ Incomplete URL:", urlString);
      errorResponse.error = "Invalid URL format";
      errorResponse.message = "URL appears to be incomplete";
      return errorResponse;
    }
  }
  // Check for cancellation at the start
if (signal?.aborted) {
  throw new Error('Operation cancelled before starting');
}

  // 5. Check if it's a magnet link
  if (urlString.startsWith('magnet:')) {
    console.log("✅ This is a magnet link - skipping hostname parsing.");
    matchKey = 'torrent';
  } else {
    // Continue with existing domain parsing logic
    const parsedDomain = psl.parse(parsedUrl.hostname);

    // Validate that psl parsing was successful
    if (!parsedDomain.domain) {
      console.error("❌ Unable to parse domain:", parsedUrl.hostname);
      errorResponse.error = "Invalid URL format";
      errorResponse.message = "Unable to parse domain from URL";
      return errorResponse;
    }

    matchKey = (() => {
      if (parsedDomain.domain === 'google.com' && parsedDomain.subdomain.includes('drive')) return 'googleDrive';
      if (parsedDomain.domain === 'dropbox.com') return 'dropbox';
      if (parsedDomain.domain.includes('github')) return 'github';
      if (parsedDomain.domain === 'mega.nz') return 'megaNZ';
      if (parsedDomain.subdomain === 'onedrive' || parsedDomain.domain ==='1drv.ms') return 'onedrive';
      return 'other';
    })();


    // 📦 Detect direct download links - Enhanced version
const isDirectDownload = (() => {
  // Check file extension
  const hasFileExtension = /\.(bin|msi|zip|exe|pdf|png|jpg|jpeg|gif|bmp|svg|txt|csv|json|xml|html|css|js|mp4|mp3|avi|mov|tar\.gz|gz|rar|7z|docx|xlsx|pptx|apk|dmg|iso|deb|rpm|com)$/i.test(urlString);
  
  // Check for force download parameters
  const hasForceDownload = urlString.includes('force=true') || 
                          urlString.includes('download=1') ||
                          urlString.includes('attachment=1');
  
  return hasFileExtension || hasForceDownload;
})();

     if(isDirectDownload){
       matchKey = 'isDirectDownload';
     }
  }


  let result = null;
  let scan_result = null;

  // Check for cancellation before processing
if (signal?.aborted) {
  throw new Error('Operation cancelled');
}

  try {
    updateActivity('url_analysis_complete');
    switch (matchKey) {
      case 'isDirectDownload':
        console.log("🎯 Detected direct download URL. Trying multiple download methods.");
        updateActivity('direct_download_start');
        result = await directDownloadUrl(urlString, parsedUrl, signal, updateActivity, operationId);
        break;
      case 'googleDrive':
        console.log('🚀 Routing to Google Drive handler...');
        updateActivity('google_drive_start');
        result = await handleGoogleDriveDownload(urlString, signal, updateActivity, operationId);
        break;
      case 'dropbox':
        console.log('🚀 Routing to Dropbox handler...');
        updateActivity('dropbox_start');
        result = await handleDropboxDownload(urlString, signal, updateActivity, operationId);
        break;
      case 'github':
        console.log('🚀 Routing to GitHub handler...');
        updateActivity('github_start');
        result = await handleGithubDownload(urlString, signal, updateActivity, operationId);
        console.log("📨 GitHub handler returned:", result);
        break;
      case 'megaNZ':
        console.log('🚀 Routing to Mega.nz handler...');
        updateActivity('megaNZ_start');
        result = await handleMegaNZDownload(urlString, signal, updateActivity, operationId);
        break;
      case 'onedrive':
        console.log('🚀 Routing to OneDrive handler...');
        updateActivity('onedrive_start');
        result = await handleOneDriveDownload(urlString, signal, updateActivity, operationId);
        break;
      case 'torrent':
        console.log("🚀 Routing to torrent handler...");
        updateActivity('torrent_start');
        const { handleTorrentDownload } = await import('./torrent.mjs');
        result = await handleTorrentDownload(urlString, signal, updateActivity, operationId);
        break;
      case 'other':
        console.log('🚀 Routing to href handler...');
        updateActivity('href_analysis_start');
        result = await handleHrefDownload(urlString, signal, updateActivity, operationId);
            
           if (!result) {
            console.log("❌ No downloadable links found by href handler");
            console.log("🚀 Routing to generalURL handler...");
            updateActivity('generalURL_start');
            result = await handleGeneralURLDownload(urlString, signal, updateActivity, operationId); 

            if(!result){
              console.log("🎯Trying multiple direct download methods.");
              updateActivity('direct_download_start');
              result = await directDownloadUrl(urlString,parsedUrl, signal, updateActivity, operationId);
            }
          }else{

              console.log("The result from href_handling: ", result);
             if (result.multiple && result.links) {
               console.log("📋 Multiple download links found: " + result.links.length);
               console.log("⬇️ Available links:");
               
               // Display all links with numbers
               result.links.forEach((link, index) => {
                 console.log(`${index + 1}. 📦 ${link.text || 'No label'} (${link.type}): ${link.url}`);
               });
               
               console.log("\n⚠️ Multiple links found. Please specify which one to download.");
               // No automatic download for multiple links
               return { 
                 success: true, 
                 multiple: true, 
                 linkCount: result.links.length,
                 links: result.links,
                 message: "Multiple links found, please specify which one to download" 
               };
             } else if (result.single) {
               console.log(`📥 There is only one URL: ${result.url}`);
               return result;
             } 

          } 
           if(!result){
            return {
              success: false,
              error: "No links found",
              message: "No downloadable content found on the page."
            };

           }             
        break;
      default:
        console.log('⚠️ Unknown or unsupported URL domain.');
        return {
          success: false,
          error: "Unsupported domain",
          message: `The domain ${parsedUrl.hostname} is not supported for downloads.`
        };
    }

    if(skipScan && result){
      return result;
    }else if(skipScan && !result){
      console.log("couldn't download the file");
    }

    if (!result) {
      console.warn("⚠️ No result returned from the handler.");
      return {
        success: false,
        error: "No result",
        message: "No results returned from the URL handler."
      };
    }

    if (result?.path && result?.filename) {
      updateActivity('scanning_start');
      console.log("📤 Uploading file to scan:", result.path);
      scan_result = await sendFileToScanner(result.path, result.filename, signal, userSessionId);
      updateActivity('scanning_complete');
      console.log("👤 Scanning for user:", userSessionId?.slice(0, 8) + "...");
      console.log("🧪 Scan result:", scan_result);
      
      // Attach scan result to the main result
      result.scan_result = scan_result;
      
      // Make sure success is set
      if (!result.success) result.success = true;
      
      return result;
    }
    
    // Ensure we always return something
    return result;

  } catch (error) {
     if (error.message.includes('cancelled') || signal?.aborted) {
    console.log('⏹️ Operation was cancelled gracefully');
    return {
      success: false,
      cancelled: true,
      error: 'Operation cancelled',
      message: 'Download was cancelled. You can continue chatting.'
    };
  }
  console.error('❌ Error handling URL:', error.message);
  return {
    success: false,
    error: error.message,
    message: `Error processing URL: ${error.message}`
  };
  }
}

module.exports = { handleURL , downloadFile , downloadFileWithAxios , deleteFile , sendFileToScanner};