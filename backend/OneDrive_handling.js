const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function trackDownloadProgressByFileSize(filePath, expectedSize, updateActivity, signal) {
  const startTime = Date.now();
  let lastSize = 0;
  let checkCount = 0;
  
  console.log(`🔍 Starting progress tracking for: ${filePath}`);
  console.log(`📊 Expected size: ${expectedSize ? (expectedSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);
  
  const progressInterval = setInterval(() => {
    if (signal?.aborted) {
      console.log('⏹️ OneDrive progress tracking stopped due to cancellation');
      clearInterval(progressInterval);
      return;
    }
    checkCount++;
    
    try {
      const fileExists = fs.existsSync(filePath);
      
      if (!fileExists) {
        return;
      }
      
      const stats = fs.statSync(filePath);
      const currentSize = stats.size;
      
      let percentage;
      if (expectedSize && expectedSize > currentSize) {
        percentage = Math.min((currentSize / expectedSize) * 100, 100);
      } else {
        percentage = 0;
      }
      
      const speed = (currentSize - lastSize) / 0.5 / 1024;
      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      
      if (updateActivity) {
        updateActivity('onedrive_download_progress', {
          percentage: Math.round(percentage),
          downloadedBytes: currentSize,
          totalBytes: expectedSize || currentSize,
          downloadedFormatted: `${(currentSize / 1024 / 1024).toFixed(2)} MB`,
          totalFormatted: expectedSize ? `${(expectedSize / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
          speed: `${speed.toFixed(1)} KB/s`,
          elapsed: elapsedSeconds
        });
      }
      
      if (expectedSize && expectedSize > currentSize && percentage > 0) {
        console.log(`📊 OneDrive Progress: ${Math.round(percentage)}% (${(currentSize / 1024 / 1024).toFixed(2)} MB / ${(expectedSize / 1024 / 1024).toFixed(2)} MB) - ${speed.toFixed(1)} KB/s`);
      } else if (currentSize > 0) {
        console.log(`📊 OneDrive Downloaded: ${(currentSize / 1024 / 1024).toFixed(2)} MB - ${speed.toFixed(1)} KB/s`);
      } else {
        console.log(`📊 OneDrive: File created, waiting for data... (${elapsedSeconds}s)`);
      }
      
      lastSize = currentSize;
      
      if (speed < 1 && currentSize > 1000000 && elapsedSeconds > 30) {
        console.log('🏁 Download appears complete (no progress for 30s)');
        clearInterval(progressInterval);
      }
      
      if (elapsedSeconds > 600) {
        console.log('⏰ Progress tracking timeout (10 minutes)');
        clearInterval(progressInterval);
      }
      
    } catch (err) {
      console.log(`⚠️ Progress tracking error: ${err.message}`);
      
      if (checkCount % 20 === 0) {
        console.log(`🔍 File path being monitored: ${filePath}`);
        console.log(`🔍 Error details: ${err.stack}`);
      }
    }
  }, 500);
  
  return progressInterval;
}

async function handleOneDriveDownload(url, signal, updateActivity = null, operationId = null) {
    console.log("📥 Starting One drive download:", url);
    if (updateActivity) updateActivity('onedrive_init');

return new Promise(async (resolve, reject) => {

  if (signal?.aborted) {
    throw new Error('Operation cancelled before starting');
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
  let progressInterval = null;
  let sizeDetected = false;
  let finalExpectedSize = 0;

  page.on('response', async (response) => {
  if (sizeDetected) return;
  
  const contentLength = response.headers()['content-length'];
  const contentDisposition = response.headers()['content-disposition'];
  const url = response.url();
  
  if (contentLength && (
    (contentDisposition && contentDisposition.includes('attachment')) ||
    url.includes('download') ||
    url.includes('1drv.ms') ||
    url.includes('sharepoint.com')
  )) {
    const size = parseInt(contentLength);
    
    if (size > 1000000) {
      finalExpectedSize = size;
      sizeDetected = true;
      
      console.log(`📊 OneDrive Expected download size: ${(finalExpectedSize / 1024 / 1024).toFixed(2)} MB`);
      if (updateActivity) {
        updateActivity('onedrive_size_detected', {
          size: finalExpectedSize,
          sizeFormatted: `${(finalExpectedSize / 1024 / 1024).toFixed(2)} MB`
        });
      }
    }
  }
});

  // 📁 Set custom download directory
  const downloadDir = path.join(__dirname,'downloads');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }
  let downloadInProgress = false;

  // Add signal handler for browser cleanup
   if (signal) {
  signal.addEventListener('abort', async () => {
    console.log('⏹️ Cancelling OneDrive download...');
    
    // ✅ CRITICAL: Clear progress interval with logging
    if (progressInterval) {
      console.log('⏹️ Stopping OneDrive progress tracking from signal handler...');
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
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
      message: 'OneDrive download was cancelled. Chat is still active.'
    });
  });
}

// 🎯 Listen for download event - ENHANCED
page.once('download', async (download) => {
  const filename = download.suggestedFilename();
  const savePath = path.join(downloadDir, filename);

  console.log('📥 OneDrive Download started:', filename);
  console.log('📥 Download URL:', download.url());
  console.log('📁 Save path:', savePath);
   // Use the detected size, or 0 if not detected
  const expectedSize = finalExpectedSize || 0;
  console.log(`📊 Using expected size: ${expectedSize ? (expectedSize / 1024 / 1024).toFixed(2) + ' MB' : 'Unknown'}`);

  // Add progress tracking start
  if (updateActivity) {
    updateActivity('onedrive_download_started', { 
      filename: filename 
    });
  }

  // Start progress monitoring
  console.log(`🔄 Starting OneDrive progress tracking...`);
  progressInterval = trackDownloadProgressByFileSize(savePath, expectedSize, updateActivity, signal);

  if (updateActivity) {
    updateActivity('onedrive_download_in_progress', { 
      filename: filename,
      status: 'downloading'
    });
  }

   if (signal?.aborted) {
      console.log('⏹️ OneDrive Download cancelled before saving');
      if (progressInterval) clearInterval(progressInterval);
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      return reject(new Error('OneDrive download was cancelled'));
    }

  // Enhanced save with error handling
  try {
    console.log('💾 Starting download.saveAs()...');
    let estimatedProgress = 0;
    const startTime = Date.now();
    const estimatedDuration = Math.max(expectedSize / 1000000, 30); // 1MB/sec minimum 30s

    const estimateInterval = setInterval(() => {
      if (signal?.aborted) {
        console.log('⏹️ OneDrive estimated progress stopped due to cancellation');
        clearInterval(estimateInterval);
        return;
      }
      const elapsed = (Date.now() - startTime) / 1000;
      estimatedProgress = Math.min((elapsed / estimatedDuration) * 100, 95);
      
      console.log(`📊 OneDrive Progress: ${estimatedProgress.toFixed(0)}% (${(expectedSize * estimatedProgress / 100 / 1024 / 1024).toFixed(2)} MB / ${(expectedSize / 1024 / 1024).toFixed(2)} MB) `);
      
      if (updateActivity) {
        updateActivity('onedrive_download_progress', {
          percentage: Math.round(estimatedProgress),
          downloadedBytes: Math.round(expectedSize * estimatedProgress / 100),
          totalBytes: expectedSize,
          downloadedFormatted: `${(expectedSize * estimatedProgress / 100 / 1024 / 1024).toFixed(2)} MB`,
          totalFormatted: `${(expectedSize / 1024 / 1024).toFixed(2)} MB`,
          speed: 'Estimated',
          elapsed: Math.round(elapsed),
          estimated: true
        });
      }
    }, 2000); // Update every 2 seconds
    // Add timeout and progress cleanup
    const downloadPromise = download.saveAs(savePath);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        clearInterval(estimateInterval);
        reject(new Error('download.saveAs() timeout after 300 seconds'));
      }, 600000);
    });

    await Promise.race([downloadPromise, timeoutPromise]);

    // Clear estimated progress when done
    clearInterval(estimateInterval);
    if (signal?.aborted) {
  clearInterval(estimateInterval);
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
    console.log('⏹️ OneDrive download cancelled during save operation');
    return;
  }
    await download.saveAs(savePath);
    console.log('✅ download.saveAs() completed');
    
    // Stop progress tracking
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    // Get final file stats
    const stats = fs.statSync(savePath);
    const finalSize = stats.size;
    
    console.log('✅ OneDrive File saved to:', savePath);
    console.log(`📊 OneDrive Final size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
    
    if (updateActivity) {
      updateActivity('onedrive_download_complete', {
        filename: filename,
        size: finalSize,
        sizeFormatted: `${(finalSize / 1024 / 1024).toFixed(2)} MB`,
        path: savePath,
        percentage: 100
      });
    }

    // Wait 5 seconds and close
    await page.waitForTimeout(5000);
    if (!browserClosed) {
      browserClosed = true;
      await browser.close();
    }
    console.log("📦 Resolving with OneDrive file:", filename);
    resolve({ path: savePath, filename: filename, size: finalSize });

  }  catch (saveError) {
  // ✅ CRITICAL: Clear progress interval immediately
  if (progressInterval) {
    console.log('⏹️ Clearing OneDrive progress interval due to error');
    clearInterval(progressInterval);
    progressInterval = null;
  }
  
  // ✅ Check if it's a cancellation error
  if (signal?.aborted || saveError.message.includes('canceled') || saveError.message.includes('cancelled')) {
    console.log('⏹️ OneDrive download was cancelled during save');
    
    // Clean up partial file
    try {
      if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
        console.log('🗑️ Cleaned up partial OneDrive download file');
      }
    } catch (e) {}
    
    if (!browserClosed) {
      browserClosed = true;
      await browser.close();
    }
    
    resolve({
      success: false,
      cancelled: true,
      message: 'OneDrive download was cancelled. Chat is still active.'
    });
    return;
  }
  
  console.log('⚠️ OneDrive Error saving download:', saveError.message);
  if (updateActivity) {
    updateActivity('onedrive_download_failed', { 
      filename: filename, 
      error: saveError.message 
    });
  }
  
  if (!browserClosed) {
    browserClosed = true;
    await browser.close();
  }
  reject(new Error(`OneDrive download failed: ${saveError.message}`));
}
});


  if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }
  // 🔗 Replace this with your actual OneDrive shared link
  //'https://onedrive.live.com/?redeem=aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9iZTAwMjI3ZTlkMDBkNmM3L0VadnJKNmhLZDBwUGtiVUozR1N4RmNJQjExcWlqcVdlRXVubWJtU2hhLVd3OHc%5FZT1MeFhWMTE&cid=BE00227E9D00D6C7&id=BE00227E9D00D6C7%21sa827eb9b774a4f4a91b509dc64b115c2&parId=root&o=OneUp'
  const onedriveUrl = url;
  await page.goto(onedriveUrl, { waitUntil: 'domcontentloaded' });
  if (updateActivity) updateActivity('onedrive_page_loaded');
  await page.waitForTimeout(6000); // Let content load

   if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

  // 🖱️ Look for "Download" button and click it - ENHANCED
let maxRetries = 3;
let attempt = 0;
let downloadBtn = null;

while (attempt < maxRetries) {
  try {
    attempt++;
    console.log(`🔁 Attempt ${attempt} to find and click OneDrive "Download" button...`);

    downloadBtn = await page.waitForSelector('button:has-text("Download")', { timeout: 5000 });
    
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

    console.log('🖱️ Clicking OneDrive "Download" button...');
    await downloadBtn.click();
    
    if (updateActivity) updateActivity('onedrive_button_clicked');
    
    downloadInProgress = true;

    // Give OneDrive time to prepare download
    console.log('⏳ Waiting for OneDrive to prepare download...');
    if (updateActivity) updateActivity('onedrive_download_initiated');
    await page.waitForTimeout(3000);
    
    break; // ✅ Success, exit the retry loop

  } catch (err) {
    if (signal?.aborted || err.message.includes('cancelled')) {
      throw new Error('Operation cancelled');
    }

    console.log(`⚠️ Attempt ${attempt} failed: ${err.message}`);

    if (attempt >= maxRetries) {
      console.log('❌ Could not find or click OneDrive download button after 3 attempts.');
      if (updateActivity) updateActivity('onedrive_button_not_found', { error: err.message });

      // Add progress cleanup
      if (progressInterval) clearInterval(progressInterval);
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      return reject(new Error("OneDrive download button not found or failed to click."));
    }

    await page.waitForTimeout(1000); // ⏱️ Wait before retrying
  }
}


 // ⌛ Fallback timeout in case download doesn't trigger - ENHANCED
setTimeout(async () => {
  if(!downloadInProgress && !signal?.aborted) {
     console.log('⌛ No OneDrive download was triggered. Closing browser...');
     if (updateActivity) updateActivity('onedrive_timeout');
     
     // Add progress cleanup
     if (progressInterval) clearInterval(progressInterval);
     if (!browserClosed) {
      browserClosed = true;
      await browser.close();
    }
     resolve(null); // no file to return
   }
 }, 60000); // 60 seconds
 
});
}
module.exports = {handleOneDriveDownload};