const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');


async function handleGithubDownload(url, signal, updateActivity = null, operationId = null) {
    console.log("📥 Starting Github download:", url);
    if (updateActivity) updateActivity('github_init');

return new Promise(async (resolve, reject) => {
  if (signal?.aborted) {
    throw new Error('Operation cancelled before starting');
  }
  let browserClosed = false; 
  let progressInterval = null;
  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true // enable file downloads
  });

  const page = await context.newPage();

   // Add signal handler for browser cleanup
    if (signal) {
        signal.addEventListener('abort', async () => {
          console.log('⏹️ Cancelling GitHub download...');
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
            message: 'GitHub download was cancelled. Chat is still active.'
          });
        });
      }

    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

  // Navigate to the GitHub repo
  //'https://github.com/vercel/next.js'
  try{
  await page.goto(url, { waitUntil: 'load' });
  if (updateActivity) updateActivity('github_page_loaded');

   if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

  // Click the actual Code button (based on your provided DOM)
  await page.click('button:has-text("Code")');

   if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }

  // Wait for the dropdown and click Download ZIP
  const downloadPromise = page.waitForEvent('download');
  await page.click('a:has-text("Download Zip")'); // Adjust if the branch name is different
  if (updateActivity) updateActivity('github_download_initiated');

   if (signal?.aborted) {
      console.log('⏹️ Download cancelled before completion');
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      return reject(new Error('GitHub download was cancelled'));
    }

  const download = await downloadPromise;

  // Save the downloaded ZIP to local disk
  // ✅ Define the suggested filename from Playwright
  const downloadDir = path.join(__dirname,'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

     if (signal?.aborted) {
      console.log('⏹️ Download cancelled before saving');
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      return reject(new Error('GitHub download was cancelled'));
    }

 const suggestedFilename = download.suggestedFilename();
const savePath = path.join(downloadDir, suggestedFilename);

// 🆕 ADD: Progress tracking for GitHub download
console.log('⬇️ Starting GitHub ZIP download with progress tracking...');
if (updateActivity) updateActivity('github_download_progress_start');

// Use Playwright's download path method with manual progress tracking
const tempPath = await download.path();

// Now copy the file with progress tracking
await new Promise((downloadResolve, downloadReject) => {
  let downloadedBytes = 0;
  
  const readStream = fs.createReadStream(tempPath);
  const writeStream = fs.createWriteStream(savePath);

  // Track progress
  readStream.on('data', (chunk) => {
    if (signal?.aborted) {
    try {
      readStream.destroy();
      writeStream.destroy();
      if (fs.existsSync(savePath)) {
        fs.unlinkSync(savePath);
      }
    } catch (e) {}
    return;
  }
    downloadedBytes += chunk.length;
    const mb = downloadedBytes / 1024 / 1024;
    
    // Log every 5MB
    if (Math.floor(mb) % 5 === 0 && Math.floor(mb) > Math.floor((downloadedBytes - chunk.length) / 1024 / 1024)) {
      console.log(`📥 GitHub Downloaded: ${mb.toFixed(1)} MB`);
      if (updateActivity) {
        updateActivity(`github_downloading_${mb.toFixed(1)}MB`);
      }
    }
  });

  readStream.on('error', (error) => {
    console.error('❌ GitHub read stream error:', error.message);
    downloadReject(error);
  });

  writeStream.on('error', (error) => {
    console.error('❌ GitHub write stream error:', error.message);
    downloadReject(error);
  });

  writeStream.on('finish', () => {
    const finalMB = (downloadedBytes / 1024 / 1024).toFixed(1);
    console.log(`📥 GitHub download completed: ${suggestedFilename} (${finalMB} MB)`);
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempPath);
    } catch (e) {
      console.log('⚠️ Could not clean up temp file:', e.message);
    }
    
    downloadResolve();
  });

  // Start the copy with progress
  readStream.pipe(writeStream);
});

  
  console.log(`✅ File downloaded and saved to: ${savePath}`);
  if (updateActivity) updateActivity('github_download_complete');

  if (!browserClosed) {
    browserClosed = true;
    await browser.close();
}
  console.log("📦 Resolving with file:", suggestedFilename);
  resolve({ path: savePath, filename: suggestedFilename });
  }catch (err) {
     if (signal?.aborted || err.message.includes('cancelled')) {
      console.log('⏹️ GitHub download operation was cancelled');
      if (browser) {
        try {
          if (!browserClosed) {
            browserClosed = true;
            await browser.close();
          }
        } catch (e) {}
      }
      return resolve(null);
    }
      console.error("❌ GitHub download failed:", err.message);
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      reject(err);
    }
});
}
module.exports = { handleGithubDownload };