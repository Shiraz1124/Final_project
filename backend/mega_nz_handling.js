const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function trackDownloadProgressByFileSize(filePath, expectedSize, updateActivity, signal) {
  const startTime = Date.now();
  let lastSize = 0;
  
  const progressInterval = setInterval(() => {
    if (signal?.aborted) {
      clearInterval(progressInterval);
      return;
    }
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const currentSize = stats.size;
        
        // Use actual file size for progress if expected size is wrong
        let percentage;
        if (expectedSize && expectedSize > currentSize) {
          percentage = Math.min((currentSize / expectedSize) * 100, 100);
        } else {
          percentage = 0; // Can't calculate percentage
        }
        
        const speed = (currentSize - lastSize) / 0.5 / 1024; // KB/s (500ms intervals)
        
        if (updateActivity) {
          updateActivity('meganz_download_progress', {
            percentage: Math.round(percentage),
            downloadedBytes: currentSize,
            totalBytes: expectedSize || currentSize,
            downloadedFormatted: `${(currentSize / 1024 / 1024).toFixed(2)} MB`,
            totalFormatted: expectedSize ? `${(expectedSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
            speed: `${speed.toFixed(1)} KB/s`,
            elapsed: Math.round((Date.now() - startTime) / 1000)
          });
        }
        
        // Better progress display
        if (expectedSize && expectedSize > currentSize) {
          console.log(`📊 MEGA Progress: ${Math.round(percentage)}% (${(currentSize / 1024 / 1024).toFixed(2)} MB / ${(expectedSize / 1024 / 1024).toFixed(2)} MB) - ${speed.toFixed(1)} KB/s`);
        } else {
          console.log(`📊 MEGA Downloaded: ${(currentSize / 1024 / 1024).toFixed(2)} MB - ${speed.toFixed(1)} KB/s`);
        }
        
        lastSize = currentSize;
        
        // Stop if no progress for 10 seconds (download likely complete)
        if (speed < 1 && currentSize > 1000000) {
          clearInterval(progressInterval);
        }
      }
    } catch (err) {
      // File might not exist yet or be locked
    }
  }, 500); // Update every 500ms
  
  return progressInterval;
}

async function handleMegaNZDownload(url, signal, updateActivity = null, operationId = null) {
    console.log("📥 Starting MegaNZ download:", url);
    if (updateActivity) updateActivity('meganz_init');

return new Promise(async (resolve, reject) => {
  if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
  let browserClosed = false;
  const browser = await chromium.launch({ headless: true });

  
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const page = await context.newPage();

let sizeDetected = false;
let finalExpectedSize = 0;

page.on('response', async (response) => {
  // Only detect size once from substantial downloads
  if (sizeDetected) return;
  
  const contentLength = response.headers()['content-length'];
  const contentDisposition = response.headers()['content-disposition'];
  const url = response.url();
  
  // Only detect size from substantial files (> 10MB) to avoid tiny responses
  if (contentLength && parseInt(contentLength) > 10000000 && (
    url.startsWith('blob:') ||
    (contentDisposition && contentDisposition.includes('attachment'))
  )) {
    finalExpectedSize = parseInt(contentLength);
    sizeDetected = true;
    
    console.log(`📊 MEGA Actual download size: ${(finalExpectedSize / 1024 / 1024).toFixed(2)} MB`);
    if (updateActivity) {
      updateActivity('meganz_size_detected', {
        size: finalExpectedSize,
        sizeFormatted: `${(finalExpectedSize / 1024 / 1024).toFixed(2)} MB`
      });
    }
  }
});

  // 📁 Define custom download folder
  const downloadDir = path.join(__dirname, 'downloads');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  let downloadInProgress = false;
  let progressInterval = null;
  let expectedSize = 0;

  // Add signal handler for browser cleanup
    if (signal) {
        signal.addEventListener('abort', async () => {
          console.log('⏹️ Cancelling MegaNZ download...');
          if (progressInterval) clearInterval(progressInterval);
          if (!browserClosed) {
            try {
              browserClosed = true;
              await browser.close();
            } catch (e) {
              console.log('⚠️ Browser cleanup error (expected):', e.message);
            }
          }
          resolve({
            success: false,
            cancelled: true,
            message: 'MegaNZ download was cancelled. Chat is still active.'
          });
        });
      }

  // 🎯 Listen for download event
page.once('download', async (download) => {
  const suggestedFilename = download.suggestedFilename();
  const savePath = path.join(downloadDir, suggestedFilename);
  console.log('📦 MEGA Download started:', suggestedFilename);
  console.log('📦 Download URL:', download.url());

  // Add progress tracking start
  if (updateActivity) {
    updateActivity('meganz_download_started', { 
      filename: suggestedFilename 
    });
  }

 // Use the detected size, or 0 if not detected
const expectedSize = finalExpectedSize || 0;

// Start progress monitoring regardless of expected size
console.log(`🔄 Starting MEGA progress tracking...`);
progressInterval = trackDownloadProgressByFileSize(savePath, expectedSize, updateActivity, signal);

  if (updateActivity) {
    updateActivity('meganz_download_in_progress', { 
      filename: suggestedFilename,
      status: 'downloading'
    });
  }

  if (signal?.aborted) {
      console.log('⏹️ MEGA Download cancelled before saving');
      if (progressInterval) clearInterval(progressInterval);
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      return reject(new Error('MegaNZ download was cancelled'));
    }

  // Enhanced save with error handling
  try {
    await download.saveAs(savePath);
    
    // Stop progress tracking
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    // Get final file stats
    const stats = fs.statSync(savePath);
    const finalSize = stats.size;
    
    console.log('✅ MEGA File saved to:', savePath);
    console.log(`📊 MEGA Final size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    
    if (updateActivity) {
      updateActivity('meganz_download_complete', {
        filename: suggestedFilename,
        size: finalSize,
        sizeFormatted: `${(finalSize / 1024 / 1024).toFixed(2)} MB`,
        path: savePath,
        percentage: 100
      });
    }

    // ⏳ Wait 5 seconds after download before closing
    console.log('⏳ Waiting 5 seconds before closing...');
    await page.waitForTimeout(5000);
    
    if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
    console.log("📦 Resolving with MEGA file:", suggestedFilename);
    resolve({ path: savePath, filename: suggestedFilename, size: finalSize });

  } catch (saveError) {
    // Error handling with cleanup
    if (progressInterval) clearInterval(progressInterval);
    
    console.log('⚠️ MEGA Error saving download:', saveError.message);
    if (updateActivity) {
      updateActivity('meganz_download_failed', { 
        filename: suggestedFilename, 
        error: saveError.message 
      });
    }
    
    if (!browserClosed) {
      browserClosed = true;
      await browser.close();
    }
    reject(new Error(`MEGA download failed: ${saveError.message}`));
  }
});

    if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
  // 🔗 Navigate to MEGA.nz file link
  //'https://mega.nz/file/WkxkAIQK#BXPwgvGzojhF0m3w52_DkAsPFemif25VwlTysUI-ZTQ'
  const megaUrl = url;
  await page.goto(megaUrl, { waitUntil: 'domcontentloaded' });
  if (updateActivity) updateActivity('meganz_page_loaded');
  await page.waitForTimeout(3000); // Let dynamic content load

  try {
     if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
   // 🖱️ Wait for and click the real MEGA download button
const downloadButton = await page.waitForSelector('button.js-standard-download', { timeout: 20000 });
if (signal?.aborted) {
    throw new Error('Operation cancelled');
  }
console.log('🖱️ Clicking MEGA "Download" button...');
if (updateActivity) updateActivity('meganz_button_clicked');

await downloadButton.click();
if (updateActivity) updateActivity('meganz_download_initiated');
downloadInProgress = true;

// Give MEGA more time to process the download
console.log('⏳ Waiting for MEGA to prepare download...');
await page.waitForTimeout(5000);
  } catch (err) {
    if (signal?.aborted || err.message.includes('cancelled')) {
        throw new Error('Operation cancelled');
      }
    console.log('❌ Could not find or click the download button:', err.message);
    if (updateActivity) updateActivity('meganz_button_not_found', { error: err.message });
    if (progressInterval) clearInterval(progressInterval);
    if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
    return reject(new Error("MEGA download button not found or failed to click."));
  }

  // ⌛ Fallback timeout if no download is triggered
  setTimeout(async () => {
    if (!downloadInProgress && !signal?.aborted) {
      console.log('⚠️ No download detected. Closing browser...');
      if (updateActivity) updateActivity('meganz_timeout');
      if (progressInterval) clearInterval(progressInterval);
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      resolve(null); // no file
    }
  }, 60000); // 60 seconds fallback
});
}
module.exports = {handleMegaNZDownload}; 