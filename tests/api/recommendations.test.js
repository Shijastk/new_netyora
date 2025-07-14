const request = require('supertest');
const mongoose = require('mongoose');
const { testServer } = require('../helpers/testServer');
const User = require('../../models/User');
const Skill = require('../../models/Skill');
const SwapCard = require('../../models/SwapCard');
const Post = require('../../models/Post');

describe('Recommendation API', () => {
  let app;
  let testUser;
  let testSkill1;
  let testSkill2;
  let testSwapCard;
  let testPost;

  beforeAll(async () => {
    app = await testServer();
  });

  beforeEach(async () => {
    // Create test user
    testUser = await User.create({
      email: 'test@example.com',
      password: 'password123',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      bio: 'Test bio',
      location: { city: 'Test City', country: 'Test Country' }
    });

    // Create test skills
    testSkill1 = await Skill.create({
      user: testUser._id,
      title: 'JavaScript Programming',
      description: 'Expert in JavaScript',
      category: 'Programming',
      tags: ['javascript', 'web'],
      experienceLevel: 'expert',
      availability: 'available',
      rating: 4.5
    });

    testSkill2 = await Skill.create({
      user: testUser._id,
      title: 'Python Programming',
      description: 'Looking to learn Python',
      category: 'Programming',
      tags: ['python', 'data'],
      experienceLevel: 'beginner',
      availability: 'available',
      rating: 3.0,
      isLookingFor: true
    });

    // Create test swap card
    testSwapCard = await SwapCard.create({
      user: testUser._id,
      offeredSkill: testSkill1._id,
      desiredSkill: testSkill2._id,
      description: 'Looking to swap JavaScript for Python',
      status: 'open',
      tags: ['programming', 'swap']
    });

    // Create test post
    testPost = await Post.create({
      title: 'Test Post',
      user: testUser._id,
      content: 'This is a test post about programming',
      tags: ['programming', 'javascript'],
      visibility: 'public'
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Skill.deleteMany({});
    await SwapCard.deleteMany({});
    await Post.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /api/recommendations/profiles', () => {
    it('should return profile recommendations without authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/profiles')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.metadata).toBeDefined();
    });

    it('should return profile recommendations with authentication', async () => {
      // Login to get token
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/recommendations/profiles')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/recommendations/swaps', () => {
    it('should return swap recommendations without authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/swaps')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return swap recommendations with authentication', async () => {
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/recommendations/swaps')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/recommendations/posts', () => {
    it('should return post recommendations without authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/posts')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return post recommendations with authentication', async () => {
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/recommendations/posts')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/recommendations/skills', () => {
    it('should return skill recommendations without authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/skills')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return skill recommendations with authentication', async () => {
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/recommendations/skills')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/recommendations/dashboard', () => {
    it('should return dashboard recommendations without authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/dashboard')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.profiles).toBeDefined();
      expect(response.body.data.swaps).toBeDefined();
      expect(response.body.data.posts).toBeDefined();
      expect(response.body.data.skills).toBeDefined();
    });

    it('should return dashboard recommendations with authentication', async () => {
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .get('/api/recommendations/dashboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('GET /api/recommendations/explore', () => {
    it('should return exploration recommendations without authentication', async () => {
      const response = await request(app)
        .get('/api/recommendations/explore')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.newUsers).toBeDefined();
      expect(response.body.data.trendingSwaps).toBeDefined();
      expect(response.body.data.popularPosts).toBeDefined();
      expect(response.body.data.trendingSkills).toBeDefined();
    });
  });

  describe('POST /api/recommendations/feedback', () => {
    it('should require authentication for feedback', async () => {
      const response = await request(app)
        .post('/api/recommendations/feedback')
        .send({
          type: 'profile',
          itemId: testUser._id,
          rating: 5,
          feedback: 'Great recommendation!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should accept feedback with authentication', async () => {
      const loginResponse = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      const token = loginResponse.body.token;

      const response = await request(app)
        .post('/api/recommendations/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'profile',
          itemId: testUser._id,
          rating: 5,
          feedback: 'Great recommendation!'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Feedback recorded successfully');
    });
  });
}); 