const { handleURL } = require('../../file_handler');

describe('FT-002: Invalid URL Input Handling', () => {
  const invalidUrls = [
    { url: '', expectedError: 'No URL provided' },
    { url: 'justtextwithoutprotocol', expectedError: 'Invalid URL format' },
    { url: 'ftp://unsupported-protocol.com/file.exe', expectedError: 'Unsupported protocol' },
    { url: 'https://invalid_domain.com', expectedError: 'Invalid URL format' }, // Should be caught by validation
    { url: 'http://missing-colon.com', expectedError: 'Invalid URL format' }, // Should be caught by validation
    { url: 'https://', expectedError: 'Invalid URL format' },
  ];

  test.each(invalidUrls)(
    'should return an error message for invalid URL: $url',
    async ({ url, expectedError }) => {
      const result = await handleURL(url, true);

      // Assertions
      expect(result.success).toBe(false);
      expect(result.error).toBe(expectedError);
      expect(result.message).toBeTruthy(); // Just check that message exists
    }
  );
});



afterAll(async () => {
    if (global.browser && typeof global.browser.close === 'function') {
      await global.browser.close();
      console.log('🧹 Global browser closed after all tests.');
    }
  });