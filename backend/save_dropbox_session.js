const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });

  const context = await browser.newContext({
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  const page = await context.newPage();

  // Open Dropbox login page
  await page.goto('https://www.dropbox.com/login', { waitUntil: 'domcontentloaded' });

  console.log('🔐 Please log in to your Dropbox account in the browser window.');
  console.log('⏳ You have 90 seconds...');

  // Give user time to log in manually
  await page.waitForTimeout(90000); // 1.5 minutes

  // Save login session state to file
  const storage = await context.storageState();
  fs.writeFileSync('dropbox-auth.json', JSON.stringify(storage));

  console.log('✅ Dropbox session saved to dropbox-auth.json');
  await browser.close();
})();
