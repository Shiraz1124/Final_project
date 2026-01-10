
// const { chromium } = require('playwright');
// const fs = require('fs');
// const path = require('path');
// const axios = require('axios');

// async function handleDropboxDownload(url, signal, updateActivity = null) {
//   console.log("📥 Starting Dropbox download:", url);
//   if (updateActivity) updateActivity('dropbox_init');

//   return new Promise(async (resolve, reject) => {
//     if (signal?.aborted) {
//       throw new Error('Operation cancelled before starting');
//     }
//     let timeoutId; // ✅ DECLARE timeoutId HERE  
//     let browserClosed = false; // ✅ ADD browser tracking
//     const browser = await chromium.launch({ headless: true });

//     try {
//       const context = await browser.newContext({
//         acceptDownloads: true,
//         locale: 'en-US',
//         extraHTTPHeaders: {
//           'Accept-Language': 'en-US,en;q=0.9'
//         }
//       });

//       const page = await context.newPage();

//       // 📁 Downloads folder
//       const downloadDir = path.join(__dirname, 'downloads');
//       if (!fs.existsSync(downloadDir)) {
//         fs.mkdirSync(downloadDir, { recursive: true });
//       }

//       // Check if it's a direct download link (?dl=1)
// if (url.includes('?dl=1') || url.includes('&dl=1')) {
//   console.log('🔗 Direct download link detected, using Axios method...');
//   if (updateActivity) updateActivity('dropbox_direct_download');
  
//   try {
//     const response = await axios({
//       method: 'GET',
//       url: url,
//       responseType: 'arraybuffer',
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
//       },
//       signal: signal,
//       // 🆕 ADD: Progress tracking for Dropbox
//   onDownloadProgress: (progressEvent) => {
//     if (progressEvent.total) {
//       const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      
//       if (percent % 10 === 0 || percent === 100) {
//         const loadedMB = (progressEvent.loaded / 1024 / 1024).toFixed(1);
//         const totalMB = (progressEvent.total / 1024 / 1024).toFixed(1);
//         console.log(`📥 Dropbox Progress: ${percent}% (${loadedMB}/${totalMB} MB)`);
        
//         if (updateActivity) {
//           updateActivity(`dropbox_downloading_${percent}%`);
//         }
//       }
//     } else {
//       const mb = (progressEvent.loaded / 1024 / 1024).toFixed(1);
//       console.log(`📥 Dropbox Downloaded: ${mb} MB`);
//     }
//   }
//     });

//     if (signal?.aborted) {
//       throw new Error('Operation cancelled');
//     }

//     // Extract filename from Content-Disposition header or URL
//     let filename = 'dropbox_download';
//     const contentDisposition = response.headers['content-disposition'];
    
//     if (contentDisposition) {
//       const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
//       if (matches && matches[1]) {
//         filename = matches[1].replace(/['"]/g, '');
//       }
//     } else {
//       // Extract from URL path
//       const urlPath = new URL(url).pathname;
//       const pathSegments = urlPath.split('/');
//       const lastSegment = pathSegments[pathSegments.length - 1];
//       if (lastSegment && lastSegment.includes('.')) {
//         filename = lastSegment;
//       }
//     }

//     const filePath = path.join(downloadDir, filename);
//     fs.writeFileSync(filePath, response.data);
    
//     console.log(`✅ Direct download completed: ${filename}`);
//     if (updateActivity) updateActivity('dropbox_download_complete');
    
//     return resolve({ path: filePath, filename: filename });

//   } catch (error) {
//     if (signal?.aborted || error.message.includes('cancelled')) {
//       console.log('⏹️ Dropbox direct download was cancelled');
//       return resolve({
//         success: false,
//         cancelled: true,
//         message: 'Dropbox download was cancelled. Chat is still active.'
//       });
//     }
    
//     console.log('❌ Direct download failed:', error.message);
//     console.log('🔄 Falling back to browser automation...');
//     // Fall through to browser method
//   }
// }

//       let downloadInProgress = false;
//       // Add signal handler for browser cleanup
// if (signal) {
//   signal.addEventListener('abort', async () => {
//     console.log('⏹️ Cancelling Dropbox download...');
//     if (timeoutId) {
//       clearTimeout(timeoutId);
//     }
//     if (!browserClosed) {
//       try {
//         browserClosed = true;
//         await browser.close();
//       } catch (e) {
//         console.log('⚠️ Browser cleanup error (expected):', e.message);
//       }
//     }
//     resolve({
//       success: false,
//       cancelled: true,
//       message: 'Dropbox download was cancelled.'
//     });
//   });
// }


//       // 🎯 Listen for the download event
//       page.once('download', async (download) => {
//         console.log("🎯 Detected download event");
//         clearTimeout(timeoutId);
//         downloadInProgress = true;

//         if (signal?.aborted) {
//           console.log('⏹️ Download cancelled before saving');
//           await browser.close();
//           return reject(new Error('Dropbox download was cancelled'));
//         }

//         const suggestedFilename = download.suggestedFilename();
//         const savePath = path.join(downloadDir, suggestedFilename);

//         console.log('📦 Download started:', download.url());
//         await download.saveAs(savePath);
//         console.log('✅ File saved to:', savePath);
//         if (updateActivity) updateActivity('dropbox_download_complete');

//         if (!signal?.aborted && !browserClosed) {
//           try {
//             await page.waitForTimeout(3000);
//           } catch (e) {
//             console.log('⚠️ Skipped waitForTimeout due to closed browser:', e.message);
//           }

//           try {
//             browserClosed = true;
//             await browser.close();
//           } catch (e) {
//             console.log('⚠️ Browser already closed:', e.message);
//           }

//           console.log("📦 Done.");
//           resolve({ path: savePath, filename: suggestedFilename });
//         }
//       });

//       if (signal?.aborted) {
//         throw new Error('Operation cancelled');
//       }

//       // 🔗 Visit Dropbox file
//       await page.goto(url, { waitUntil: 'load' });
//       await page.waitForTimeout(3000);

//       if (signal?.aborted) {
//         throw new Error('Operation cancelled');
//       }
//       // 🖱️ Step 1: Click the first "Download" button
//       const downloadButton = await page.waitForSelector('button[data-dig-button="true"]:has-text("Download")', { timeout: 60000 });
//       if (signal?.aborted) {
//         throw new Error('Operation cancelled');
//       }
//       console.log('🖱️ Clicking the main "Download" button...');
//       await downloadButton.click();
//       if (updateActivity) updateActivity('dropbox_download_initiated');

//        if (signal?.aborted) {
//         throw new Error('Operation cancelled');
//       }

//       // ⏳ Step 2: Wait for and click "Or continue with download only"
//       try {
//         const continueButton = await page.waitForSelector('button[data-dig-button="true"]:has-text("continue with download only")', { timeout: 8000 });
//         if (signal?.aborted) {
//           throw new Error('Operation cancelled');
//         }
//         console.log('🖱️ Clicking "Continue with download only"...');
//         await continueButton.click();
//       } catch (e) {
//          if (signal?.aborted || e.message.includes('cancelled')) {
//           throw new Error('Operation cancelled');
//         }
//         console.log('⚠️ "Continue with download only" button not found, maybe not needed.');
//       }

//       // ⏳ Safety wait in case download is slow to trigger
//       timeoutId = setTimeout(async () => {
//       if (!downloadInProgress && !signal?.aborted && !browserClosed) {
//         console.log('⌛ No download was triggered. Closing browser...');
//         browserClosed = true;
//         await browser.close();
//         resolve(null);
//       }
//     }, 15000);

//     } catch (err) {
//           if (signal?.aborted || err.message.includes('cancelled')) {
//         console.log('⏹️ Dropbox download operation was cancelled');
//         if (browser && !browserClosed) {
//           try {
//               try {
//                 if (!browserClosed) {
//                   browserClosed = true;
//                   await browser.close();
//                 }
//               } catch (e) {
//                 console.log('⚠️ Browser already closed (catch block):', e.message);
//               }
//             await browser.close();
//           } catch (e) {
//             console.log('⚠️ Browser cleanup error (expected):', e.message);
//           }
//         }
//         return resolve({
//           success: false,
//           cancelled: true,
//           message: 'Dropbox download was cancelled.'
//         });
//       }
//       console.error("❌ Dropbox handler error:", err.message);
//       if (!browserClosed) {
//         browserClosed = true;
//         await browser.close();
//       }
//       reject(err);
//     }
//   });
// }

// module.exports = { handleDropboxDownload };


const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function handleDropboxDownload(url, signal, updateActivity = null, operationId = null) {
  console.log("📥 Starting Dropbox download:", url);
  if (updateActivity) updateActivity('dropbox_init');

  return new Promise(async (resolve, reject) => {
    if (signal?.aborted) {
      throw new Error('Operation cancelled before starting');
    }
    let timeoutId;
    let browserClosed = false;
    let progressInterval = null;
    const browser = await chromium.launch({ headless: true });

    try {
      const context = await browser.newContext({
        acceptDownloads: true,
        locale: 'en-US',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const page = await context.newPage();

      // 📁 Downloads folder
      const downloadDir = path.join(__dirname, 'downloads');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // Check if it's a direct download link (?dl=1)
      if (url.includes('?dl=1') || url.includes('&dl=1')) {
        console.log('🔗 Direct download link detected, using Axios method...');
        if (updateActivity) updateActivity('dropbox_direct_download');
        
        try {
          const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: signal,
            // Enhanced progress tracking for direct downloads
            onDownloadProgress: (progressEvent) => {
              if (signal?.aborted) {
                throw new Error('Download cancelled by user');
              }
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                const loadedMB = (progressEvent.loaded / 1024 / 1024).toFixed(1);
                const totalMB = (progressEvent.total / 1024 / 1024).toFixed(1);
                
                // Update every 5% or at completion
                if (percent % 5 === 0 || percent === 100) {
                  console.log(`📥 Dropbox Progress: ${percent}% (${loadedMB}/${totalMB} MB)`);
                  
                  if (updateActivity) {
                    updateActivity(`dropbox_downloading`, {
                      percent: percent,
                      loaded: loadedMB,
                      total: totalMB,
                      speed: calculateSpeed(progressEvent.loaded, Date.now())
                    });
                  }
                }
              } else {
                const mb = (progressEvent.loaded / 1024 / 1024).toFixed(1);
                console.log(`📥 Dropbox Downloaded: ${mb} MB`);
                if (updateActivity) {
                  updateActivity('dropbox_downloading_unknown_size', { loaded: mb });
                }
              }
            }
          });

          if (signal?.aborted) {
            throw new Error('Operation cancelled');
          }

          // Extract filename from Content-Disposition header or URL
          let filename = 'dropbox_download';
          const contentDisposition = response.headers['content-disposition'];
          
          if (contentDisposition) {
            const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (matches && matches[1]) {
              filename = matches[1].replace(/['"]/g, '');
            }
          } else {
            // Extract from URL path
            const urlPath = new URL(url).pathname;
            const pathSegments = urlPath.split('/');
            const lastSegment = pathSegments[pathSegments.length - 1];
            if (lastSegment && lastSegment.includes('.')) {
              filename = lastSegment;
            }
          }

          const filePath = path.join(downloadDir, filename);
          fs.writeFileSync(filePath, response.data);
          
          console.log(`✅ Direct download completed: ${filename}`);
          if (updateActivity) updateActivity('dropbox_download_complete', { filename, size: (response.data.length / 1024 / 1024).toFixed(1) + ' MB' });
          
          return resolve({ path: filePath, filename: filename });

        } catch (error) {
          if (signal?.aborted || error.message.includes('cancelled')) {
            console.log('⏹️ Dropbox direct download was cancelled');
            return resolve({
              success: false,
              cancelled: true,
              message: 'Dropbox download was cancelled. Chat is still active.'
            });
          }
          
          console.log('❌ Direct download failed:', error.message);
          console.log('🔄 Falling back to browser automation...');
          // Fall through to browser method
        }
      }

      let downloadInProgress = false;
      let downloadStartTime = null;
      
      // Add signal handler for browser cleanup
      if (signal) {
        signal.addEventListener('abort', async () => {
          console.log('⏹️ Cancelling Dropbox download...');
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
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
            message: 'Dropbox download was cancelled.'
          });
        });
      }

      // Enhanced download event handler with progress tracking
      page.once('download', async (download) => {
        console.log("🎯 Detected download event");
        clearTimeout(timeoutId);
        downloadInProgress = true;
        downloadStartTime = Date.now();

        if (signal?.aborted) {
          console.log('⏹️ Download cancelled before saving');
          await browser.close();
          return reject(new Error('Dropbox download was cancelled'));
        }

        const suggestedFilename = download.suggestedFilename();
        const savePath = path.join(downloadDir, suggestedFilename);

        console.log('📦 Download started:', download.url());
        if (updateActivity) updateActivity('dropbox_browser_download_started', { filename: suggestedFilename });

        // Track download progress for browser downloads
        let progressInterval;
        let lastSize = 0;
        
        try {
          // Start progress monitoring
          progressInterval = setInterval(async () => {

            if (signal?.aborted) {
              clearInterval(progressInterval);
              return;
            }
            try {
              if (fs.existsSync(savePath)) {
                const stats = fs.statSync(savePath);
                const currentSize = stats.size;
                const sizeMB = (currentSize / 1024 / 1024).toFixed(1);
                const speed = calculateDownloadSpeed(currentSize - lastSize, 1000); // 1 second interval
                
                console.log(`📥 Browser Download Progress: ${sizeMB} MB downloaded (${speed})`);
                
                if (updateActivity) {
                  updateActivity('dropbox_browser_downloading', {
                    downloaded: sizeMB,
                    speed: speed,
                    elapsed: formatTime((Date.now() - downloadStartTime) / 1000)
                  });
                }
                
                lastSize = currentSize;
              }
            } catch (err) {
              // File might not exist yet or be locked
            }
          }, 1000);

          // Save the download
          await download.saveAs(savePath);
          
          // Clear progress interval
          if (progressInterval) {
            clearInterval(progressInterval);
          }
          
          // Get final file size
          const finalStats = fs.existsSync(savePath) ? fs.statSync(savePath) : null;
          const finalSizeMB = finalStats ? (finalStats.size / 1024 / 1024).toFixed(1) : 'unknown';
          const totalTime = ((Date.now() - downloadStartTime) / 1000).toFixed(1);
          
          console.log(`✅ File saved to: ${savePath}`);
          console.log(`📊 Final size: ${finalSizeMB} MB, Time: ${totalTime}s`);
          
          if (updateActivity) {
            updateActivity('dropbox_download_complete', {
              filename: suggestedFilename,
              size: finalSizeMB + ' MB',
              duration: totalTime + 's'
            });
          }

          if (!signal?.aborted && !browserClosed) {
            try {
              await page.waitForTimeout(3000);
            } catch (e) {
              console.log('⚠️ Skipped waitForTimeout due to closed browser:', e.message);
            }

            try {
              browserClosed = true;
              await browser.close();
            } catch (e) {
              console.log('⚠️ Browser already closed:', e.message);
            }

            console.log("📦 Done.");
            resolve({ 
              path: savePath, 
              filename: suggestedFilename,
              size: finalSizeMB + ' MB',
              duration: totalTime + 's'
            });
          }
        } catch (downloadError) {
          if (progressInterval) {
            clearInterval(progressInterval);
          }
          
          if (signal?.aborted || downloadError.message.includes('cancelled')) {
            console.log('⏹️ Download was cancelled during save');
            resolve({
              success: false,
              cancelled: true,
              message: 'Dropbox download was cancelled.'
            });
          } else {
            console.error('❌ Download save error:', downloadError.message);
            reject(downloadError);
          }
        }
      });

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      // 🔗 Visit Dropbox file
      console.log('🌐 Navigating to Dropbox URL...');
      if (updateActivity) updateActivity('dropbox_loading_page');
      
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(3000);

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      
      // 🖱️ Step 1: Click the first "Download" button
      console.log('🔍 Looking for download button...');
      if (updateActivity) updateActivity('dropbox_finding_download_button');
      
      const downloadButton = await page.waitForSelector('button[data-dig-button="true"]:has-text("Download")', { timeout: 60000 });
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      
      console.log('🖱️ Clicking the main "Download" button...');
      if (updateActivity) updateActivity('dropbox_clicking_download');
      
      await downloadButton.click();

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      // ⏳ Step 2: Wait for and click "Or continue with download only"
      try {
        console.log('🔍 Looking for "continue with download only" button...');
        const continueButton = await page.waitForSelector('button[data-dig-button="true"]:has-text("continue with download only")', { timeout: 8000 });
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        console.log('🖱️ Clicking "Continue with download only"...');
        if (updateActivity) updateActivity('dropbox_continue_download');
        await continueButton.click();
      } catch (e) {
        if (signal?.aborted || e.message.includes('cancelled')) {
          throw new Error('Operation cancelled');
        }
        console.log('⚠️ "Continue with download only" button not found, maybe not needed.');
      }

      // ⏳ Safety timeout with progress updates
      if (updateActivity) updateActivity('dropbox_waiting_for_download');
      
      timeoutId = setTimeout(async () => {
        if (!downloadInProgress && !signal?.aborted && !browserClosed) {
          console.log('⌛ No download was triggered within 15 seconds. Closing browser...');
          if (updateActivity) updateActivity('dropbox_timeout');
          browserClosed = true;
          await browser.close();
          resolve({
            success: false,
            message: 'Download did not start within the expected time.',
            timeout: true
          });
        }
      }, 15000);

    } catch (err) {
      if (signal?.aborted || err.message.includes('cancelled')) {
        console.log('⏹️ Dropbox download operation was cancelled');
        if (browser && !browserClosed) {
          try {
            if (!browserClosed) {
              browserClosed = true;
              await browser.close();
            }
          } catch (e) {
            console.log('⚠️ Browser cleanup error (expected):', e.message);
          }
        }
        return resolve({
          success: false,
          cancelled: true,
          message: 'Dropbox download was cancelled.'
        });
      }
      console.error("❌ Dropbox handler error:", err.message);
      if (updateActivity) updateActivity('dropbox_error', { error: err.message });
      if (!browserClosed) {
        browserClosed = true;
        await browser.close();
      }
      reject(err);
    }
  });
}

// Helper function to calculate download speed
function calculateDownloadSpeed(bytes, timeMs) {
  if (timeMs === 0) return '0 KB/s';
  const bytesPerSecond = (bytes * 1000) / timeMs;
  
  if (bytesPerSecond < 1024) {
    return `${bytesPerSecond.toFixed(0)} B/s`;
  } else if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  } else {
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }
}

// Helper function to calculate speed for axios progress
let speedTracker = { lastTime: Date.now(), lastLoaded: 0 };
function calculateSpeed(loaded, currentTime) {
  const timeDiff = currentTime - speedTracker.lastTime;
  const loadedDiff = loaded - speedTracker.lastLoaded;
  
  if (timeDiff > 500) { // Update every 500ms
    const speed = calculateDownloadSpeed(loadedDiff, timeDiff);
    speedTracker.lastTime = currentTime;
    speedTracker.lastLoaded = loaded;
    return speed;
  }
  return '';
}

// Helper function to format time
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(0)}s`;
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }
}

module.exports = { handleDropboxDownload };