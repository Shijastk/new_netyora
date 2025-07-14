const { generateToken04 } = require('../server/zegoServerAssistant');
require('dotenv').config();

const ZEGOCLOUD_APP_ID = Number(process.env.ZEGOCLOUD_APP_ID);
const ZEGOCLOUD_SERVER_SECRET = process.env.ZEGOCLOUD_SERVER_SECRET;

exports.getZegoToken = (req, res) => {
  // Accept both GET (query) and POST (body)
  const userID = req.body.userID || req.query.userID;
  const roomID = req.body.roomID || req.query.roomID;
  if (!userID || !roomID) {
    return res.status(400).json({ error: 'userID and roomID are required' });
  }
  try {
    const effectiveTimeInSeconds = 3600; // 1 hour
    const token = generateToken04(
      ZEGOCLOUD_APP_ID,
      userID,
      ZEGOCLOUD_SERVER_SECRET,
      effectiveTimeInSeconds,
      roomID // pass roomID as payload
    );
    res.json({ token, appID: ZEGOCLOUD_APP_ID, userID, roomID });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate ZEGOCLOUD token' });
  }
}; 