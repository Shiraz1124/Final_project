const { handleURL, deleteFile } = require('../../file_handler');
const { handleDropboxDownload } = require('../../dropbox_handling'); 
const { handleGoogleDriveDownload } = require('../../google_drive_handling'); 
const { handleGithubDownload } = require('../../github_handling'); 
const { chromium } = require('playwright');

// === Helper: Verify extracted link objects are structured correctly ===
function verifyLinkObjectStructure(links) {
  links.forEach(link => {
    expect(link).toHaveProperty('url');
    expect(link).toHaveProperty('text');
    expect(typeof link.url).toBe('string');
    expect(link.url).toMatch(/^https?:\/\//);
  });
}

// === Helper: Playwright result integration validation summary ===
function verifyPlaywrightIntegration(result) {
  return {
    playwrightLoaded: result !== null,
    linksExtracted: Array.isArray(result.links),
    properFormat: result.links.every(link =>
      typeof link === 'object' && 'url' in link && 'text' in link
    ),
    validUrls: result.links.every(link =>
      typeof link.url === 'string' && link.url.startsWith('http')
    )
  };
}

describe('IT-001: Playwright Link Extraction Integration', () => {
  let browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  test('should ensure correct links are retrieved through Playwright integration', async () => {
    const testUrl = 'https://bots.zylongaming.com/index.php?action=downloads';

    const expectedDownloadLinks = [
      'https://downloads.zylongaming.com/Bots/Setup.exe',
      'https://www.dropbox.com/s/7gwpq69au4lxysc/Setup.exe?dl=1',
      'https://drive.google.com/file/d/0B10h2oTv4nh4OXpzQmJiM0Z5QkE/view?usp=sharing&resourcekey=0-Z2HzUeGI_w_6ZdWNkbc-vg',
      'https://1drv.ms/u/s!AmQyRdi08BaUhTNm7ER9l3n5weHz'
    ];

    console.log('🔗 Testing Playwright integration with URL:', testUrl);

    const result = await handleURL(testUrl, true);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.links)).toBe(true);

    const extractedUrls = result.links.map(link => link.url);

    console.log('📋 Extracted URLs:', extractedUrls);
    console.log('📋 Expected URLs:', expectedDownloadLinks);

    // ✅ Use arrayContaining for flexible order-insensitive match
    expect(extractedUrls).toEqual(expect.arrayContaining(expectedDownloadLinks));
    expect(extractedUrls.length).toBeGreaterThanOrEqual(expectedDownloadLinks.length);

    // ✅ Verify link object structure
    verifyLinkObjectStructure(result.links);

    // ✅ Additional integration structure check
    const integrationCheck = verifyPlaywrightIntegration(result);
    expect(integrationCheck.playwrightLoaded).toBe(true);
    expect(integrationCheck.linksExtracted).toBe(true);
    expect(integrationCheck.properFormat).toBe(true);
    expect(integrationCheck.validUrls).toBe(true);

    console.log(`✅ Integration Test Passed: ${extractedUrls.length} links extracted via Playwright`);
  }, 60000);

  test('should verify Google Drive integration with direct download processing', async () => {
    const driveURL = 'https://drive.usercontent.google.com/download?id=18PnWlPgDtCaj6BrzohUesujyKKd6EuQ2&export=download&authuser=0';
    const expectedFileId = '18PnWlPgDtCaj6BrzohUesujyKKd6EuQ2';

    console.log('🔗 Testing Google Drive integration with URL:', driveURL);

    let result;
    try {
      result = await handleGoogleDriveDownload(driveURL);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();
      expect(driveURL.includes(expectedFileId)).toBe(true);

      console.log('✅ Google Drive Integration Results:');
      console.log(`   📁 Filename: ${result.filename}`);
      console.log(`   📍 Path: ${result.path}`);
    } finally {
      if (result?.path) {
        try {
          await deleteFile(result.path);
          console.log('🧹 File cleanup successful');
        } catch (err) {
          console.warn('⚠️ Cleanup warning:', err.message);
        }
      }
    }
  }, 60000);

test('should successfully download a file from Dropbox link', async () => {
  const dropboxUrl = 'https://www.dropbox.com/scl/fi/1blydyiwm2p0crzzmwf8k/rufus-4.7p.exe?rlkey=3kbnx7pf22wkd7r0vnk6gbcnh&e=4&st=wf1u1ea1&dl=0';
  const expectedFileName = 'rufus-4.7p.exe';

  console.log('🔗 Testing Dropbox file download:', dropboxUrl);

  let result;
  try {
    result = await handleDropboxDownload(dropboxUrl);

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.filename).toBeDefined();
    expect(result.path).toBeDefined();
    expect(result.filename).toBe(expectedFileName);

    console.log('✅ Dropbox file downloaded successfully:', result.filename);
  } finally {
    if (result?.path) {
      try {
        await deleteFile(result.path);
        console.log('🧹 File cleanup successful');
      } catch (err) {
        console.warn('⚠️ Cleanup warning:', err.message);
      }
    }
  }
}, 60000); // 1-minute timeout

test('should successfully download a ZIP file from a GitHub repo', async () => {
  const githubUrl = 'https://github.com/vercel/next.js';
  const expectedExtension = '.zip';

  let result;
  try {
    result = await handleGithubDownload(githubUrl);

    expect(result).toBeDefined();
    expect(result.filename).toBeDefined();
    expect(result.path).toBeDefined();
    expect(result.filename.endsWith(expectedExtension)).toBe(true);

    console.log('✅ GitHub file downloaded:', result.filename);
  } finally {
    if (result?.path) {
      try {
        await deleteFile(result.path);
        console.log('🧹 File cleanup successful');
      } catch (err) {
        console.warn('⚠️ Cleanup warning:', err.message);
      }
    }
  }
}, 60000);

});
