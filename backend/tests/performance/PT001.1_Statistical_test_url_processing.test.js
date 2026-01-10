const { handleURL } = require('../../file_handler');
const urls = require('../urls.json');
const { performance } = require('perf_hooks');

jest.setTimeout(600000 * 2); // 20 minutes total Jest timeout

describe('PT-001.3 - 60 URL test with 10-min timeout, 5-min performance check', () => {
  it('should process at least 90% of URLs in ≤ 5 minutes', async () => {
    const safeSamples = urls.safe.slice(0, 30);
    const maliciousSamples = urls.malicious.slice(0, 30);
    const testSet = [...safeSamples, ...maliciousSamples];

    const results = await Promise.allSettled(
      testSet.map(async (url) => {
        const start = performance.now();

        try {
          await Promise.race([
            handleURL(url, true),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout: Exceeded 10 minutes')), 10 * 60 * 1000)
            )
          ]);

          const end = performance.now();
          return {
            url,
            duration: end - start,
            success: true
          };
        } catch (err) {
          const end = performance.now();
          return {
            url,
            duration: end - start,
            success: false,
            error: err.message
          };
        }
      })
    );

    const durations = results.map(r =>
      r.status === 'fulfilled' ? r.value : r.reason
    );

    let fastCount = 0;
    let totalCount = durations.length;

    durations.forEach((res, i) => {
      const seconds = (res.duration / 1000).toFixed(2);
      const status = res.success ? '✅' : '❌';
      const fast = res.duration <= 5 * 60 * 1000;
      if (res.success && fast) fastCount++;
      const speed = fast ? '🟢 FAST' : '🔴 SLOW';

      console.log(`${status} [${i + 1}] ${res.url.substring(0, 60)}...`);
      console.log(`    Duration: ${seconds}s | ${speed}`);
      if (!res.success) {
        console.log(`    ⚠️ Error: ${res.error}`);
      }
    });

    const percentage = (fastCount / totalCount) * 100;
    console.log(`\n📊 ${fastCount}/${totalCount} URLs completed in ≤ 5 minutes (${percentage.toFixed(1)}%)`);

    expect(percentage).toBeGreaterThanOrEqual(90);
  });
});
