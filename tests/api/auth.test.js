const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp, connectTestDB, disconnectTestDB, clearTestDB } = require('../helpers/testServer');
const User = require('../../models/User');

const app = createTestApp();

// Increase timeout for all tests in this file
jest.setTimeout(30000);

describe('Authentication API', () => {
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
    } catch (error) {
      console.error('Failed to clear test database:', error);
      throw error;
    }
  });

  describe('POST /api/users/register', () => {
    const validUserData = {
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
    };

    it('should register a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .send(validUserData);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', validUserData.email);
      expect(res.body.user).toHaveProperty('username', validUserData.username);
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should not register user with existing email', async () => {
      await User.create(validUserData);

      const res = await request(app)
        .post('/api/users/register')
        .send(validUserData);

      expect(res.statusCode).toBe(409);
      expect(res.body).toHaveProperty('error', 'Email or username already in use.');
    });

    it('should not register user with missing required fields', async () => {
      const invalidData = { username: 'testuser' };
      
      const res = await request(app)
        .post('/api/users/register')
        .send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Email, password, and username are required.');
    });
  });

  describe('POST /api/users/login', () => {
    beforeEach(async () => {
      await User.create({
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
    });

    it('should login with correct credentials using email', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'test@example.com');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should login with correct credentials using username', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('username', 'testuser');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should login with correct credentials using identifier', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          identifier: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'test@example.com');
      expect(res.body.user).not.toHaveProperty('password');
    });

    it('should not login with wrong password', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials.');
    });

    it('should not login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Invalid credentials.');
    });

    it('should not login with missing credentials', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Password is required.');
    });

    it('should not login with missing identifier', async () => {
      const res = await request(app)
        .post('/api/users/login')
        .send({
          password: 'password123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Please provide either an identifier (email or username), email, or username.');
    });
  });

  describe('GET /api/users/profile/:id', () => {
    let token;
    let user;

    beforeEach(async () => {
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

      const loginRes = await request(app)
        .post('/api/users/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      token = loginRes.body.token;
    });

    it('should get user profile with valid token', async () => {
      const res = await request(app)
        .get(`/api/users/profile/${user._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('email', user.email);
      expect(res.body).toHaveProperty('username', user.username);
      expect(res.body).not.toHaveProperty('password');
    });

    it('should not get profile without token', async () => {
      const res = await request(app)
        .get(`/api/users/profile/${user._id}`);

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should not get profile with invalid token', async () => {
      const res = await request(app)
        .get(`/api/users/profile/${user._id}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should not get profile of non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/users/profile/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty('error', 'User not found.');
    });
  });
}); 