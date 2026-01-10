const { handleURL } = require('../../file_handler');
const { performance } = require('perf_hooks');
const fs = require('fs');

const urls = JSON.parse(fs.readFileSync(require.resolve('../urls.json')));
const CONCURRENT_USERS = 100;
const MIN_SUCCESS_RATE = 80;

jest.setTimeout(CONCURRENT_USERS * 10 * 60 * 1000); // ⏳ Allow 10 min per scan

describe('PT-006 Stress Test: 100 Concurrent Users', () => {
  it(`should handle ≥ ${MIN_SUCCESS_RATE}% of requests successfully`, async () => {
    console.log(`🚀 Starting PT-006 Stress Test with ${CONCURRENT_USERS} concurrent users`);

    const originalUrls = urls.slice(0, 60);
    const testUrls = Array.from({ length: CONCURRENT_USERS }, (_, i) => originalUrls[i % originalUrls.length]);

    const startTime = performance.now();

    const results = await Promise.allSettled(
      testUrls.map(async (url, i) => {
        try {
          const result = await handleURL(url);
          if (result?.path && result?.filename) {
            console.log(`✅ [${i}] Success`);
            return { success: true };
          } else {
            console.warn(`⚠️ [${i}] Incomplete result`);
            return { success: false };
          }
        } catch (err) {
          console.error(`❌ [${i}] Error: ${err.message}`);
          return { success: false };
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    const successRate = (successCount / CONCURRENT_USERS) * 100;

    const endTime = performance.now();
    console.log(`⏱️ Total time: ${(endTime - startTime) / 1000}s`);
    console.log(`✅ Success rate: ${successRate.toFixed(2)}%`);

    expect(successRate).toBeGreaterThanOrEqual(MIN_SUCCESS_RATE);
  });
});
