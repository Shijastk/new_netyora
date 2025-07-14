const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Comprehensive file filter for all file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    
    // Audio
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/ogg; codecs=opus',
    'audio/ogg; codecs=vorbis',
    'audio/x-m4a',
    'audio/aac',
    'audio/mp3',
    'application/octet-stream'
  ];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
  }
};

// Create main multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files
  }
});

// Create specialized instances
const uploadImage = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (imageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
    files: 1
  }
});

const uploadAudio = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const audioTypes = [
      'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/mpeg',
      'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/ogg; codecs=opus',
      'audio/ogg; codecs=vorbis', 'audio/x-m4a', 'audio/aac', 'audio/mp3',
      'application/octet-stream'
    ];
    if (audioTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for audio
    files: 1
  }
});

// Create multer instance for binary file uploads (no FormData fields)
const uploadBinary = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file for binary uploads
  }
});

// Enhanced error handling middleware
const handleMulterError = (err, req, res, next) => {
  console.error('--- Multer Error Debug ---');
  console.error('Error:', err);
  console.error('Error type:', err.constructor.name);
  console.error('req.file:', req.file);
  console.error('req.body:', req.body);
  console.error('req.headers:', req.headers);
  
  if (err instanceof multer.MulterError) {
    console.error('Multer error code:', err.code);
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ 
          error: 'File too large', 
          details: 'Maximum file size is 10MB' 
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ 
          error: 'Too many files', 
          details: 'Maximum 10 files allowed' 
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({ 
          error: 'Unexpected file field', 
          details: 'Check the field name in your form' 
        });
      default:
        return res.status(400).json({ 
          error: 'File upload error', 
          details: err.message 
        });
    }
  } else if (err) {
    return res.status(400).json({ 
      error: 'File validation error', 
      details: err.message 
    });
  }
  
  next();
};

// Cleanup uploaded files middleware
const cleanupUploads = (req, res, next) => {
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

// Export all multer instances and utilities
module.exports = {
  // Main instances
  upload,
  uploadImage,
  uploadAudio,
  uploadBinary,
  
  // Convenience methods
  single: upload.single.bind(upload),
  array: upload.array.bind(upload),
  fields: upload.fields.bind(upload),
  
  // Specialized single methods
  singleImage: uploadImage.single.bind(uploadImage),
  singleAudio: uploadAudio.single.bind(uploadAudio),
  singleBinary: uploadBinary.single.bind(uploadBinary),
  
  // Error handling and utilities
  handleMulterError,
  cleanupUploads,
  
  // File validation utilities
  validateFileType: (allowedTypes) => {
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
  },
  
  // Process uploaded files middleware
  processUploadedFiles: (req, res, next) => {
    // Add file information to request for easy access
    if (req.file) {
      req.fileInfo = {
        originalName: req.file.originalname,
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      };
    }
    
    if (req.files) {
      req.filesInfo = req.files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        path: file.path,
        size: file.size,
        mimetype: file.mimetype
      }));
    }
    
    next();
  }
}; 