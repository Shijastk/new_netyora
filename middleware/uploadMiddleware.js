const { upload, cloudinaryUtils } = require('../utils/cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage for temporary files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedDocumentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ];
  
  const allowedTypes = [...allowedImageTypes, ...allowedDocumentTypes];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Configure multer with limits
const multerConfig = {
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
};

// Create multer instance
const multerUpload = multer(multerConfig);

// Single file upload middleware
const single = (fieldName) => {
  return multerUpload.single(fieldName);
};

// Multiple files upload middleware
const array = (fieldName, maxCount = 10) => {
  return multerUpload.array(fieldName, maxCount);
};

// Multiple fields upload middleware
const fields = (fields) => {
  return multerUpload.fields(fields);
};

// File type validation middleware
const validateFileType = (allowedTypes) => {
  return (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ 
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` 
      });
    }
    
    next();
  };
};

// Process uploaded files middleware
const processUploadedFiles = (req, res, next) => {
  // This middleware can be used to process files before they're handled by the controller
  // For now, it just passes through
  next();
};

// Error handling middleware
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large. Maximum size is 10MB.' 
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        error: 'Too many files. Maximum is 10 files.' 
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: 'Unexpected file field.' 
      });
    }
    return res.status(400).json({ 
      error: 'File upload error: ' + err.message 
    });
  }
  
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ 
      error: err.message 
    });
  }
  
  next(err);
};

// Cleanup uploaded files middleware
const cleanupUploads = (req, res, next) => {
  // Clean up uploaded files after response
  res.on('finish', () => {
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  });
  next();
};

module.exports = {
  single,
  array,
  fields,
  handleUploadError,
  validateFileType,
  processUploadedFiles,
  cleanupUploads,
  cloudinaryUtils
}; 