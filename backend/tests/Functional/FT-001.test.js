const {handleURL, deleteFile} = require('../../file_handler');
const {handleDropboxDownload} = require('../../dropbox_handling');
const {handleGeneralURLDownload} = require('../../general_handler');
const {handleGithubDownload} = require('../../github_handling');
const {handleGoogleDriveDownload} = require('../../google_drive_handling');
const {handleMegaNZDownload} = require('../../mega_nz_handling');
const {handleOneDriveDownload} = require('../../OneDrive_handling');


describe('FT-001: Direct Download URL Handler', () => {
    const testUrl = 'https://get.videolan.org/vlc/3.0.18/win64/vlc-3.0.18-win64.exe';
    
    test('should successfully handle direct download URL', async () => {
      const result = await handleURL(testUrl, true);
      
      expect(result).not.toBeNull(); 
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }
    }, 600000);
  });

  describe('FT-001: Dropbox Download URL Handler', () => {
    const testUrl = 'https://www.dropbox.com/scl/fi/1blydyiwm2p0crzzmwf8k/rufus-4.7p.exe?rlkey=3kbnx7pf22wkd7r0vnk6gbcnh&e=4&st=wf1u1ea1&dl=0';
    
    test('should successfully handle dropbox download URL', async () => {
      const result = await handleDropboxDownload(testUrl);
      
      expect(result).not.toBeNull(); 
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });

  describe('FT-001: General Download URL Handler', () => {
    const testUrl = 'https://www.nexon.com/maplestory/';
    
    test('should successfully handle general download URL', async () => {
      const result = await handleGeneralURLDownload(testUrl);
      
      expect(result).not.toBeNull(); 
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });

  describe('FT-001: Github Download URL Handler', () => {
    const testUrl = 'https://github.com/vercel/next.js';
    
    test('should successfully handle github download URL', async () => {
      const result = await handleGithubDownload(testUrl);
      
      expect(result).not.toBeNull(); 
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });
  

  describe('FT-001: GoogleDrive Download URL Handler', () => {
    const testUrl = 'https://drive.usercontent.google.com/download?id=18PnWlPgDtCaj6BrzohUesujyKKd6EuQ2&export=download&authuser=0';
    
    test('should successfully handle googleDrive download URL', async () => {
      const result = await handleGoogleDriveDownload(testUrl);
      
      expect(result).not.toBeNull(); 
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });

  describe('FT-001: Mega_NZ Download URL Handler', () => {
    const testUrl = 'https://mega.nz/file/WkxkAIQK#BXPwgvGzojhF0m3w52_DkAsPFemif25VwlTysUI-ZTQ';
    
    test('should successfully handle mega_NZ download URL', async () => {
      const result = await handleMegaNZDownload(testUrl);
      
      expect(result).not.toBeNull(); 
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });

  describe('FT-001: OneDrive Download URL Handler', () => {
    const testUrl = 'https://onedrive.live.com/?redeem=aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9iZTAwMjI3ZTlkMDBkNmM3L0VadnJKNmhLZDBwUGtiVUozR1N4RmNJQjExcWlqcVdlRXVubWJtU2hhLVd3OHc%5FZT1MeFhWMTE&cid=BE00227E9D00D6C7&id=BE00227E9D00D6C7%21sa827eb9b774a4f4a91b509dc64b115c2&parId=root&o=OneUp';
    
    test('should successfully handle oneDrive download URL', async () => {
      const result = await handleOneDriveDownload(testUrl);
      
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });

  describe('FT-001: Torrent Download URL Handler', () => {
    const testUrl = 'magnet:?xt=urn:btih:DDF2225D12F9409E694BDB154DFDA7CF4C0AC96A&dn=Windows+Movie+Maker+2025+v9.9.9.26+%28x64%29+%2B+Fix&tr=http%3A%2F%2Fwww.torrentsnipe.info%3A2701%2Fannounce&tr=http%3A%2F%2Fbt.poletracker.org%3A2710%2Fannounce&tr=http%3A%2F%2Ftracker.ipv6tracker.org%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.tiny-vps.com%3A6969%2Fannounce&tr=http%3A%2F%2Ftracker.vanitycore.co%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.open-internet.nl%3A6969%2Fannounce&tr=udp%3A%2F%2Fopen.demonii.si%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Fdenis.stalker.upeer.me%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce';
    
    test('should successfully handle torrent download URL', async () => {
      const { handleTorrentDownload } = await import('../../torrent.mjs');
      result = await handleTorrentDownload(testUrl);
      
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.path).toBeDefined();

      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await deleteFile(result.path);
      } catch (err) {
        console.warn('⚠️ Failed to delete file:', err.message);
      }      
    }, 600000);
  });




  afterAll(async () => {
    if (global.browser && typeof global.browser.close === 'function') {
      await global.browser.close();
      console.log('🧹 Global browser closed after all tests.');
    }
  });