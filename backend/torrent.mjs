import WebTorrent from 'webtorrent';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function handleTorrentDownload(magnetLink, signal, updateActivity = null, operationId = null){
console.log('🚀 Starting torrent downloader...');
if (updateActivity) updateActivity('torrent_init');
if (signal?.aborted) {
  throw new Error('Operation cancelled before starting');
}

// Create output directory
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
  console.log('📁 Created downloads folder');
}

// Initialize WebTorrent client
const client = new WebTorrent();
return new Promise((resolve, reject) => {
// Your magnet link
//'magnet:?xt=urn:btih:1E3040226166CE59F0BBC84C45F3E5FDAC063F67&dn=Merry.Christmas.Drake.and.Josh.2008.HDTV.x264-UAV&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce&tr=udp%3A%2F%2Ftracker.bittor.pw%3A1337%2Fannounce&tr=udp%3A%2F%2Fpublic.popcorn-tracker.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.dler.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969&tr=udp%3A%2F%2Fopen.demonii.com%3A1337%2Fannounce';
// Add signal handler for torrent cancellation
  if (signal) {
  signal.addEventListener('abort', () => {
    console.log('⏹️ Cancelling torrent download...');
    try {
      client.destroy(() => {
        console.log('🛑 Torrent client destroyed due to cancellation.');
      });
    } catch (e) {}
    resolve({
      success: false,
      cancelled: true,
      message: 'Torrent download was cancelled. Chat is still active.'
    });
  });
}

  if (signal?.aborted) {
    return reject(new Error('Operation cancelled'));
  }

console.log('\n🔍 Connecting to peers...');

client.add(magnetLink, { path: downloadDir }, (torrent) => {
  if (signal?.aborted) {
      client.destroy();
      return reject(new Error('Torrent download was cancelled'));
    }
  console.log('\n=== 📺 Torrent Info ===');
  console.log('Name:', torrent.name);
  if (updateActivity) updateActivity('torrent_started');
  console.log('Size:', formatBytes(torrent.length));
  console.log('Files:', torrent.files.length);
  console.log('Info Hash:', torrent.infoHash);
  console.log('\n📥 Downloading to:', downloadDir);
  console.log('======================\n');
  
  // Show progress every second
  const progressInterval = setInterval(() => {
     if (signal?.aborted) {
        clearInterval(progressInterval);
        client.destroy();
        return reject(new Error('Torrent download was cancelled'));
      }

    const progress = (torrent.progress * 100).toFixed(1);
    const speed = formatBytes(torrent.downloadSpeed) + '/s';
    const uploaded = formatBytes(torrent.uploaded);
    const downloaded = formatBytes(torrent.downloaded);
    const peers = torrent.numPeers;
    const ratio = torrent.ratio ? torrent.ratio.toFixed(2) : '0.00';
   
    console.clear();
    console.log('=== 📊 Download Status ===');
    console.log(`📺 File: ${torrent.name}`);
    console.log(`📈 Progress: ${progress}%`);
    console.log(`⬇️ Download Speed: ${speed}`);
    console.log(`📥 Downloaded: ${downloaded} / ${formatBytes(torrent.length)}`);
    console.log(`⬆️ Uploaded: ${uploaded} (Ratio: ${ratio})`);
    console.log(`👥 Connected Peers: ${peers}`);
    console.log('========================\n');

    // Inside the progress interval, add this check:
    if (torrent.progress > 0.5 && !torrent.halfwayReported) {
      torrent.halfwayReported = true;
      if (updateActivity) updateActivity('torrent_50%_complete');
    }

    if (torrent.done) {
      clearInterval(progressInterval);
    }
  }, 1000);
  
  // Download completion
  torrent.on('done', () => {
    clearInterval(progressInterval);
     if (signal?.aborted) {
        client.destroy();
        return reject(new Error('Torrent download was cancelled'));
      }

    const filePath = path.join(downloadDir, torrent.name); // ✅ define it here
    console.log('\n🎉 DOWNLOAD COMPLETE! 🎉\n');
    if (updateActivity) updateActivity('torrent_download_complete');
    console.log('💾 File saved to:', path.join(downloadDir, torrent.name));
    console.log('\n⏳ The downloader will continue seeding for 1 minute, then close.');
    
    // Seed for 5 minutes before closing
    setTimeout(() => {
      if (signal?.aborted) {
          client.destroy();
          return reject(new Error('Torrent download was cancelled'));
        }
      client.destroy(() => {
        console.log('\n🛑 Downloader closed.');
        resolve({ path: filePath, filename: torrent.name });		// ✅ now it's defined
		
      });
    }, 60000); // 1 minute
  });
  
  // Torrent error handling
  torrent.on('error', (err) => {
    console.error('\n❌ Torrent Error:', err.message);
    clearInterval(progressInterval);
    reject(err);
  });
});

// Client error handling
client.on('error', (err) => {
   if (signal?.aborted || err.message.includes('cancelled')) {
      console.log('⏹️ Torrent client error due to cancellation');
      return reject(new Error('Torrent download was cancelled'));
    }
  console.error('\n❌ Client Error:', err.message);
  reject(err);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⏹️ Shutting down...');
  client.destroy(() => {
    console.log('🛑 Downloader closed.');
    process.exit(0);
  });
});
 });
}
// Helper function to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}