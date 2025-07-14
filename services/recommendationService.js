const User = require('../models/User');
const Skill = require('../models/Skill');
const SwapCard = require('../models/SwapCard');
const Post = require('../models/Post');
const RecommendationFeedback = require('../models/RecommendationFeedback');
const logger = require('../utils/logger');

class RecommendationService {
  constructor() {
    this.weights = {
      skillMatch: 0.4,
      locationMatch: 0.2,
      activityMatch: 0.15,
      popularityMatch: 0.1,
      recencyMatch: 0.1,
      diversityMatch: 0.05
    };
  }

  // Check if user profile is complete
  isProfileComplete(user) {
    if (!user) return false;
    
    const hasSkills = user.skills && user.skills.length > 0;
    const hasLookingFor = user.lookingFor && user.lookingFor.length > 0;
    const hasLocation = user.location && (user.location.city || user.location.country);
    const hasBio = user.bio && user.bio.trim().length > 0;
    
    // Profile is complete if user has at least skills or lookingFor, plus basic info
    return (hasSkills || hasLookingFor) && (hasLocation || hasBio);
  }

  // Get random recommendations for incomplete profiles
  async getRandomRecommendations(type, limit = 10, page = 1) {
    try {
      let items = [];
      let total = 0;

      switch (type) {
        case 'profiles':
          items = await User.find({ 'privacy.profile': 'public' })
            .populate('skills')
            .populate('lookingFor')
            .populate('followers')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .select('_id firstName lastName avatar username skills lookingFor bio location')
            .limit(limit)
            .lean();
          
          total = await User.countDocuments({ 'privacy.profile': 'public' });
          
          items = items.map(user => ({
            ...user,
            matchScore: Math.floor(Math.random() * 40) + 60, // Random score 60-100
            compatibility: 'explore',
            isRandom: true
          }));
          break;

        case 'swaps':
          items = await SwapCard.find({ status: 'open' })
            .populate('user', 'username firstName lastName avatar')
            .populate('offeredSkill')
            .populate('desiredSkill')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .select('_id user offeredSkill desiredSkill status createdAt title likes')
            .limit(limit)
            .lean();
          
          total = await SwapCard.countDocuments({ status: 'open' });
          
          items = items.map(swap => ({
            ...swap,
            relevanceScore: Math.floor(Math.random() * 40) + 60,
            matchType: 'explore',
            isRandom: true
          }));
          break;

        case 'posts':
          items = await Post.find({ visibility: 'public' })
            .populate('user', 'username firstName lastName avatar')
            .populate('community', 'name')
            .populate('likes')
            .populate('comments')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .select('_id user content createdAt likes comments postType media tags community')
            .limit(limit)
            .lean();
          
          total = await Post.countDocuments({ visibility: 'public' });
          
          items = items.map(post => ({
            ...post,
            relevanceScore: Math.floor(Math.random() * 40) + 60,
            engagement: Math.random(),
            isRandom: true
          }));
          break;

        case 'skills':
          items = await Skill.find({ isLookingFor: false })
            .populate('user', 'username firstName lastName avatar')
            .sort({ rating: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .select('_id user title description rating experienceLevel availability tags')
            .limit(limit)
            .lean();
          
          total = await Skill.countDocuments({ isLookingFor: false });
          
          items = items.map(skill => ({
            ...skill,
            relevanceScore: Math.floor(Math.random() * 40) + 60,
            demandLevel: Math.random(),
            isRandom: true
          }));
          break;
      }

      return {
        items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        metadata: {
          isRandom: true,
          reason: 'incomplete_profile'
        }
      };
    } catch (error) {
      logger.error('Error getting random recommendations:', error);
      throw error;
    }
  }

  // Calculate similarity score between two users
  calculateUserSimilarity(user1, user2) {
    let score = 0;
    let totalWeight = 0;

    // Skill compatibility (40% weight)
    if (user1.skills && user2.lookingFor) {
      const skillOverlap = user1.skills.filter(skill => 
        user2.lookingFor.some(lookingSkill => 
          lookingSkill._id.toString() === skill._id.toString()
        )
      ).length;
      const reverseSkillOverlap = user2.skills.filter(skill => 
        user1.lookingFor.some(lookingSkill => 
          lookingSkill._id.toString() === skill._id.toString()
        )
      ).length;
      
      const skillScore = (skillOverlap + reverseSkillOverlap) / 
        Math.max(user1.skills.length + user2.skills.length, 1);
      score += skillScore * this.weights.skillMatch;
      totalWeight += this.weights.skillMatch;
    }

    // Location compatibility (20% weight)
    if (user1.location && user2.location) {
      const locationMatch = this.calculateLocationSimilarity(user1.location, user2.location);
      score += locationMatch * this.weights.locationMatch;
      totalWeight += this.weights.locationMatch;
    }

    // Activity level compatibility (15% weight)
    const activityScore = this.calculateActivitySimilarity(user1, user2);
    score += activityScore * this.weights.activityMatch;
    totalWeight += this.weights.activityMatch;

    // Popularity compatibility (10% weight)
    const popularityScore = this.calculatePopularitySimilarity(user1, user2);
    score += popularityScore * this.weights.popularityMatch;
    totalWeight += this.weights.popularityMatch;

    // Recency compatibility (10% weight)
    const recencyScore = this.calculateRecencySimilarity(user1, user2);
    score += recencyScore * this.weights.recencyMatch;
    totalWeight += this.weights.recencyMatch;

    // Diversity bonus (5% weight)
    const diversityScore = this.calculateDiversityScore(user1, user2);
    score += diversityScore * this.weights.diversityMatch;
    totalWeight += this.weights.diversityMatch;

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  // Calculate location similarity
  calculateLocationSimilarity(loc1, loc2) {
    if (!loc1 || !loc2) return 0;
    
    let score = 0;
    
    // Exact country match
    if (loc1.country && loc2.country && loc1.country === loc2.country) {
      score += 0.7;
      
      // Exact city match
      if (loc1.city && loc2.city && loc1.city === loc2.city) {
        score += 0.3;
      }
    }
    
    return Math.min(score, 1);
  }

  // Calculate activity similarity
  calculateActivitySimilarity(user1, user2) {
    const activity1 = user1.activity?.length || 0;
    const activity2 = user2.activity?.length || 0;
    
    const avgActivity = (activity1 + activity2) / 2;
    const activityDiff = Math.abs(activity1 - activity2);
    
    return Math.max(0, 1 - (activityDiff / Math.max(avgActivity, 1)));
  }

  // Calculate popularity similarity
  calculatePopularitySimilarity(user1, user2) {
    const followers1 = user1.followers?.length || 0;
    const followers2 = user2.followers?.length || 0;
    
    const avgFollowers = (followers1 + followers2) / 2;
    const followerDiff = Math.abs(followers1 - followers2);
    
    return Math.max(0, 1 - (followerDiff / Math.max(avgFollowers, 1)));
  }

  // Calculate recency similarity
  calculateRecencySimilarity(user1, user2) {
    const daysSince1 = (Date.now() - new Date(user1.createdAt)) / (1000 * 60 * 60 * 24);
    const daysSince2 = (Date.now() - new Date(user2.createdAt)) / (1000 * 60 * 60 * 24);
    
    const avgDays = (daysSince1 + daysSince2) / 2;
    const dayDiff = Math.abs(daysSince1 - daysSince2);
    
    return Math.max(0, 1 - (dayDiff / Math.max(avgDays, 1)));
  }

  // Calculate diversity score
  calculateDiversityScore(user1, user2) {
    const skills1 = user1.skills?.length || 0;
    const skills2 = user2.skills?.length || 0;
    
    // Bonus for users with different skill counts (encourages diversity)
    const skillDiff = Math.abs(skills1 - skills2);
    return Math.min(skillDiff / 10, 1);
  }

  // Get profile recommendations
  async getProfileRecommendations(userId = null, limit = 10, page = 1) {
    try {
      let currentUser = null;
      let isCompleteProfile = false;

      if (userId) {
        currentUser = await User.findById(userId)
          .populate('skills')
          .populate('lookingFor')
          .populate('blocked')
          .select('_id firstName lastName avatar username skills lookingFor bio location')
          .limit(1)
          .lean();
        
        isCompleteProfile = this.isProfileComplete(currentUser);
      }

      // If no user or incomplete profile, return random recommendations
      if (!userId || !isCompleteProfile) {
        return await this.getRandomRecommendations('profiles', limit, page);
      }

      // Get all users except current user and blocked users
      const excludedUsers = [userId, ...(currentUser.blocked || [])];
      
      const users = await User.find({
        _id: { $nin: excludedUsers },
        'privacy.profile': 'public'
      })
      .populate('skills')
      .populate('lookingFor')
      .populate('followers')
      .populate('activity')
      .select('_id firstName lastName avatar username skills lookingFor bio location')
      .limit(100)
      .lean();

      // Calculate similarity scores
      const userScores = users.map(user => ({
        user,
        score: this.calculateUserSimilarity(currentUser, user)
      }));

      // Sort by score and apply pagination
      userScores.sort((a, b) => b.score - a.score);
      
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedUsers = userScores.slice(startIndex, endIndex);

      // Format response
      const profiles = paginatedUsers.map(item => ({
        ...item.user,
        matchScore: Math.round(item.score * 100),
        compatibility: this.getCompatibilityLevel(item.score)
      }));

      return {
        profiles,
        pagination: {
          page,
          limit,
          total: userScores.length,
          pages: Math.ceil(userScores.length / limit)
        },
        metadata: {
          totalCandidates: users.length,
          averageScore: userScores.reduce((sum, item) => sum + item.score, 0) / userScores.length,
          isCompleteProfile: true
        }
      };
    } catch (error) {
      logger.error('Error getting profile recommendations:', error);
      throw error;
    }
  }

  // Get swap card recommendations
  async getSwapRecommendations(userId = null, limit = 10, page = 1, category = null) {
    try {
      let currentUser = null;
      let isCompleteProfile = false;

      if (userId) {
        currentUser = await User.findById(userId)
          .populate('skills')
          .populate('lookingFor')
          .select('_id user offeredSkill desiredSkill status createdAt title likes')
          .limit(1)
          .lean();
        
        isCompleteProfile = this.isProfileComplete(currentUser);
      }

      // If no user or incomplete profile, return random recommendations
      if (!userId || !isCompleteProfile) {
        return await this.getRandomRecommendations('swaps', limit, page);
      }

      // Build query
      const query = {
        status: 'open',
        user: { $ne: userId }
      };

      if (category) {
        query.tags = { $in: [category] };
      }

      const swapCards = await SwapCard.find(query)
        .populate('user', 'username firstName lastName avatar')
        .populate('offeredSkill')
        .populate('desiredSkill')
        .sort('-createdAt')
        .select('_id user offeredSkill desiredSkill status createdAt title likes')
        .limit(200)
        .lean();

      // Calculate relevance scores
      const swapScores = swapCards.map(swap => ({
        swap,
        score: this.calculateSwapRelevance(currentUser, swap)
      }));

      // Sort by score and apply pagination
      swapScores.sort((a, b) => b.score - a.score);
      
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedSwaps = swapScores.slice(startIndex, endIndex);

      // Format response
      const swaps = paginatedSwaps.map(item => ({
        ...item.swap,
        relevanceScore: Math.round(item.score * 100),
        matchType: this.getSwapMatchType(currentUser, item.swap)
      }));

      return {
        swaps,
        pagination: {
          page,
          limit,
          total: swapScores.length,
          pages: Math.ceil(swapScores.length / limit)
        },
        metadata: {
          totalCandidates: swapCards.length,
          averageScore: swapScores.reduce((sum, item) => sum + item.score, 0) / swapScores.length,
          isCompleteProfile: true
        }
      };
    } catch (error) {
      logger.error('Error getting swap recommendations:', error);
      throw error;
    }
  }

  // Calculate swap card relevance
  calculateSwapRelevance(user, swap) {
    let score = 0;
    let totalWeight = 0;

    // Skill match (50% weight)
    const userSkills = user.skills?.map(s => s._id.toString()) || [];
    const userLookingFor = user.lookingFor?.map(s => s._id.toString()) || [];
    
    const offeredSkillMatch = userLookingFor.includes(swap.offeredSkill._id.toString());
    const desiredSkillMatch = userSkills.includes(swap.desiredSkill._id.toString());
    
    if (offeredSkillMatch && desiredSkillMatch) {
      score += 1.0 * 0.5; // Perfect match
    } else if (offeredSkillMatch || desiredSkillMatch) {
      score += 0.5 * 0.5; // Partial match
    }
    totalWeight += 0.5;

    // Location match (20% weight)
    if (user.location && swap.location) {
      const locationScore = this.calculateLocationSimilarity(user.location, swap.location);
      score += locationScore * 0.2;
      totalWeight += 0.2;
    }

    // Recency (15% weight)
    const daysSinceCreated = (Date.now() - new Date(swap.createdAt)) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (daysSinceCreated / 30)); // 30 days max
    score += recencyScore * 0.15;
    totalWeight += 0.15;

    // Popularity (10% weight)
    const popularityScore = Math.min(swap.likes.length / 10, 1);
    score += popularityScore * 0.1;
    totalWeight += 0.1;

    // Featured bonus (5% weight)
    if (swap.isFeatured) {
      score += 0.05;
      totalWeight += 0.05;
    }

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  // Get swap match type
  getSwapMatchType(user, swap) {
    const userSkills = user.skills?.map(s => s._id.toString()) || [];
    const userLookingFor = user.lookingFor?.map(s => s._id.toString()) || [];
    
    const offeredSkillMatch = userLookingFor.includes(swap.offeredSkill._id.toString());
    const desiredSkillMatch = userSkills.includes(swap.desiredSkill._id.toString());
    
    if (offeredSkillMatch && desiredSkillMatch) {
      return 'perfect';
    } else if (offeredSkillMatch) {
      return 'can_offer';
    } else if (desiredSkillMatch) {
      return 'can_learn';
    } else {
      return 'related';
    }
  }

  // Get post recommendations
  async getPostRecommendations(userId = null, limit = 10, page = 1, community = null) {
    try {
      let currentUser = null;
      let isCompleteProfile = false;

      if (userId) {
        currentUser = await User.findById(userId)
          .populate('skills')
          .populate('lookingFor')
          .select('_id firstName lastName avatar username skills lookingFor bio location')
          .limit(1)
          .lean();
        
        isCompleteProfile = this.isProfileComplete(currentUser);
      }

      // If no user or incomplete profile, return random recommendations
      if (!userId || !isCompleteProfile) {
        return await this.getRandomRecommendations('posts', limit, page);
      }

      // Build query
      const query = {
        visibility: 'public',
        user: { $ne: userId }
      };

      if (community) {
        query.community = community;
      }

      const posts = await Post.find(query)
        .populate('user', 'username firstName lastName avatar')
        .populate('community', 'name')
        .populate('likes')
        .populate('comments')
        .sort('-createdAt')
        .select('_id user content createdAt likes comments postType media tags community')
        .limit(200)
        .lean();

      // Calculate relevance scores
      const postScores = posts.map(post => ({
        post,
        score: this.calculatePostRelevance(currentUser, post)
      }));

      // Sort by score and apply pagination
      postScores.sort((a, b) => b.score - a.score);
      
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPosts = postScores.slice(startIndex, endIndex);

      // Format response
      const formattedPosts = paginatedPosts.map(item => ({
        ...item.post,
        relevanceScore: Math.round(item.score * 100),
        engagement: this.calculatePostEngagement(item.post)
      }));

      return {
        posts: formattedPosts,
        pagination: {
          page,
          limit,
          total: postScores.length,
          pages: Math.ceil(postScores.length / limit)
        },
        metadata: {
          totalCandidates: posts.length,
          averageScore: postScores.reduce((sum, item) => sum + item.score, 0) / postScores.length,
          isCompleteProfile: true
        }
      };
    } catch (error) {
      logger.error('Error getting post recommendations:', error);
      throw error;
    }
  }

  // Calculate post relevance
  calculatePostRelevance(user, post) {
    let score = 0;
    let totalWeight = 0;

    // Tag match with user skills (40% weight)
    const userSkills = user.skills?.map(s => s.title?.toLowerCase()) || [];
    const userLookingFor = user.lookingFor?.map(s => s.title?.toLowerCase()) || [];
    const postTags = post.tags?.map(t => t.toLowerCase()) || [];
    
    const skillMatches = postTags.filter(tag => 
      userSkills.includes(tag) || userLookingFor.includes(tag)
    ).length;
    
    const tagScore = postTags.length > 0 ? skillMatches / postTags.length : 0;
    score += tagScore * 0.4;
    totalWeight += 0.4;

    // Engagement (30% weight)
    const engagementScore = this.calculatePostEngagement(post);
    score += engagementScore * 0.3;
    totalWeight += 0.3;

    // Recency (20% weight)
    const daysSinceCreated = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (daysSinceCreated / 7)); // 7 days max
    score += recencyScore * 0.2;
    totalWeight += 0.2;

    // Author popularity (10% weight)
    const authorFollowers = post.user.followers?.length || 0;
    const popularityScore = Math.min(authorFollowers / 100, 1);
    score += popularityScore * 0.1;
    totalWeight += 0.1;

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  // Calculate post engagement
  calculatePostEngagement(post) {
    const likes = post.likes?.length || 0;
    const comments = post.comments?.length || 0;
    const replies = post.comments?.reduce((sum, comment) => sum + (comment.replies?.length || 0), 0) || 0;
    
    return Math.min((likes + comments * 2 + replies * 3) / 50, 1);
  }

  // Get skill recommendations
  async getSkillRecommendations(userId = null, limit = 10, category = null) {
    try {
      let currentUser = null;
      let isCompleteProfile = false;

      if (userId) {
        currentUser = await User.findById(userId)
          .populate('skills')
          .populate('lookingFor')
          .select('_id firstName lastName avatar username skills lookingFor bio location')
          .limit(1)
          .lean();
        
        isCompleteProfile = this.isProfileComplete(currentUser);
      }

      // If no user or incomplete profile, return random recommendations
      if (!userId || !isCompleteProfile) {
        return await this.getRandomRecommendations('skills', limit, 1);
      }

      // Get all skills except user's own
      const query = {
        user: { $ne: userId },
        isLookingFor: false // Only recommend skills people are offering
      };

      if (category) {
        query.category = category;
      }

      const skills = await Skill.find(query)
        .populate('user', 'username firstName lastName avatar')
        .sort('-rating')
        .select('_id user title description rating experienceLevel availability tags')
        .limit(100)
        .lean();

      // Calculate relevance scores
      const skillScores = skills.map(skill => ({
        skill,
        score: this.calculateSkillRelevance(currentUser, skill)
      }));

      // Sort by score and limit
      skillScores.sort((a, b) => b.score - a.score);
      const topSkills = skillScores.slice(0, limit);

      // Format response
      const formattedSkills = topSkills.map(item => ({
        ...item.skill,
        relevanceScore: Math.round(item.score * 100),
        demandLevel: this.calculateSkillDemand(item.skill)
      }));

      return {
        skills: formattedSkills,
        metadata: {
          totalCandidates: skills.length,
          averageScore: skillScores.reduce((sum, item) => sum + item.score, 0) / skillScores.length,
          isCompleteProfile: true
        }
      };
    } catch (error) {
      logger.error('Error getting skill recommendations:', error);
      throw error;
    }
  }

  // Calculate skill relevance
  calculateSkillRelevance(user, skill) {
    let score = 0;
    let totalWeight = 0;

    // Match with user's looking for (50% weight)
    const userLookingFor = user.lookingFor?.map(s => s.title?.toLowerCase()) || [];
    const skillTitle = skill.title?.toLowerCase();
    
    if (userLookingFor.includes(skillTitle)) {
      score += 1.0 * 0.5;
    } else {
      // Partial match with tags
      const skillTags = skill.tags?.map(t => t.toLowerCase()) || [];
      const tagMatches = skillTags.filter(tag => userLookingFor.includes(tag)).length;
      const tagScore = skillTags.length > 0 ? tagMatches / skillTags.length : 0;
      score += tagScore * 0.5;
    }
    totalWeight += 0.5;

    // Skill rating (25% weight)
    const ratingScore = skill.rating / 5;
    score += ratingScore * 0.25;
    totalWeight += 0.25;

    // Experience level (15% weight)
    const experienceScore = skill.experienceLevel === 'expert' ? 1 : 
                           skill.experienceLevel === 'intermediate' ? 0.7 : 0.4;
    score += experienceScore * 0.15;
    totalWeight += 0.15;

    // Availability (10% weight)
    const availabilityScore = skill.availability === 'available' ? 1 : 0.5;
    score += availabilityScore * 0.1;
    totalWeight += 0.1;

    return totalWeight > 0 ? score / totalWeight : 0;
  }

  // Calculate skill demand
  calculateSkillDemand(skill) {
    // This could be enhanced with actual demand data
    const baseDemand = skill.rating * 0.2;
    const availabilityBonus = skill.availability === 'available' ? 0.1 : 0;
    return Math.min(baseDemand + availabilityBonus, 1);
  }

  // Get dashboard recommendations
  async getDashboardRecommendations(userId = null) {
    try {
      const [profiles, swaps, posts, skills] = await Promise.all([
        this.getProfileRecommendations(userId, 5, 1),
        this.getSwapRecommendations(userId, 5, 1),
        this.getPostRecommendations(userId, 5, 1),
        this.getSkillRecommendations(userId, 5)
      ]);

      return {
        profiles: profiles.profiles || profiles.items,
        swaps: swaps.swaps || swaps.items,
        posts: posts.posts || posts.items,
        skills: skills.skills || skills.items,
        summary: {
          totalRecommendations: (profiles.profiles || profiles.items).length + 
                               (swaps.swaps || swaps.items).length + 
                               (posts.posts || posts.items).length + 
                               (skills.skills || skills.items).length,
          averageProfileScore: profiles.metadata?.averageScore || 75,
          averageSwapScore: swaps.metadata?.averageScore || 75,
          averagePostScore: posts.metadata?.averageScore || 75,
          averageSkillScore: skills.metadata?.averageScore || 75,
          isCompleteProfile: profiles.metadata?.isCompleteProfile || false
        }
      };
    } catch (error) {
      logger.error('Error getting dashboard recommendations:', error);
      throw error;
    }
  }

  // Get exploration recommendations (diverse content)
  async getExplorationRecommendations(userId = null, limit = 20) {
    try {
      let currentUser = null;
      let isCompleteProfile = false;

      if (userId) {
        currentUser = await User.findById(userId)
          .populate('skills')
          .populate('lookingFor')
          .select('_id firstName lastName avatar username skills lookingFor bio location')
          .limit(1)
          .lean();
        
        isCompleteProfile = this.isProfileComplete(currentUser);
      }

      // Get diverse content from different categories
      const [newUsers, trendingSwaps, popularPosts, trendingSkills] = await Promise.all([
        User.find({ 
          _id: userId ? { $ne: userId } : { $exists: true },
          'privacy.profile': 'public',
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        })
        .populate('skills')
        .populate('lookingFor')
        .limit(5)
        .select('_id firstName lastName avatar username skills lookingFor bio location')
        .lean(),

        SwapCard.find({ 
          status: 'open',
          user: userId ? { $ne: userId } : { $exists: true },
          likes: { $gte: 3 } // Popular swaps
        })
        .populate('user', 'username firstName lastName avatar')
        .populate('offeredSkill')
        .populate('desiredSkill')
        .limit(5)
        .select('_id user offeredSkill desiredSkill status createdAt title likes')
        .lean(),

        Post.find({ 
          visibility: 'public',
          user: userId ? { $ne: userId } : { $exists: true },
          likes: { $gte: 5 } // Popular posts
        })
        .populate('user', 'username firstName lastName avatar')
        .populate('likes')
        .limit(5)
        .select('_id user content createdAt likes comments postType media tags community')
        .lean(),

        Skill.find({ 
          user: userId ? { $ne: userId } : { $exists: true },
          isLookingFor: false,
          rating: { $gte: 4 } // High-rated skills
        })
        .populate('user', 'username firstName lastName avatar')
        .limit(5)
        .select('_id user title description rating experienceLevel availability tags')
        .lean()
      ]);

      return {
        newUsers: newUsers.map(user => ({
          ...user,
          type: 'new_user',
          matchScore: isCompleteProfile ? 
            Math.round(this.calculateUserSimilarity(currentUser, user) * 100) : 
            Math.floor(Math.random() * 40) + 60
        })),
        trendingSwaps: trendingSwaps.map(swap => ({
          ...swap,
          type: 'trending_swap',
          relevanceScore: isCompleteProfile ? 
            Math.round(this.calculateSwapRelevance(currentUser, swap) * 100) : 
            Math.floor(Math.random() * 40) + 60
        })),
        popularPosts: popularPosts.map(post => ({
          ...post,
          type: 'popular_post',
          relevanceScore: isCompleteProfile ? 
            Math.round(this.calculatePostRelevance(currentUser, post) * 100) : 
            Math.floor(Math.random() * 40) + 60
        })),
        trendingSkills: trendingSkills.map(skill => ({
          ...skill,
          type: 'trending_skill',
          relevanceScore: isCompleteProfile ? 
            Math.round(this.calculateSkillRelevance(currentUser, skill) * 100) : 
            Math.floor(Math.random() * 40) + 60
        }))
      };
    } catch (error) {
      logger.error('Error getting exploration recommendations:', error);
      throw error;
    }
  }

  // Record user feedback on recommendations
  async recordFeedback(userId, type, itemId, rating, feedback = '') {
    try {
      if (!userId) {
        throw new Error('User ID is required for feedback');
      }

      const feedbackData = {
        user: userId,
        type,
        itemId,
        rating,
        feedback,
        metadata: {
          algorithm: 'recommendation_v1',
          weights: this.weights,
          timestamp: new Date()
        }
      };

      await RecommendationFeedback.create(feedbackData);

      logger.info('Recommendation feedback recorded', {
        userId,
        type,
        itemId,
        rating,
        feedback
      });

      return { success: true, message: 'Feedback recorded successfully' };
    } catch (error) {
      logger.error('Error recording recommendation feedback:', error);
      throw error;
    }
  }

  // Helper method to get compatibility level
  getCompatibilityLevel(score) {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    return 'poor';
  }
}

module.exports = new RecommendationService(); 