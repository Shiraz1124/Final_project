const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false }); // visible browser
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://accounts.google.com/');

  console.log('🔐 Please log in manually to your Google account...');
  console.log('⏳ You have 90 seconds to complete the login.');

  await page.waitForTimeout(90000); // wait 1.5 minutes

  // Save session to file
  const storage = await context.storageState();
  fs.writeFileSync('google-auth.json', JSON.stringify(storage));

  console.log('✅ Login session saved to google-auth.json');
  await browser.close();
})();
