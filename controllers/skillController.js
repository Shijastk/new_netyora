const Skill = require("../models/Skill");
const User = require("../models/User");
const { sanitizeInput } = require("../utils/helpers");
const logger = require("../utils/logger");
const SwapRequest = require("../models/SwapRequest");
const { featureFlags } = require("../utils/envCheck");
const Activity = require('../models/Activity');
const notificationController = require('./notificationController');

// POST /api/skills - Create skill (including looking for skills)
exports.createSkill = async (req, res) => {
  try {
    logger.info("Creating new skill", {
      userId: req.user?._id,
      body: req.body,
    });

    const { title, description, category, level, media, isLookingFor } =
      req.body;

    // Sanitize inputs
    const sanitizedData = {
      user: req.user._id,
      title: sanitizeInput(title),
      description: sanitizeInput(description),
      category: sanitizeInput(category),
      level: sanitizeInput(level),
      media: media || [],
      isLookingFor: isLookingFor || false,
    };

    logger.debug("Sanitized skill data", { sanitizedData });

    // Create the skill
    const skill = await Skill.create(sanitizedData);
    logger.info("Skill created successfully", { skillId: skill._id });

    // Always add the skill to user's skills array
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { skills: skill._id },
    });

    // If this is a "looking for" skill, add it to user's lookingFor array
    if (isLookingFor) {
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { lookingFor: skill._id },
      });
      logger.info("Added skill to user's lookingFor array", {
        userId: req.user._id,
        skillId: skill._id,
      });
    }

    // Create activity record for skill creation
    await Activity.create({
      user: req.user._id,
      type: 'skill_created',
      message: `Created skill: ${skill.title}`,
      referenceId: skill._id,
      referenceType: 'Skill',
      metadata: {
        skillTitle: skill.title,
        skillCategory: skill.category,
        isLookingFor: skill.isLookingFor,
        action: 'created'
      }
    });

    // Create notification for skill creation
    await notificationController.createNotification(
      req.user._id,
      'skill_created',
      'Skill Added',
      `You successfully added "${skill.title}" to your skills.`,
      skill._id,
      { skillTitle: skill.title, skillCategory: skill.category }
    );

    res.status(201).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    logger.error("Error creating skill:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      body: req.body,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills - Get all skills
exports.getSkills = async (req, res) => {
  try {
    const { category, level, isLookingFor, userId } = req.query;
    logger.info("Fetching skills", {
      filters: { category, level, isLookingFor, userId },
    });

    const query = {};
    if (category) query.category = category;
    if (level) query.level = level;
    if (isLookingFor !== undefined)
      query.isLookingFor = isLookingFor === "true";

    // If userId is provided, get skills for that specific user
    if (userId) {
      logger.debug("Fetching skills for specific user", { userId });
      const user = await User.findById(userId).populate("lookingFor");
      if (!user) {
        logger.warn("User not found when fetching skills", { userId });
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }
      logger.info("Successfully fetched user skills", {
        userId,
        skillCount: user.lookingFor.length,
      });
      return res.status(200).json({
        success: true,
        data: user.lookingFor,
      });
    }

    const skills = await Skill.find(query);
    logger.info("Successfully fetched all skills", {
      count: skills.length,
      filters: query,
    });
    res.status(200).json({
      success: true,
      data: skills,
    });
  } catch (error) {
    logger.error("Error getting skills:", {
      error: error.message,
      stack: error.stack,
      query: req.query,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills/:id - Get skill by ID
exports.getSkillById = async (req, res) => {
  try {
    const skillId = req.params.id;
    logger.info("Fetching skill by ID", { skillId });

    // Populate the user field with basic info
    const skill = await Skill.findById(skillId).populate('user', 'firstName lastName username avatar');
    if (!skill) {
      logger.warn("Skill not found", { skillId });
      return res.status(404).json({
        success: false,
        error: "Skill not found",
      });
    }

    logger.info("Successfully fetched skill", { skillId });
    res.status(200).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    logger.error("Error getting skill by ID:", {
      error: error.message,
      stack: error.stack,
      skillId: req.params.id,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// PUT /api/skills/:id - Update skill
exports.updateSkill = async (req, res) => {
  try {
    const skillId = req.params.id;
    logger.info("Updating skill", {
      skillId,
      userId: req.user?._id,
      updates: req.body,
    });

    const { title, description, category, level, media, isLookingFor } =
      req.body;

    // Sanitize inputs
    const sanitizedData = {
      title: sanitizeInput(title),
      description: sanitizeInput(description),
      category: sanitizeInput(category),
      level: sanitizeInput(level),
      media: media || [],
      isLookingFor: isLookingFor || false,
    };

    logger.debug("Sanitized update data", { sanitizedData });

    const skill = await Skill.findByIdAndUpdate(skillId, sanitizedData, {
      new: true,
      runValidators: true,
    });

    if (!skill) {
      logger.warn("Skill not found for update", { skillId });
      return res.status(404).json({
        success: false,
        error: "Skill not found",
      });
    }

    // If isLookingFor is true, add skill to user's lookingFor array; otherwise, remove it
    if (req.user) {
      if (isLookingFor) {
        await User.findByIdAndUpdate(req.user._id, {
          $addToSet: { lookingFor: skill._id },
        });
        logger.info("Added skill to user's lookingFor array", {
          userId: req.user._id,
          skillId,
        });
      } else {
        await User.findByIdAndUpdate(req.user._id, {
          $pull: { lookingFor: skill._id },
        });
        logger.info("Removed skill from user's lookingFor array", {
          userId: req.user._id,
          skillId,
        });
      }
    }

    // Create activity record for skill update
    await Activity.create({
      user: req.user._id,
      type: 'skill_updated',
      message: `Updated skill: ${skill.title}`,
      referenceId: skill._id,
      referenceType: 'Skill',
      metadata: {
        skillTitle: skill.title,
        skillCategory: skill.category,
        isLookingFor: skill.isLookingFor,
        action: 'updated'
      }
    });

    // Create notification for skill update
    await notificationController.createNotification(
      req.user._id,
      'skill_updated',
      'Skill Updated',
      `You successfully updated "${skill.title}".`,
      skill._id,
      { skillTitle: skill.title, skillCategory: skill.category }
    );

    logger.info("Successfully updated skill", { skillId });
    res.status(200).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    logger.error("Error updating skill:", {
      error: error.message,
      stack: error.stack,
      skillId: req.params.id,
      userId: req.user?._id,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// DELETE /api/skills/:id - Delete skill
exports.deleteSkill = async (req, res) => {
  try {
    const skillId = req.params.id;
    logger.info("Deleting skill", {
      skillId,
      userId: req.user?._id,
    });

    const skill = await Skill.findById(skillId);

    if (!skill) {
      logger.warn("Skill not found for deletion", { skillId });
      return res.status(404).json({
        success: false,
        error: "Skill not found",
      });
    }

    // Check if user owns this skill
    if (skill.user.toString() !== req.user._id.toString()) {
      logger.warn("Unauthorized skill deletion attempt", {
        skillId,
        skillUserId: skill.user,
        requestUserId: req.user._id,
      });
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this skill",
      });
    }

    // Remove skill from user's skills array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { skills: skill._id },
    });
    logger.info("Removed skill from user's skills array", {
      userId: req.user._id,
      skillId,
    });

    // Remove skill from user's lookingFor array if it exists
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { lookingFor: skill._id },
    });
    logger.info("Removed skill from user's lookingFor array", {
      userId: req.user._id,
      skillId,
    });

    // Create activity record for skill deletion
    await Activity.create({
      user: req.user._id,
      type: 'skill_deleted',
      message: `Deleted skill: ${skill.title}`,
      referenceId: skill._id,
      referenceType: 'Skill',
      metadata: {
        skillTitle: skill.title,
        skillCategory: skill.category,
        action: 'deleted'
      }
    });

    // Create notification for skill deletion
    await notificationController.createNotification(
      req.user._id,
      'skill_deleted',
      'Skill Deleted',
      `You successfully deleted "${skill.title}".`,
      skill._id,
      { skillTitle: skill.title, skillCategory: skill.category }
    );

    // Delete the skill
    await Skill.findByIdAndDelete(skillId);

    logger.info("Successfully deleted skill", { skillId });
    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    logger.error("Error deleting skill:", {
      error: error.message,
      stack: error.stack,
      skillId: req.params.id,
      userId: req.user?._id,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// POST /api/skills/by-ids - Get multiple skills by IDs
exports.getSkillsByIds = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "ids must be a non-empty array",
      });
    }
    const skills = await Skill.find({ _id: { $in: ids } });
    res.status(200).json({
      success: true,
      data: skills,
    });
  } catch (error) {
    logger.error("Error in getSkillsByIds:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills/user/:userId - Get skills by user
exports.getSkillsByUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate("skills");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }
    res.status(200).json({
      success: true,
      data: user.skills,
    });
  } catch (error) {
    logger.error("Error getting user skills:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// POST /api/skills/request - Send swap request
exports.sendSwapRequest = async (req, res) => {
  try {
    const { receiver, skill, notes } = req.body;
    if (!receiver || !skill) {
      return res.status(400).json({
        success: false,
        error: "Receiver and skill are required",
      });
    }

    const swapRequest = await SwapRequest.create({
      sender: req.user._id,
      receiver,
      skill,
      notes: sanitizeInput(notes),
    });

    res.status(201).json({
      success: true,
      data: swapRequest,
    });
  } catch (error) {
    logger.error("Error sending swap request:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// PUT /api/skills/request/:id - Update swap request
exports.updateSwapRequest = async (req, res) => {
  try {
    const { status } = req.body;
    const swapRequest = await SwapRequest.findById(req.params.id);

    if (!swapRequest) {
      return res.status(404).json({
        success: false,
        error: "Swap request not found",
      });
    }

    // Only the receiver can update the status
    if (swapRequest.receiver.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to update this swap request",
      });
    }

    swapRequest.status = status;
    await swapRequest.save();

    res.status(200).json({
      success: true,
      data: swapRequest,
    });
  } catch (error) {
    logger.error("Error updating swap request:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills/recommend - Get skill recommendations
exports.recommendSkills = async (req, res) => {
  try {
    // TODO: Implement AI-based recommendations
    res.status(200).json({
      success: true,
      data: [],
    });
  } catch (error) {
    logger.error("Error getting skill recommendations:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills/find-users - Find users by looking for skills
exports.findUsersByLookingForSkills = async (req, res) => {
  try {
    const { skillIds } = req.query;
    if (!skillIds) {
      return res.status(400).json({
        success: false,
        error: "skillIds query parameter is required",
      });
    }

    const ids = skillIds.split(",");
    const users = await User.find({
      lookingFor: { $in: ids },
    }).select("-password");

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error("Error finding users by looking for skills:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// POST /api/skills/looking-for - Add skill to looking for
exports.addToLookingFor = async (req, res) => {
  try {
    const { skillId } = req.body;

    if (!skillId) {
      return res.status(400).json({
        success: false,
        error: "Skill ID is required",
      });
    }

    // Check if skill exists
    const skill = await Skill.findById(skillId);
    if (!skill) {
      return res.status(404).json({
        success: false,
        error: "Skill not found",
      });
    }

    // Add to user's lookingFor array
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { lookingFor: skillId } },
      { new: true }
    ).populate("lookingFor");

    res.status(200).json({
      success: true,
      data: user.lookingFor,
    });
  } catch (error) {
    logger.error("Error adding to looking for:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// DELETE /api/skills/looking-for/:skillId - Remove skill from looking for
exports.removeFromLookingFor = async (req, res) => {
  try {
    const { skillId } = req.params;
    logger.info("Removing skill from looking for", {
      userId: req.user._id,
      skillId,
    });

    // First check if the skill exists
    const skill = await Skill.findById(skillId);
    if (!skill) {
      logger.warn("Skill not found when removing from looking for", {
        skillId,
      });
      return res.status(404).json({
        success: false,
        error: "Skill not found",
      });
    }

    // Update the skill to not be a looking for skill
    skill.isLookingFor = false;
    await skill.save();

    // Remove from user's lookingFor array
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { lookingFor: skillId },
    });

    logger.info("Successfully removed skill from looking for", {
      userId: req.user._id,
      skillId,
    });

    res.status(200).json({
      success: true,
      data: {
        message: "Skill removed from looking for list",
        skill,
      },
    });
  } catch (error) {
    logger.error("Error removing skill from looking for:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      skillId: req.params.skillId,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// PUT /api/skills/looking-for/:skillId - Update looking for skill
exports.updateLookingForSkill = async (req, res) => {
  try {
    const { skillId } = req.params;
    const { title, description, category, level, media } = req.body;

    logger.info("Updating looking for skill", {
      userId: req.user._id,
      skillId,
      updates: req.body,
    });

    // First check if the skill exists and belongs to the user's looking for list
    const user = await User.findById(req.user._id);
    if (!user.lookingFor.includes(skillId)) {
      logger.warn("Skill not found in user's looking for list", {
        userId: req.user._id,
        skillId,
      });
      return res.status(404).json({
        success: false,
        error: "Skill not found in your looking for list",
      });
    }

    // Update the skill
    const skill = await Skill.findByIdAndUpdate(
      skillId,
      {
        title: sanitizeInput(title),
        description: sanitizeInput(description),
        category: sanitizeInput(category),
        level: sanitizeInput(level),
        media: media || [],
        isLookingFor: true, // Ensure it stays as a looking for skill
      },
      { new: true, runValidators: true }
    );

    logger.info("Successfully updated looking for skill", {
      userId: req.user._id,
      skillId,
    });

    res.status(200).json({
      success: true,
      data: skill,
    });
  } catch (error) {
    logger.error("Error updating looking for skill:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      skillId: req.params.skillId,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills/looking-for - Get user's looking for skills
exports.getLookingForSkills = async (req, res) => {
  try {
    logger.info("Fetching user's looking for skills", { userId: req.user._id });

    const user = await User.findById(req.user._id).populate({
      path: "lookingFor",
      select: "title description category level media isLookingFor",
    });

    if (!user) {
      logger.warn("User not found when fetching looking for skills", {
        userId: req.user._id,
      });
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    logger.info("Successfully fetched looking for skills", {
      userId: req.user._id,
      count: user.lookingFor.length,
    });

    res.status(200).json({
      success: true,
      data: user.lookingFor,
    });
  } catch (error) {
    logger.error("Error fetching looking for skills:", {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
    });
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/skills/request/:id - Get swap request by ID
exports.getSwapRequestById = async (req, res) => {
  try {
    const swapRequest = await SwapRequest.findById(req.params.id)
      .populate('sender', 'username')
      .populate('receiver', 'username')
      .populate('skill', 'title');
    if (!swapRequest) {
      return res.status(404).json({
        success: false,
        error: 'Swap request not found',
      });
    }
    res.status(200).json({
      success: true,
      data: swapRequest,
    });
  } catch (error) {
    logger.error('Error fetching swap request:', error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// PATCH /api/skills/:id/toggle-learning - Toggle isLearning for a skill
exports.toggleLearning = async (req, res) => {
  try {
    const skillId = req.params.id;
    const userId = req.user._id;
    const skill = await Skill.findById(skillId);
    if (!skill) {
      return res.status(404).json({ success: false, error: "Skill not found" });
    }
    // Only the owner can toggle learning
    if (skill.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, error: "Not authorized to toggle learning for this skill" });
    }
    // Toggle isLearning
    skill.isLearning = !skill.isLearning;
    // Optionally update learners count if you store it in the DB
    await skill.save();
    res.status(200).json({ success: true, data: skill });
  } catch (error) {
    logger.error("Error toggling learning:", error);
    res.status(400).json({ success: false, error: error.message });
  }
};
