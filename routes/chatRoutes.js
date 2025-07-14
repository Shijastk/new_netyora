const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');
const { single, handleMulterError } = require('../middleware/upload');

// Add JSON parsing only to routes that need it
const jsonParser = express.json({ limit: '10mb' });
const urlEncodedParser = express.urlencoded({ extended: true, limit: '10mb' });

// Get all chats for user
router.get('/', auth, chatController.getChats);

// Get online users
router.get('/online-users', auth, chatController.getOnlineUsers);

// Personal chat (JSON)
router.post('/personal', auth, jsonParser, chatController.createChat);

// Group chat (accepts both JSON and FormData)
router.post('/group', auth, jsonParser, single('avatar'), handleMulterError, chatController.createChat);

// Send text message - needs JSON parsing
router.post('/message/:chatId', auth, jsonParser, chatController.sendMessage);

// Send file/image message - uses FormData
router.post('/message/:chatId/file', auth, single('file'), handleMulterError, chatController.sendFileMessage);

// Download file on demand - no body needed
router.get('/message/:chatId/:messageId/download', auth, chatController.downloadFile);

// Get messages for a chat
router.get('/:chatId/messages', auth, chatController.getMessages);

// Edit message - needs JSON parsing
router.put('/message/:chatId/:messageId', auth, jsonParser, chatController.editMessage);

// Delete message - no body needed
router.delete('/message/:chatId/:messageId', auth, chatController.deleteMessage);

// Delete file/image from message - no body needed
router.delete('/message/:chatId/:messageId/file', auth, chatController.deleteMessageFile);

// Mark chat as read - no body needed
router.post('/read/:chatId', auth, chatController.markAsRead);

// Typing indicator - needs JSON parsing
router.post('/typing/:chatId', auth, jsonParser, chatController.typing);

// Create video session for chat - needs JSON parsing
router.post('/:chatId/video-session', auth, jsonParser, chatController.createVideoSessionForChat);

// Add join notification - needs JSON parsing
router.post('/:chatId/join-notification', auth, jsonParser, chatController.addJoinNotificationRoute);

// Add leave notification - needs JSON parsing
router.post('/:chatId/leave-notification', auth, jsonParser, chatController.addLeaveNotificationRoute);

// Cancel video session - no body needed
router.post('/:chatId/cancel-video-session', auth, chatController.cancelVideoSession);

// End video call - no body needed
router.post('/:chatId/end-video-call', auth, chatController.endVideoCall);

// Timeout video call invitation - no body needed
router.post('/:chatId/timeout-video-call', auth, chatController.timeoutVideoCall);

// Check video session termination - no body needed
router.post('/:chatId/check-video-termination', auth, chatController.checkVideoSessionTerminationRoute);

// Test endpoint for debugging
router.get('/test-cancel', (req, res) => {
  res.json({ message: 'Chat cancel route is working' });
});

// Get specific chat
router.get('/:chatId', auth, chatController.getChat);

// Update chat (for group chats) - uses FormData for avatar
router.patch('/:chatId', auth, single('avatar'), handleMulterError, chatController.updateChat);

// Delete chat
router.delete('/:chatId', auth, chatController.deleteChat);

module.exports = router;
