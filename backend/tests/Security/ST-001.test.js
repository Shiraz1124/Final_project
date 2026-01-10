const { handleURL } = require('../../file_handler');
const { spawn } = require('child_process');
const path = require('path');


let scanBackendProcess;

beforeAll((done) => {
  console.log('🚀 Launching Antivirus Scan Backend...');

  const backendPath = path.join(__dirname, '../../Antivirus_backend/AntivirusAPIs_server.js');
  scanBackendProcess = spawn('node', [backendPath], {
    stdio: 'inherit',
    shell: true
  });

  setTimeout(() => {
    console.log('✅ Antivirus backend should be ready.');
    done();
  }, 5000); // wait 5 seconds
}, 15000); // beforeAll timeout

afterAll(() => {
  if (scanBackendProcess) {
    console.log('🛑 Stopping Antivirus backend...');
    scanBackendProcess.kill();
  }
});

describe('ST-001: Scan a malicious file', () => {
  test('should detect a known malware file and flag it as Malicious', async () => {
    const knownMaliciousURL = 'https://secure.eicar.org/eicar_com.zip'; 

    const result = await handleURL(knownMaliciousURL, false);

    expect(result.success).toBe(true);
    expect(result.scan_result).toBeDefined();
    expect(result.scan_result.verdict).toBeDefined();

    const verdict = result.scan_result.verdict.verdict;
    console.log('🧪 Verdict:', verdict);

    expect(verdict).toBe('Malicious');
  }, 300000); // ⏱ 5-minute timeout for scan
});


describe('ST-001: Scan a suspicious file', () => {
    test('should detect a suspicious file and flag it as Suspicious', async () => {
      const suspiciousURL = 'magnet:?xt=urn:btih:FB8EC952689B88F5A98C0A59229A8CBEC52AD9AD&dn=BarTender+v11.4.7%2B+Crack&tr=http%3A%2F%2Fbt.poletracker.org%3A2710%2Fannounce&tr=http%3A%2F%2Ftracker.vanitycore.co%3A6969%2Fannounce&tr=http%3A%2F%2Fwww.torrentsnipe.info%3A2701%2Fannounce&tr=http%3A%2F%2Ftracker.ipv6tracker.org%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.tiny-vps.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.open-internet.nl%3A6969%2Fannounce&tr=udp%3A%2F%2Fopen.demonii.si%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Fdenis.stalker.upeer.me%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce'; // EICAR test file
  
      const result = await handleURL(suspiciousURL, false);
  
      expect(result.success).toBe(true);
      expect(result.scan_result).toBeDefined();
      expect(result.scan_result.verdict).toBeDefined();
  
      const verdict = result.scan_result.verdict.verdict;
      console.log('🧪 Verdict:', verdict);
  
      // Accept either Suspicious or Malicious depending on AV behavior
      expect(['Suspicious', 'Malicious']).toContain(verdict);
    }, 600000); // ⏱ 10-minute timeout
  });
  