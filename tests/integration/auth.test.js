import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/database/prisma.js';
import { connectRedis, disconnectRedis, getRedis } from '../../src/infrastructure/redis/client.js';

const hasInfra = await (async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await connectRedis();
    await getRedis().ping();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasInfra)('auth + users HTTP flows', () => {
  const app = createApp();
  const email = `phase2_${Date.now()}@example.com`;
  const password = 'SecurePass1';
  let accessToken;
  let refreshToken;
  let userId;
  let verificationToken;

  afterAll(async () => {
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { actorId: userId } });
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.userSession.deleteMany({ where: { userId } });
      await prisma.userSettings.deleteMany({ where: { userId } });
      await prisma.userProfile.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await disconnectRedis();
    await prisma.$disconnect();
  });

  it('registers a user and returns tokens without plaintext password', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password,
      displayName: 'Phase Two',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(password);

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
    userId = res.body.data.user.id;
    verificationToken = res.body.data.verificationToken;
  });

  it('rejects invalid login credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'WrongPass1',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email,
      password,
    });
    expect(res.status).toBe(200);
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('protects /users/me without a token', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user with a valid access token', async () => {
    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(userId);
    expect(res.body.data.profile.displayName).toBe('Phase Two');
  });

  it('updates the current user profile', async () => {
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ displayName: 'Phase Two Updated', bio: 'Hello' });

    expect(res.status).toBe(200);
    expect(res.body.data.profile.displayName).toBe('Phase Two Updated');
    expect(res.body.data.profile.bio).toBe('Hello');
  });

  it('rotates refresh tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).not.toBe(refreshToken);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_REUSE');

    refreshToken = res.body.data.refreshToken;
    accessToken = res.body.data.accessToken;
  });

  it('verifies email when a token is present', async () => {
    if (!verificationToken) return;

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ token: verificationToken });

    expect(res.status).toBe(200);
    expect(res.body.data.user.status).toBe('ACTIVE');
  });

  it('logs out and rejects the refresh token afterwards', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refreshToken });

    expect(res.status).toBe(200);

    const refresh = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe.runIf(!hasInfra)('auth + users HTTP flows (infra unavailable)', () => {
  it('skips integration tests when Postgres/Redis are down', () => {
    expect(hasInfra).toBe(false);
  });
});
