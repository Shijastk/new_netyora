const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const logger = require('./logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'Netyora',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'],
    transformation: [
      { width: 1000, height: 1000, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'auto' }
    ]
  }
});

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images and documents
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'application/pdf' ||
        file.mimetype === 'application/msword' ||
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and Word documents are allowed.'), false);
    }
  }
});

// Utility functions for Cloudinary operations
const cloudinaryUtils = {
  // Upload a file
  async uploadFile(file, options = {}) {
    try {
      const result = await cloudinary.uploader.upload(file, {
        folder: 'Netyora',
        ...options
      });
      return result;
    } catch (error) {
      logger.error('Cloudinary upload error:', error);
      throw error;
    }
  },

  // Delete a file
  async deleteFile(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result;
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      throw error;
    }
  },

  // Get file details
  async getFileDetails(publicId) {
    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      logger.error('Cloudinary get details error:', error);
      throw error;
    }
  },

  // Generate a signed URL for secure file access
  async generateSignedUrl(publicId, options = {}) {
    try {
      const url = cloudinary.url(publicId, {
        sign_url: true,
        ...options
      });
      return url;
    } catch (error) {
      logger.error('Cloudinary signed URL error:', error);
      throw error;
    }
  }
};

module.exports = {
  upload,
  cloudinaryUtils
};
