const express = require('express');
const router = express.Router();
const skillController = require('../controllers/skillController');
const auth = require('../middleware/auth');
const validateInput = require('../middleware/validateInput');

// Looking For Skills Routes
router.get('/looking-for', auth, skillController.getLookingForSkills);
router.delete('/looking-for/:skillId', auth, skillController.removeFromLookingFor);
router.put('/looking-for/:skillId', auth, validateInput(['title']), skillController.updateLookingForSkill);

// Fetch multiple skills by IDs (must come before /:id)
router.post('/by-ids', skillController.getSkillsByIds);

// Get all skills for a user
router.get('/user/:userId', skillController.getSkillsByUser);

// Get skill by ID (must come before general CRUD routes)
router.get('/:id', skillController.getSkillById);

// Skill CRUD
router.post('/', auth, validateInput(['title']), skillController.createSkill);
router.get('/', skillController.getSkills);
router.put('/:id', auth, skillController.updateSkill);
router.delete('/:id', auth, skillController.deleteSkill);

// Toggle isLearning for a skill
router.patch('/:id/toggle-learning', auth, skillController.toggleLearning);

module.exports = router;
