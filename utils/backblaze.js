const B2 = require('backblaze-b2');
const logger = require('./logger');
const fs = require('fs');

// Initialize B2 client
const b2 = new B2({
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY
});

// B2 bucket name for voice messages
const BUCKET_NAME = process.env.B2_BUCKET_NAME || 'voice-messages';

// Initialize B2 connection
async function initializeB2() {
  try {
    await b2.authorize();
    logger.info('✓ Backblaze B2 initialized successfully');
  } catch (error) {
    logger.error('Backblaze B2 initialization error:', error);
    throw error;
  }
}

// Upload audio file to B2
async function uploadAudioFile(filePath, fileName) {
  try {
    logger.info(`Starting upload for file: ${fileName}`);
    
    // Get upload URL
    const { data: { uploadUrl, authorizationToken } } = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID
    });

    logger.info('Got upload URL from B2');

    // Read file data
    const fileData = fs.readFileSync(filePath);
    logger.info(`File size: ${fileData.length} bytes`);

    // Upload file
    const { data } = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: `voice-messages/${fileName}`,
      data: fileData,
      contentType: 'audio/webm' // Set proper content type for audio
    });

    logger.info('File uploaded to B2 successfully');

    // Get public URL (Backblaze B2 public URL format)
    const publicUrl = `https://f004.backblazeb2.com/file/${BUCKET_NAME}/${fileName}`;
    
    logger.info(`Audio file uploaded successfully: ${fileName}`);
    logger.info(`Public URL: ${publicUrl}`);
    
    return {
      fileId: data.fileId,
      fileName: data.fileName,
      publicUrl: publicUrl,
      size: data.contentLength
    };
  } catch (error) {
    logger.error('Backblaze upload error:', error);
    throw error;
  }
}

// Delete audio file from B2
async function deleteAudioFile(fileName, fileId) {
  try {
    await b2.deleteFileVersion({
      fileName: `voice-messages/${fileName}`,
      fileId: fileId
    });
    logger.info(`Audio file deleted successfully: ${fileName}`);
  } catch (error) {
    logger.error('Backblaze delete error:', error);
    throw error;
  }
}

// Get file info
async function getFileInfo(fileId) {
  try {
    const { data } = await b2.getFileInfo({
      fileId: fileId
    });
    return data;
  } catch (error) {
    logger.error('Backblaze get file info error:', error);
    throw error;
  }
}

module.exports = {
  initializeB2,
  uploadAudioFile,
  deleteAudioFile,
  getFileInfo
}; 