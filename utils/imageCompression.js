const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

class ImageCompression {
  constructor() {
    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif'];
    this.maxWidth = 1200;
    this.maxHeight = 1200;
    this.quality = 85;
  }

  // Compress and optimize image
  async compressImage(inputPath, outputPath, options = {}) {
    try {
      const {
        width = this.maxWidth,
        height = this.maxHeight,
        quality = this.quality,
        format = 'webp',
        fit = 'inside'
      } = options;

      // Create output directory if it doesn't exist
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Get image metadata
      const metadata = await sharp(inputPath).metadata();
      
      // Calculate optimal dimensions
      const { optimalWidth, optimalHeight } = this.calculateOptimalDimensions(
        metadata.width,
        metadata.height,
        width,
        height
      );

      // Process image
      const processedImage = sharp(inputPath)
        .resize(optimalWidth, optimalHeight, {
          fit: fit,
          withoutEnlargement: true
        })
        .sharpen()
        .normalize();

      // Apply format-specific optimizations
      switch (format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          await processedImage
            .jpeg({ quality, progressive: true, mozjpeg: true })
            .toFile(outputPath);
          break;
        case 'png':
          await processedImage
            .png({ quality, progressive: true, compressionLevel: 9 })
            .toFile(outputPath);
          break;
        case 'webp':
          await processedImage
            .webp({ quality, effort: 6 })
            .toFile(outputPath);
          break;
        default:
          await processedImage
            .webp({ quality, effort: 6 })
            .toFile(outputPath);
      }

      // Get file size info
      const originalSize = fs.statSync(inputPath).size;
      const compressedSize = fs.statSync(outputPath).size;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      logger.info('Image compression completed', {
        originalSize: `${(originalSize / 1024).toFixed(2)}KB`,
        compressedSize: `${(compressedSize / 1024).toFixed(2)}KB`,
        compressionRatio: `${compressionRatio}%`,
        format,
        dimensions: `${optimalWidth}x${optimalHeight}`
      });

      return {
        success: true,
        originalSize,
        compressedSize,
        compressionRatio: parseFloat(compressionRatio),
        format,
        dimensions: { width: optimalWidth, height: optimalHeight }
      };

    } catch (error) {
      logger.error('Image compression failed:', error);
      throw new Error(`Image compression failed: ${error.message}`);
    }
  }

  // Calculate optimal dimensions while maintaining aspect ratio
  calculateOptimalDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
    let optimalWidth = originalWidth;
    let optimalHeight = originalHeight;

    // Calculate aspect ratio
    const aspectRatio = originalWidth / originalHeight;

    // If image is larger than max dimensions, resize it
    if (originalWidth > maxWidth || originalHeight > maxHeight) {
      if (aspectRatio > 1) {
        // Landscape image
        optimalWidth = maxWidth;
        optimalHeight = Math.round(maxWidth / aspectRatio);
      } else {
        // Portrait image
        optimalHeight = maxHeight;
        optimalWidth = Math.round(maxHeight * aspectRatio);
      }
    }

    return { optimalWidth, optimalHeight };
  }

  // Generate multiple sizes for responsive images
  async generateResponsiveSizes(inputPath, outputDir, filename) {
    const sizes = [
      { width: 300, height: 300, suffix: 'thumb' },
      { width: 600, height: 600, suffix: 'medium' },
      { width: 1200, height: 1200, suffix: 'large' }
    ];

    const results = [];

    for (const size of sizes) {
      const outputPath = path.join(outputDir, `${filename}_${size.suffix}.webp`);
      
      try {
        const result = await this.compressImage(inputPath, outputPath, {
          width: size.width,
          height: size.height,
          format: 'webp',
          quality: 80
        });

        results.push({
          ...result,
          size: size.suffix,
          path: outputPath
        });
      } catch (error) {
        logger.error(`Failed to generate ${size.suffix} size:`, error);
      }
    }

    return results;
  }

  // Batch compress multiple images
  async batchCompress(inputPaths, outputDir, options = {}) {
    const results = [];
    const errors = [];

    for (const inputPath of inputPaths) {
      try {
        const filename = path.basename(inputPath, path.extname(inputPath));
        const outputPath = path.join(outputDir, `${filename}_compressed.webp`);
        
        const result = await this.compressImage(inputPath, outputPath, options);
        results.push({
          originalPath: inputPath,
          compressedPath: outputPath,
          ...result
        });
      } catch (error) {
        errors.push({
          path: inputPath,
          error: error.message
        });
      }
    }

    return { results, errors };
  }

  // Validate image file
  async validateImage(filePath) {
    try {
      const metadata = await sharp(filePath).metadata();
      
      // Check if format is supported
      if (!this.supportedFormats.includes(metadata.format)) {
        throw new Error(`Unsupported image format: ${metadata.format}`);
      }

      // Check file size (max 10MB)
      const stats = fs.statSync(filePath);
      if (stats.size > 10 * 1024 * 1024) {
        throw new Error('File size too large. Maximum 10MB allowed.');
      }

      return {
        valid: true,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        size: stats.size
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Create thumbnail
  async createThumbnail(inputPath, outputPath, size = 300) {
    return this.compressImage(inputPath, outputPath, {
      width: size,
      height: size,
      quality: 70,
      format: 'webp',
      fit: 'cover'
    });
  }

  // Optimize for web
  async optimizeForWeb(inputPath, outputPath) {
    return this.compressImage(inputPath, outputPath, {
      width: 1200,
      height: 1200,
      quality: 85,
      format: 'webp'
    });
  }
}

module.exports = new ImageCompression(); 