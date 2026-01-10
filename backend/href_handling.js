

const { chromium } = require('playwright');

// Function to validate if a URL is actually a downloadable file
async function validateDownloadLink(page, url, linkText = '', signal) {
  try {
    console.log(`🔍 Validating: ${url}`);
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }
    
    // Check if it's a cloud storage link (these are always valid download sources)
    const isCloudStorage = /drive\.google\.com|1drv\.ms|dropbox\.com|onedrive\.live\.com/i.test(url);
    
    if (isCloudStorage) {
      console.log(`   ☁️ Cloud storage link detected - auto-validating`);
      return {
        isValid: true,
        score: 5,
        details: { isCloudStorage: true },
        headers: {}
      };
    }
     if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }
    // Method 1: HEAD request to check Content-Type and Content-Disposition
    const response = await page.request.head(url).catch(() => null);
    
    if (response) {
      const headers = response.headers();
      const contentType = headers['content-type'] || '';
      const contentDisposition = headers['content-disposition'] || '';
      const contentLength = headers['content-length'] || '';
      
      console.log(`   📊 Content-Type: ${contentType}`);
      console.log(`   📋 Content-Disposition: ${contentDisposition}`);
      console.log(`   📏 Content-Length: ${contentLength}`);
      
      // Check for download indicators in headers
      const isDownloadHeader = contentDisposition.includes('attachment') || 
                              contentDisposition.includes('filename');
      
      // Check for binary/application content types
      const isBinaryType = contentType.includes('application/') ||
                          contentType.includes('application/octet-stream') ||
                          contentType.includes('application/zip') ||
                          contentType.includes('application/x-') ||
                          contentType.includes('binary/') ||
                          contentType === '' || // Sometimes downloads have no content-type
                          contentType.includes('text/plain'); // Some files are served as text/plain
      
      // Check if it's NOT a webpage
      const isNotWebpage = !contentType.includes('text/html') &&
                          !contentType.includes('application/json') &&
                          !contentType.includes('text/xml');
      
      const validationScore = {
        hasDownloadHeader: isDownloadHeader,
        isBinaryType: isBinaryType,
        isNotWebpage: isNotWebpage,
        hasContentLength: contentLength && parseInt(contentLength) > 0,
        statusOk: response.status() === 200
      };
      
      const score = Object.values(validationScore).filter(Boolean).length;
      
      console.log(`   ✅ Validation score: ${score}/5`);
      console.log(`   📝 Details:`, validationScore);
      
      return {
        isValid: score >= 2, // At least 2 positive indicators
        score: score,
        details: validationScore,
        headers: headers
      };
    }
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }
    // Method 2: If HEAD request fails, try a quick GET with range header
    console.log(`   ⚠️ HEAD request failed, trying partial GET...`);
    
    const partialResponse = await page.request.get(url, {
      headers: { 'Range': 'bytes=0-1023' } // Get first 1KB
    }).catch(() => null);
    
    if (partialResponse) {
      const headers = partialResponse.headers();
      const contentType = headers['content-type'] || '';
      const acceptRanges = headers['accept-ranges'] || '';
      
      const isPartialContent = partialResponse.status() === 206;
      const acceptsByteRanges = acceptRanges.includes('bytes');
      const isBinaryType = !contentType.includes('text/html');
      
      console.log(`   📊 Partial request - Content-Type: ${contentType}`);
      console.log(`   📊 Accept-Ranges: ${acceptRanges}`);
      console.log(`   📊 Status: ${partialResponse.status()}`);
      
      const validationScore = {
        isPartialContent: isPartialContent,
        acceptsByteRanges: acceptsByteRanges,
        isBinaryType: isBinaryType,
        statusOk: partialResponse.status() === 200 || partialResponse.status() === 206
      };
      
      const score = Object.values(validationScore).filter(Boolean).length;
      
      return {
        isValid: score >= 2,
        score: score,
        details: validationScore,
        headers: headers
      };
    }
    
    console.log(`   ❌ Could not validate URL`);
    return { isValid: false, score: 0, details: {}, headers: {} };
    
  } catch (error) {
    console.log(`   ❌ Validation error: ${error.message}`);
    return { isValid: false, score: 0, details: {}, headers: {} };
  }
}

async function handleHrefDownload(url, signal, updateActivity = null, operationId = null) {
  console.log("📥 Starting href download:", url);
  if (updateActivity) updateActivity('href_analysis_init');

  return new Promise(async (resolve, reject) => {
    if (signal?.aborted) {
  throw new Error('Operation cancelled before starting');
}
    let browserClosed = false;
    
    // Extensions that typically indicate downloadable files
    const fileExtensions = /\.(exe|zip|rar|7z|msi|pdf|dmg|tar|gz|apk|deb|rpm|pkg|iso|img|bin)$/i;
    // Keywords that might indicate a download
    const downloadKeywords = /download|dowonload|get[\s-]file|get[\s-]it|zip|rar|exe|zip\.file|drive\.google|1drv|dropbox/i;
    // Cloud storage URL patterns
    const cloudStorageUrls = /drive\.google\.com|1drv\.ms|dropbox\.com|onedrive\.live\.com/i;
    
    let browser;
    
    try {
      if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
      // Launch browser
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      // Add signal handler for browser cleanup
      if (signal) {
          signal.addEventListener('abort', async () => {
            console.log('⏹️ Cancelling href download...');
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
              message: 'Download search was cancelled. Chat is still active.'
            });
          });
        }

      if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
      // Navigate to your target URL
      await page.goto(url);
      await page.goto(url);
      await page.waitForTimeout(1000); // Give page time to fully load
      if (updateActivity) updateActivity('href_page_loaded');
      
      console.log('🔎 Scanning for downloadable links using multiple detection methods...\n');
      
      // Store all found links
      let foundLinks = [];
      
      // 1. Standard <a href="..."> links with download text or extensions
      console.log('📋 Checking standard <a> tags...');
      const standardLinks = await page.$$('a[href]');
      for (const link of standardLinks) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const href = await link.getAttribute('href');
        const text = await link.innerText().catch(() => '');
        const html = await link.innerHTML().catch(() => '');
        
        if (href && (
          fileExtensions.test(href) || 
          downloadKeywords.test(text) || 
          downloadKeywords.test(html) ||
          cloudStorageUrls.test(href)
        )) {
          const fullUrl = new URL(href, page.url()).toString();
          foundLinks.push({ 
            url: fullUrl, 
            text: text || 'No text', 
            type: 'Standard link'
          });
        }
      }
       if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      // 2. Links inside div containers
      console.log('📋 Checking links inside divs...');
      const divLinks = await page.$$('div a[href]');
      for (const link of divLinks) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const href = await link.getAttribute('href');
        if (href && !foundLinks.some(l => l.url === href)) {
          const text = await link.innerText().catch(() => '');
          if (fileExtensions.test(href) || downloadKeywords.test(text) || cloudStorageUrls.test(href)) {
            const fullUrl = new URL(href, page.url()).toString();
            foundLinks.push({ 
              url: fullUrl, 
              text: text || 'No text', 
              type: 'Link in div'
            });
          }
        }
      }
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      // 3. Images inside links that might be download buttons
      console.log('📋 Checking image links...');
      const imageLinks = await page.$$('a > img, a:has(img)');
      for (const imgLink of imageLinks) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const parent = await imgLink.$('xpath=./ancestor::a');
        if (parent) {
          const href = await parent.getAttribute('href');
          if (href && !foundLinks.some(l => l.url === href)) {
            const alt = await imgLink.getAttribute('alt') || '';
            const title = await parent.getAttribute('title') || '';
            if (fileExtensions.test(href) || 
                downloadKeywords.test(alt) || 
                downloadKeywords.test(title) ||
                cloudStorageUrls.test(href)) {
              const fullUrl = new URL(href, page.url()).toString();
              foundLinks.push({ 
                url: fullUrl, 
                text: alt || title || 'Image link', 
                type: 'Image link'
              });
            }
          }
        }
      }
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      // 4. Button elements with onclick handlers
      console.log('📋 Checking buttons with onclick...');
      const buttons = await page.$$('button[onclick*="location.href"], input[type="button"][onclick*="location.href"]');
      for (const button of buttons) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const onclick = await button.getAttribute('onclick');
        if (onclick) {
          // Extract URL from location.href='...'
          const match = onclick.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
          if (match && match[1]) {
            const href = match[1];
            if (fileExtensions.test(href)) {
              const fullUrl = new URL(href, page.url()).toString();
              const text = await button.innerText().catch(() => 'Button');
              foundLinks.push({ 
                url: fullUrl, 
                text: text || 'Button link', 
                type: 'Button onclick'
              });
            }
          }
        }
      }
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      // 5. Check for iframe sources that might be file downloads
      console.log('📋 Checking iframes...');
      const iframes = await page.$$('iframe[src]');
      for (const iframe of iframes) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const src = await iframe.getAttribute('src');
        if (src && fileExtensions.test(src)) {
          const fullUrl = new URL(src, page.url()).toString();
          foundLinks.push({ 
            url: fullUrl, 
            text: 'Iframe source', 
            type: 'Iframe'
          });
        }
      }
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      // 6. Check table cells that might contain links (for nested tables)
      console.log('📋 Checking table cells with links...');
      const tableCells = await page.$$('td');
      for (const cell of tableCells) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const links = await cell.$$('a[href]');
        for (const link of links) {
          const href = await link.getAttribute('href');
          if (href && (fileExtensions.test(href) || cloudStorageUrls.test(href)) && 
              !foundLinks.some(l => l.url === href)) {
            const text = await link.innerText().catch(() => '');
            const fullUrl = new URL(href, page.url()).toString();
            foundLinks.push({ 
              url: fullUrl, 
              text: text || 'Table cell link', 
              type: 'Table link'
            });
          }
        }
      }
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      // 7. Last attempt: Direct XPath for any element with href attribute containing file extensions
      console.log('📋 Final check for any elements with file extensions...');
      for (const ext of ['exe', 'zip', 'rar', '7z', 'msi', 'pdf', 'dmg', 'tar', 'gz', 'apk', 'deb', 'rpm', 'pkg', 'iso', 'img', 'bin']) {
        if (signal?.aborted) {
          throw new Error('Operation cancelled');
        }
        const xpathLinks = await page.$$(`//*[contains(@href, '.${ext}')]`);
        for (const link of xpathLinks) {
          const href = await link.getAttribute('href');
          if (href && !foundLinks.some(l => l.url === href)) {
            const text = await link.innerText().catch(() => '');
            const fullUrl = new URL(href, page.url()).toString();
            foundLinks.push({ 
              url: fullUrl, 
              text: text || `File.${ext}`, 
              type: 'XPath found'
            });
          }
        }
      }

      // Remove duplicate links based on URL
      foundLinks = foundLinks.filter((link, index, self) => 
        index === self.findIndex((l) => l.url === link.url)
      );
      
      // Filter out the input URL from the results
      const originalFoundCount = foundLinks.length;
      foundLinks = foundLinks.filter(link => link.url !== url);
      
      if (originalFoundCount > foundLinks.length) {
        console.log(`🗑️ Filtered out ${originalFoundCount - foundLinks.length} link(s) matching input URL`);
      }
      
      if (signal?.aborted) {
  throw new Error('Operation cancelled');
}
      // NEW: Validate each found link
      console.log(`\n🔍 Validating ${foundLinks.length} found links...`);
      if (updateActivity) updateActivity('href_validation_start');
      
      const validatedLinks = [];
      
      for (const link of foundLinks) {
        const validation = await validateDownloadLink(page, link.url, link.text);
        
        if (validation.isValid) {
          validatedLinks.push({
            ...link,
            validation: validation
          });
          console.log(`   ✅ VALID: ${link.text} (Score: ${validation.score}/5)`);
        } else {
          console.log(`   ❌ INVALID: ${link.text} (Score: ${validation.score}/5)`);
        }
      }
      
      // Update foundLinks to only include validated ones
      foundLinks = validatedLinks;

      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }
      
      // Display results
      console.log(`\n✅ Validation complete. Found ${foundLinks.length} verified downloadable links:`);
      if (updateActivity) updateActivity('href_validation_complete');
      
      if (foundLinks.length === 0) {
        console.log('❌ No verified downloadable links found.');
        if (!browserClosed) {
          browserClosed = true;
          await browser.close();
        }
        //return reject(new Error('No verified downloadable links found'));
        return resolve(null);
      } else if (foundLinks.length === 1) {
        console.log('🔗 Found 1 verified downloadable link:');
        console.log(`📦 ${foundLinks[0].text} (${foundLinks[0].type}): ${foundLinks[0].url}`);
        console.log(`   📊 Validation score: ${foundLinks[0].validation.score}/5`);
        
        const result = {
            success: true,
            single: true,
            url: foundLinks[0].url,
            validation: foundLinks[0].validation
          };
          return resolve(result);
      } else {
        console.log(`🔗 Found ${foundLinks.length} verified downloadable links:`);
        
        // Show all links with numbers and validation scores
        foundLinks.forEach((link, index) => {
          console.log(`${index + 1}. 📦 ${link.text} (${link.type}) - Score: ${link.validation.score}/5`);
          console.log(`   🔗 ${link.url}`);
        });
        
        console.log('\n⚠️ Multiple verified links found. Please choose which one to click manually.');
        
        const result = {
          success: true,
          multiple: true,
          links: foundLinks
        };
        if (!browserClosed) {
          browserClosed = true;
          await browser.close();
        }
        return resolve(result);
      }
    } catch (err) {
        if (signal?.aborted || err.message.includes('cancelled')) {
        console.log('⏹️ Href download operation was cancelled');
        if (browser) {
          try {
            await browser.close();
          } catch (closeErr) {}
        }
        return resolve(null);
      }
      console.error('❌ Error in handleHrefDownload:', err.message);
      if (browser) {
        try {
          await browser.close();
        } catch (closeErr) {
          console.error('Error closing browser:', closeErr.message);
        }
      }
      return resolve(null);
    }
  });
}

module.exports = { handleHrefDownload };