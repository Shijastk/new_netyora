# Netyora - Advanced Social Learning Platform

A comprehensive MERN stack application with advanced features including real-time messaging, image compression, recommendation algorithms, and scalable architecture.

## 🚀 Features

### Core Features
- **Advanced Main Feed**: Shuffled and recommended posts with intelligent algorithms
- **Real-time Messaging**: Multi-file support with automatic deletion
- **Image Compression**: Advanced optimization using Sharp
- **Infinite Scroll**: Smooth pagination with performance optimization
- **Comment System**: Nested comments with real-time updates
- **Report System**: Comprehensive content moderation
- **Share & Save**: Multi-platform sharing and bookmarking
- **Rate Limiting**: Protection against spam and abuse

### Technical Features
- **RTK Query**: Modern data fetching with caching
- **Socket.IO**: Real-time notifications and messaging
- **Cloudinary**: Advanced image storage and optimization
- **Redis**: Caching and rate limiting
- **MongoDB**: Scalable data storage
- **Sharp**: Advanced image compression
- **Multer**: File upload handling

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Redis >= 6.0
- FFmpeg (for audio processing)

## 🛠️ Installation

### Backend Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd Netyora-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Install Sharp for image compression**
```bash
npm install sharp@^0.33.2
```

4. **Install FFmpeg for audio processing**
```bash
# Windows (using chocolatey)
choco install ffmpeg

# macOS (using homebrew)
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt update
sudo apt install ffmpeg
```

5. **Environment Setup**
Create a `.env` file in the root directory:
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/Netyora

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secure-jwt-secret-12345

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Optional: Cloudinary Webhook URL
CLOUDINARY_WEBHOOK_URL=https://your-domain.com/webhook/cloudinary
```

6. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

### Frontend Setup

1. **Navigate to frontend directory**
```bash
cd frontend
```

2. **Install dependencies**
```bash
npm install
```

3. **Start development server**
```bash
npm run dev
```

## 🔧 Dependencies

### Backend Dependencies
```json
{
  "sharp": "^0.33.2",           // Image compression
  "cloudinary": "1.41.3",        // Image storage
  "socket.io": "4.7.4",          // Real-time communication
  "redis": "4.6.13",             // Caching and rate limiting
  "mongoose": "8.1.1",           // MongoDB ODM
  "express": "4.18.2",           // Web framework
  "multer": "1.4.5-lts.1",       // File uploads
  "fluent-ffmpeg": "^2.1.2",     // Audio processing
  "ffmpeg-static": "^5.2.0"      // FFmpeg binaries
}
```

### Frontend Dependencies
```json
{
  "@reduxjs/toolkit": "^2.8.2",  // State management
  "socket.io-client": "^4.8.1",  // Real-time client
  "react": "^18.3.1",            // UI framework
  "tailwindcss": "^3.4.17",      // Styling
  "lucide-react": "^0.462.0"     // Icons
}
```

## 🏗️ Architecture

### Backend Structure
```
├── controllers/          # Business logic
├── models/              # Database schemas
├── routes/              # API endpoints
├── middleware/          # Request processing
├── utils/               # Utilities and helpers
├── services/            # External services
└── uploads/             # Temporary file storage
```

### Frontend Structure
```
├── src/
│   ├── components/      # Reusable UI components
│   ├── pages/           # Page components
│   ├── redux/           # State management
│   ├── hooks/           # Custom hooks
│   └── utils/           # Utilities
```

## 🔄 API Endpoints

### Posts
- `GET /api/posts/main-feed` - Get recommended feed
- `POST /api/posts` - Create text post
- `POST /api/posts/with-images` - Create post with images
- `POST /api/posts/:id/report` - Report post
- `POST /api/posts/:id/share` - Share post
- `POST /api/posts/:id/save` - Save post

### Comments
- `POST /api/posts/:id/comments` - Add comment
- `PUT /api/posts/:id/comments/:commentId` - Update comment
- `DELETE /api/posts/:id/comments/:commentId` - Delete comment

### Messaging
- `POST /api/chat/message/:chatId/file` - Send file message
- `GET /api/chat/:chatId/messages` - Get messages

## 🚀 Performance Features

### Image Optimization
- **Sharp Compression**: Advanced image processing
- **Multiple Formats**: WebP, JPEG, PNG support
- **Responsive Sizes**: Thumbnail, medium, large variants
- **Cloudinary Integration**: CDN and optimization

### Caching Strategy
- **Redis Caching**: Feed and user data
- **RTK Query**: Frontend caching
- **CDN**: Cloudinary for images

### Rate Limiting
- **Request Counting**: Per-user limits
- **Time Windows**: Configurable periods
- **Graceful Degradation**: Fallback responses

## 🔒 Security Features

### Authentication
- **JWT Tokens**: Secure authentication
- **Session Management**: User sessions
- **Role-based Access**: Permission system

### Content Moderation
- **Report System**: User reporting
- **Auto-moderation**: Automatic content hiding
- **Admin Review**: Manual content review

### File Security
- **File Validation**: Type and size checks
- **Virus Scanning**: File security
- **Secure Uploads**: Protected endpoints

## 📊 Monitoring

### Logging
- **Winston**: Structured logging
- **Error Tracking**: Comprehensive error handling
- **Performance Metrics**: Response times and throughput

### Health Checks
- **Database**: MongoDB connection status
- **Redis**: Cache availability
- **External Services**: Cloudinary and other APIs

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🚀 Deployment

### Environment Variables
Ensure all required environment variables are set in production.

### Database Setup
- MongoDB cluster configuration
- Redis cluster setup
- Index optimization

### CDN Configuration
- Cloudinary setup
- Image optimization settings
- Webhook configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the code examples

---

**Note**: This is a comprehensive social learning platform with advanced features. Make sure to configure all environment variables and external services before running in production.
