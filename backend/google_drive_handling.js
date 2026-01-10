

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Service Account method (primary) - never expires, most reliable
async function handleGoogleDriveServiceAccount(url, signal, updateActivity = null, operationId = null) {
    try {
        if (signal?.aborted) {
            throw new Error('Operation cancelled before starting');
        }
        const fileId = extractFileId(url);
        if (!fileId) {
            throw new Error('Could not extract file ID from URL');
        }

        console.log(`🔑 Using Service Account for file ID: ${fileId}`);

        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        // Setup authentication using service account
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'service-account-key.json'),
            scopes: ['https://www.googleapis.com/auth/drive.readonly']
        });

        const drive = google.drive({ version: 'v3', auth });

        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        // Get file metadata first
        console.log('📋 Getting file metadata...');
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'name, size, mimeType, parents'
        });

        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        const fileName = fileMetadata.data.name;
        console.log(`📁 File name: ${fileName}`);
        if (updateActivity) updateActivity('google_drive_metadata_received');
        
        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const filePath = path.join(downloadDir, fileName);

        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        // Download the file
        console.log('⬇️ Starting download via Google Drive API...');
        if (updateActivity) updateActivity('google_drive_download_start');
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'stream' });

        // Save to file
      return new Promise((resolve, reject) => {
  if (signal?.aborted) {
    return reject(new Error('Operation cancelled'));
  }
  
  const writeStream = fs.createWriteStream(filePath);
  let downloadedBytes = 0;
  let totalBytes = 0;
  let lastLoggedPercent = 0;
  
  // Try to get file size from metadata
  if (fileMetadata.data.size) {
    totalBytes = parseInt(fileMetadata.data.size);
  }
  
  // 🆕 ADD: Progress tracking for Google Drive
  response.data.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    
    if (totalBytes > 0) {
      const percent = Math.round((downloadedBytes * 100) / totalBytes);
      
      // Log every 10% or at completion
      if ((percent >= lastLoggedPercent + 10) || percent === 100) {
        const loadedMB = (downloadedBytes / 1024 / 1024).toFixed(1);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
        console.log(`📥 Google Drive Progress: ${percent}% (${loadedMB}/${totalMB} MB)`);
        
        if (updateActivity) {
          updateActivity(`google_drive_downloading_${percent}%`);
        }
        lastLoggedPercent = percent;
      }
    } else {
      // Log every 5MB when size is unknown
      const mb = downloadedBytes / 1024 / 1024;
      if (Math.floor(mb) % 5 === 0 && Math.floor(mb) > Math.floor((downloadedBytes - chunk.length) / 1024 / 1024)) {
        console.log(`📥 Google Drive Downloaded: ${mb.toFixed(1)} MB`);
      }
    }
  });

  response.data.pipe(writeStream)
    .on('error', (error) => {
      if (signal?.aborted || error.message.includes('cancelled')) {
        console.log('⏹️ Google Drive download stream cancelled');
        return resolve({
          success: false,
          cancelled: true,
          message: 'Google Drive download was cancelled. Chat is still active.'
        });
      }
      console.error('❌ Download stream error:', error.message);
      reject(error);
    })
    .on('finish', () => {
      if (signal?.aborted) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {}
        return resolve({
          success: false,
          cancelled: true,
          message: 'Google Drive download was cancelled. Chat is still active.'
        });
      }
      
      const finalMB = (downloadedBytes / 1024 / 1024).toFixed(1);
      console.log(`✅ Google Drive download completed: ${fileName} (${finalMB} MB)`);
      if (updateActivity) updateActivity('google_drive_download_complete');
      
      resolve({
        path: filePath,
        filename: fileName,
        success: true
      });
    });
});

    } catch (error) {
        if (signal?.aborted || error.message.includes('cancelled')) {
            throw new Error('Google Drive download was cancelled');
        }
        console.error('❌ Service Account download failed:', error.message);
        
        // Check if it's a permission error
        if (error.message.includes('403') || error.message.includes('permission')) {
            throw new Error(`Permission denied. Make sure the file is shared with: file-downloader@drivedownloader-463106.iam.gserviceaccount.com`);
        }
        
        throw error;
    }
}

// Direct download method (fallback for public files)
async function handleDirectDownloadMethod(url, signal, updateActivity = null, operationId = null) {
    const fileId = extractFileId(url);
    
    if (!fileId) {
        throw new Error('Could not extract file ID from URL');
    }

    try {
        if (signal?.aborted) {
            throw new Error('Operation cancelled before starting');
        }
        console.log(`🔗 Trying direct download for file ID: ${fileId}`);
        if (updateActivity) updateActivity('google_drive_direct_request_start');
        
        // Try direct download URL
        const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        
        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }

        const response = await axios({
            method: 'GET',
            url: directUrl,
            responseType: 'stream',
            maxRedirects: 5,
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });


        if (signal?.aborted) {
            throw new Error('Operation cancelled');
        }
        // Extract filename from headers or use default
        let fileName = `drive_file_${fileId}`;
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (fileNameMatch) {
                fileName = fileNameMatch[1].replace(/['"]/g, '');
            }
        }

        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }

        const filePath = path.join(downloadDir, fileName);

        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                return reject(new Error('Operation cancelled'));
            }
            const writeStream = fs.createWriteStream(filePath);

            // Add signal handler for stream cleanup
            if (signal) {
                signal.addEventListener('abort', () => {
                    console.log('⏹️ Cancelling direct download stream...');
                    try {
                        writeStream.destroy();
                        response.data.destroy();
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    } catch (e) {}
                    resolve({
                        success: false,
                        cancelled: true,
                        message: 'Google Drive direct download was cancelled. Chat is still active.'
                    });
                });
            }
            
            response.data.pipe(writeStream)
                .on('error', (error) => {
                    if (signal?.aborted || error.message.includes('cancelled')) {
                        console.log('⏹️ Direct download stream cancelled');
                        return resolve({
                            success: false,
                            cancelled: true,
                            message: 'Google Drive download was cancelled. Chat is still active.'
                        });
                    }
                    console.error('❌ Direct download stream error:', error.message);
                    reject(error);
                })
                .on('finish', () => {
                    if (signal?.aborted) {
                        try {
                            if (fs.existsSync(filePath)) {
                                fs.unlinkSync(filePath);
                            }
                        } catch (e) {}
                        return resolve({
                            success: false,
                            cancelled: true,
                            message: 'Google Drive download was cancelled. Chat is still active.'
                        });
                    }
                    console.log(`✅ File downloaded directly: ${fileName}`);
                    if (updateActivity) updateActivity('google_drive_direct_complete');
                    resolve({
                        path: filePath,
                        filename: fileName,
                        success: true
                    });
                });
        });

    } catch (error) {
        if (signal?.aborted || error.message.includes('cancelled')) {
            throw new Error('Direct download was cancelled');
        }
        console.error('❌ Direct download failed:', error.message);
        throw error;
    }
}

// Main handler that tries multiple methods
async function handleGoogleDriveDownload(url, signal, updateActivity = null, operationId = null) {
    console.log("📥 Starting Google Drive download:", url);
    if (updateActivity) updateActivity('google_drive_init');

        if (signal?.aborted) {
            throw new Error('Operation cancelled before starting');
        }

        // Add signal handler for early cancellation
        if (signal) {
            signal.addEventListener('abort', () => {
                console.log('⏹️ Cancelling Google Drive download...');
                return {
                    success: false,
                    cancelled: true,
                    message: 'Google Drive download was cancelled. Chat is still active.'
                };
            });
        }

    try {
        // Method 1: Try Service Account first (most reliable)
        if (fs.existsSync(path.join(__dirname, 'service-account-key.json'))) {
            console.log('🔑 Attempting Service Account method...');
            if (updateActivity) updateActivity('google_drive_service_account_start');
            
            try {
                if (signal?.aborted) {
                        throw new Error('Google Drive download was cancelled');
                    }
                const result = await handleGoogleDriveServiceAccount(url, signal, updateActivity, operationId);
                if (result && result.success) {
                    return result;
                }
            } catch (serviceError) {
                if (signal?.aborted || serviceError.message.includes('cancelled')) {
                        console.log('⏹️ Service Account download cancelled');
                        return {
                            success: false,
                            cancelled: true,
                            error: 'Google Drive download was cancelled',
                            message: 'Google Drive download was cancelled. Chat is still active.'
                        };
                    }
                console.warn('⚠️ Service Account method failed:', serviceError.message);
                
                // If it's a permission error, don't try fallback methods
                if (serviceError.message.includes('Permission denied')) {
                    return {
                        success: false,
                        error: serviceError.message,
                        message: 'Permission denied. Please share the Google Drive file with: file-downloader@drivedownloader-463106.iam.gserviceaccount.com'
                    };
                }
            }
        } else {
            console.warn('⚠️ service-account-key.json not found, skipping Service Account method');
        }

        if (signal?.aborted) {
                throw new Error('Google Drive download was cancelled');
            }

        // Method 2: Try direct download as fallback
        console.log('🔗 Attempting direct download method...');
        if (updateActivity) updateActivity('google_drive_direct_download_start');
        try {
            const result = await handleDirectDownloadMethod(url, signal, updateActivity, operationId);
            return result;
        } catch (directError) {
             if (signal?.aborted || directError.message.includes('cancelled')) {
                    console.log('⏹️ Direct download cancelled');
                    return {
                        success: false,
                        cancelled: true,
                        error: 'Google Drive direct download was cancelled',
                        message: 'Google Drive download was cancelled. Chat is still active.'
                    }
                }
            console.warn('⚠️ Direct download method failed:', directError.message);
        }

        // All methods failed
        return {
            success: false,
            error: 'All download methods failed',
            message: 'Could not download the file. Please try another link'
        };

    } catch (error) {
        if (signal?.aborted || error.message.includes('cancelled')) {
                console.log('⏹️ Google Drive download operation was cancelled');
                return {
                    success: false,
                    cancelled: true,
                    error: 'Google Drive download was cancelled',
                    message: 'Google Drive download was cancelled. Chat is still active.'
                };
            }
        console.error('❌ All Google Drive methods failed:', error.message);
        return {
            success: false,
            error: error.message,
            message: `Google Drive download failed: ${error.message}`
        };
    }

}

// Extract file ID from various Google Drive URL formats
function extractFileId(url) {
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
        /\/open\?id=([a-zA-Z0-9-_]+)/,
        /\/document\/d\/([a-zA-Z0-9-_]+)/,
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        /\/presentation\/d\/([a-zA-Z0-9-_]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

module.exports = { handleGoogleDriveDownload };