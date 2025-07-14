const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp, connectTestDB, disconnectTestDB, clearTestDB } = require('../helpers/testServer');
const User = require('../../models/User');
const Skill = require('../../models/Skill');

const app = createTestApp();

// Increase timeout for all tests in this file
jest.setTimeout(30000);

describe('Skills API', () => {
  let token;
  let user;
  let skill;

  beforeAll(async () => {
    try {
      await connectTestDB();
    } catch (error) {
      console.error('Failed to connect to test database:', error);
      throw error;
    }
  }, 10000);

  afterAll(async () => {
    try {
      await disconnectTestDB();
    } catch (error) {
      console.error('Failed to disconnect from test database:', error);
      throw error;
    }
  }, 10000);

  beforeEach(async () => {
    try {
      await clearTestDB();

      // Create test user
      user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        gender: 'male',
        bio: 'Test bio',
        location: {
          city: 'Test City',
          country: 'Test Country'
        },
        contact: {
          email: 'test@example.com',
          phone: '1234567890',
          visibility: 'public'
        }
      });

      // Login to get token
      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      token = loginRes.body.token;

      // Create test skill
      skill = await Skill.create({
        user: user._id,
        title: 'Test Skill',
        description: 'Test Description',
        category: 'Programming',
        tags: ['JavaScript', 'Node.js'],
        level: 'Intermediate',
        experience: '2-5 years',
        availability: 'Available',
        rate: {
          amount: 50,
          currency: 'USD',
          period: 'hour'
        },
        location: {
          type: 'Remote',
          city: 'Test City',
          country: 'Test Country'
        },
        languages: ['English'],
        certifications: ['Test Certification'],
        portfolio: ['https://example.com/portfolio'],
        rating: 4.5,
        reviews: []
      });
    } catch (error) {
      console.error('Failed to setup test data:', error);
      throw error;
    }
  });

  describe('GET /api/skills', () => {
    it('should get all skills', async () => {
      const res = await request(app)
        .get('/api/skills')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('title', 'Test Skill');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/skills');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/skills', () => {
    const validSkillData = {
      title: 'New Skill',
      description: 'New Description',
      category: 'Design',
      tags: ['UI', 'UX'],
      level: 'Beginner',
      experience: '0-2 years',
      availability: 'Available',
      rate: {
        amount: 30,
        currency: 'USD',
        period: 'hour'
      },
      location: {
        type: 'Remote',
        city: 'New City',
        country: 'New Country'
      },
      languages: ['English', 'Spanish'],
      certifications: ['New Certification'],
      portfolio: ['https://example.com/new-portfolio']
    };

    it('should create a new skill', async () => {
      const res = await request(app)
        .post('/api/skills')
        .set('Authorization', `Bearer ${token}`)
        .send(validSkillData);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('title', validSkillData.title);
      expect(res.body).toHaveProperty('user', user._id.toString());
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/skills')
        .send(validSkillData);

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/skills')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/skills/:id', () => {
    const updateData = {
      title: 'Updated Skill',
      description: 'Updated Description',
      level: 'Expert',
      rate: {
        amount: 75,
        currency: 'USD',
        period: 'hour'
      }
    };

    it('should update an existing skill', async () => {
      const res = await request(app)
        .put(`/api/skills/${skill._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('title', updateData.title);
      expect(res.body).toHaveProperty('description', updateData.description);
      expect(res.body).toHaveProperty('level', updateData.level);
      expect(res.body.rate).toHaveProperty('amount', updateData.rate.amount);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .put(`/api/skills/${skill._id}`)
        .send(updateData);

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should not update non-existent skill', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/skills/${fakeId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(updateData);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/skills/:id', () => {
    it('should delete an existing skill', async () => {
      const res = await request(app)
        .delete(`/api/skills/${skill._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Skill deleted successfully');

      // Verify skill is deleted
      const deletedSkill = await Skill.findById(skill._id);
      expect(deletedSkill).toBeNull();
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .delete(`/api/skills/${skill._id}`);

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should not delete non-existent skill', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/skills/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/skills/user/:userId', () => {
    it('should get all skills for a user', async () => {
      const res = await request(app)
        .get(`/api/skills/user/${user._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('user', user._id.toString());
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get(`/api/skills/user/${user._id}`);

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return empty array for user with no skills', async () => {
      const newUser = await User.create({
        username: 'newuser',
        email: 'new@example.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User',
        gender: 'male',
        bio: 'New bio',
        location: {
          city: 'New City',
          country: 'New Country'
        },
        contact: {
          email: 'new@example.com',
          phone: '9876543210',
          visibility: 'public'
        }
      });

      const res = await request(app)
        .get(`/api/skills/user/${newUser._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });
}); 