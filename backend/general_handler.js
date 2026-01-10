

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function handleGeneralURLDownload(url, signal, updateActivity = null, operationId = null) {
  console.log("📥 Starting General URL download:", url);
  if (updateActivity) updateActivity('general_handler_init');

  return new Promise(async (resolve, reject) => {

     if (signal?.aborted) {
      throw new Error('Operation cancelled before starting');
    }

    let browserClosed = false;
    let progressInterval = null;
    const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

     if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
    const browser = await chromium.launch({ headless: true });
    let result = null; // Initialize as null
    let downloadStarted = false;
    let downloadProgress = 0;
    let downloadSize = 0;
    let downloadedBytes = 0;

    try {

      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      // Track download events
      page.on('download', async (download) => {
        if (signal?.aborted) {
          console.log('⏹️ Download event cancelled');
          return;
        }
        downloadStarted = true;
        console.log('📥 Download started:', download.suggestedFilename());
        if (updateActivity) updateActivity('download_started', { 
          filename: download.suggestedFilename() 
        });
      });

      // Track page responses to monitor download progress
      page.on('response', async (response) => {
        const contentLength = response.headers()['content-length'];
        if (contentLength && response.url().includes('download')) {
          downloadSize = parseInt(contentLength);
          console.log(`📊 Expected download size: ${(downloadSize / 1024 / 1024).toFixed(2)} MB`);
          if (updateActivity) updateActivity('download_size_detected', { 
            size: downloadSize,
            sizeFormatted: `${(downloadSize / 1024 / 1024).toFixed(2)} MB`
          });
        }
      });


       // Add signal handler for browser cleanup
      if (signal) {
        signal.addEventListener('abort', async () => {
          console.log('⏹️ Cancelling general URL download...');
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
            message: 'General download was cancelled. Chat is still active.'
          });
        });
      }

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        if (updateActivity) updateActivity('general_page_loaded');
      } catch (err) {
        if (signal?.aborted || err.message.includes('cancelled')) {
          throw new Error('Operation cancelled');
        }
        console.log('⚠️ Navigation error:', err.message);
        if (!browserClosed) {
            browserClosed = true;
            await browser.close();
          }
        return resolve(null);
      }

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      try {
        const allElements = await page.$$('body *');
        const clickableElements = [];

        for (const el of allElements) {
           if (signal?.aborted) {
            throw new Error('Operation cancelled');
          }
          try {
            const info = await el.evaluate((node) => {
              const attrs = Array.from(node.attributes).map(attr => `${attr.name}="${attr.value}"`).join(' ');
              return {
                tag: node.tagName,
                text: node.innerText?.trim().slice(0, 100) || '',
                attrs,
                hasDownload: (
                  node.innerText?.toLowerCase().includes('download') ||
                  attrs.toLowerCase().includes('download')
                )
              };
            });

            if (info.hasDownload) {
              clickableElements.push(el);
              console.log('🔎 Found Element:');
              console.log(`   🏷️ Tag      : ${info.tag}`);
              console.log(`   📝 Text     : "${info.text}"`);
              console.log(`   🧩 Attributes: ${info.attrs}`);
              console.log('-------------------------------');
            }
          } catch (err) {
            // Skip elements that can't be evaluated
            continue;
          }
        }

        console.log(`\n✅ Total clickable elements with "download": ${clickableElements.length}\n`);

        // If no clickable elements with download, return null immediately
        if (clickableElements.length === 0) {
          if (!browserClosed) {
            browserClosed = true;
            await browser.close();
          }
          return resolve(null);
        }
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }

        // Just return null if anything goes wrong
        try {
          let downloadedSuccessfully = false;

          for (const el of clickableElements) {
            if (signal?.aborted) {
              throw new Error('Operation cancelled');
            }
            try {
              // Try to find clickable element - if it fails, just continue
              const clickable = await el.evaluateHandle((node) => {
                while (node && node !== document.body) {
                  const tag = node.tagName.toLowerCase();
                  const isClickable =
                    tag === 'a' ||
                    tag === 'button' ||
                    node.hasAttribute('onclick') ||
                    getComputedStyle(node).cursor === 'pointer';

                  if (isClickable) return node;
                  node = node.parentElement;
                }
                return null;
              }).catch(() => null);

              // If no clickable element, continue to next
              if (!clickable) {
                console.log('⚠️ No clickable parent found for this element.');
                continue;
              }
              if (signal?.aborted) {
                throw new Error('Operation cancelled');
              }

              console.log('🖱️ Clicking the closest clickable parent element...');
              if (updateActivity) updateActivity('attempting_download');
              
             const downloadPromise = new Promise(async (resolveDownload) => {
            const download = await page.waitForEvent('download', { timeout: 10000 })
              .catch(() => {
                console.log('⚠️ Download timeout - no download triggered');
                return null;
              });

            if (!download) {
              return resolveDownload(null);
            }

            const filename = download.suggestedFilename();
            const filePath = path.join(DOWNLOAD_DIR, filename);
            
            console.log(`📥 Downloading: ${filename}`);
            if (updateActivity) updateActivity('download_in_progress', { 
              filename,
              status: 'downloading'
            });

            // Save the download and track completion
            try {
              await download.saveAs(filePath);
              
              // Get final file size
              const stats = fs.statSync(filePath);
              const finalSize = stats.size;
              
              console.log(`✅ File saved: ${filename}`);
              console.log(`📊 Final size: ${(finalSize / 1024 / 1024).toFixed(2)} MB`);
              
              if (updateActivity) updateActivity('download_completed', { 
                filename,
                size: finalSize,
                sizeFormatted: `${(finalSize / 1024 / 1024).toFixed(2)} MB`,
                path: filePath
              });

              resolveDownload({ path: filePath, filename, size: finalSize });
            } catch (saveError) {
              console.log('⚠️ Error saving download:', saveError.message);
              if (updateActivity) updateActivity('download_failed', { 
                filename,
                error: saveError.message
              });
              resolveDownload(null);
            }
          });

              // Try to click - if it fails, just continue to next element
              try {
                await page.evaluate(el => el.click(), clickable)
                  .catch(() => console.log('⚠️ Click failed - trying next element'));
              } catch (err) {
                if (signal?.aborted || err.message.includes('cancelled')) {
                  throw new Error('Operation cancelled');
                }
                console.log('⚠️ Click failed:', err.message);
                continue;
              }

               if (signal?.aborted) {
                throw new Error('Operation cancelled');
              }

             const downloadResult = await downloadPromise;
            if (!downloadResult) {
              console.log('❌ No download was triggered or failed');
              continue;
            }

            if (signal?.aborted) {
              throw new Error('Operation cancelled');
            }

            console.log("📦 Resolving with file:", downloadResult.filename);
            result = downloadResult;

              downloadedSuccessfully = true;
              break; // Stop after first successful download
            } catch (err) {
              if (signal?.aborted || err.message.includes('cancelled')) {
                throw new Error('Operation cancelled');
              }
              console.log('⚠️ Error processing element:', err.message);
              continue; // Continue to next element
            }
          }

          if (downloadedSuccessfully) {
            console.log('⏳ Download complete.');
            await page.waitForTimeout(1000);
           if (!browserClosed) {
              browserClosed = true;
              await browser.close();
            }
            return resolve(result);
          } else {
            console.log('⚠️ No successful downloads detected.');
            if (updateActivity) updateActivity('no_downloads_found');
            if (!browserClosed) {
              browserClosed = true;
              await browser.close();
            }
            return resolve(null);
          }
        } catch (err) {
          if (signal?.aborted || err.message.includes('cancelled')) {
            throw new Error('Operation cancelled');
          }
          console.log('⚠️ Error during click process:', err.message);
          if (updateActivity) updateActivity('download_error', { error: err.message });
          if (!browserClosed) {
            browserClosed = true;
            await browser.close();
          }
          return resolve(null);
        }
      } catch (err) {
        if (signal?.aborted || err.message.includes('cancelled')) {
          throw new Error('Operation cancelled');
        }
        console.log('⚠️ Error processing page:', err.message);
       if (!browserClosed) {
          browserClosed = true;
          await browser.close();
        }
        return resolve(null);
      }
    } catch (err) {
      if (signal?.aborted || err.message.includes('cancelled')) {
        console.log('⏹️ General URL download operation was cancelled');
        if (browser) {
          try {
            await browser.close();
          } catch (e) {}
        }
        return resolve(null);
      }
      console.error("❌ General download handler error:", err.message);
      try {
        if (!browserClosed) {
          browserClosed = true;
          await browser.close();
        }
      } catch (e) {}
      return resolve(null);
    }
  });
}

module.exports = { handleGeneralURLDownload };
 //'https://www.nexon.com/maplestory/'