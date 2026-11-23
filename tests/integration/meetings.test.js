import { afterAll, describe, expect, it } from 'vitest';
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

describe.skipIf(!hasInfra)('meetings + participants HTTP flows', () => {
  const app = createApp();
  const stamp = Date.now();

  let hostToken;
  let guestToken;
  let hostId;
  let guestId;
  let meetingId;
  let meetingCode;

  afterAll(async () => {
    if (meetingId) {
      await prisma.meetingParticipant.deleteMany({ where: { meetingId } });
      await prisma.meeting.deleteMany({ where: { id: meetingId } });
    }
    if (hostId) {
      await prisma.auditLog.deleteMany({ where: { actorId: hostId } });
      await prisma.refreshToken.deleteMany({ where: { userId: hostId } });
      await prisma.userSession.deleteMany({ where: { userId: hostId } });
      await prisma.userSettings.deleteMany({ where: { userId: hostId } });
      await prisma.userProfile.deleteMany({ where: { userId: hostId } });
      await prisma.user.deleteMany({ where: { id: hostId } });
    }
    if (guestId) {
      await prisma.auditLog.deleteMany({ where: { actorId: guestId } });
      await prisma.refreshToken.deleteMany({ where: { userId: guestId } });
      await prisma.userSession.deleteMany({ where: { userId: guestId } });
      await prisma.userSettings.deleteMany({ where: { userId: guestId } });
      await prisma.userProfile.deleteMany({ where: { userId: guestId } });
      await prisma.user.deleteMany({ where: { id: guestId } });
    }
    await disconnectRedis();
    await prisma.$disconnect();
  });

  async function register(email, displayName) {
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'SecurePass1',
      displayName,
    });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  it('registers host and guest users', async () => {
    const host = await register(`host_${stamp}@example.com`, 'Host User');
    const guest = await register(`guest_${stamp}@example.com`, 'Guest User');
    hostToken = host.accessToken;
    guestToken = guest.accessToken;
    hostId = host.user.id;
    guestId = guest.user.id;
  });

  it('creates a password-protected meeting with waiting room', async () => {
    const res = await request(app)
      .post('/api/v1/meetings')
      .set('Authorization', `Bearer ${hostToken}`)
      .send({
        title: 'Phase 3 Sync',
        password: 'meet1234',
        waitingRoomEnabled: true,
        visibility: 'PRIVATE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(res.body.data.hasPassword).toBe(true);
    expect(res.body.data.participants[0].role).toBe('HOST');

    meetingId = res.body.data.id;
    meetingCode = res.body.data.code;
  });

  it('puts a guest into the waiting room on join', async () => {
    const res = await request(app)
      .post(`/api/v1/meetings/${meetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ password: 'meet1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.waitingRoom).toBe(true);
    expect(res.body.data.participant.status).toBe('WAITING');
  });

  it('rejects guest participant state updates while waiting', async () => {
    const res = await request(app)
      .patch(`/api/v1/meetings/${meetingId}/participants/${guestId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ handRaised: true });

    expect(res.status).toBe(403);
  });

  it('allows the host to approve the waiting guest', async () => {
    const waiting = await request(app)
      .get(`/api/v1/meetings/${meetingId}/waiting-room`)
      .set('Authorization', `Bearer ${hostToken}`);
    expect(waiting.status).toBe(200);
    expect(waiting.body.data.some((p) => p.userId === guestId)).toBe(true);

    const res = await request(app)
      .post(`/api/v1/meetings/${meetingId}/waiting-room/${guestId}/approve`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('JOINED');
  });

  it('lets an admitted guest update their own AV state', async () => {
    const res = await request(app)
      .patch(`/api/v1/meetings/${meetingId}/participants/${guestId}`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ micEnabled: true, handRaised: true });

    expect(res.status).toBe(200);
    expect(res.body.data.micEnabled).toBe(true);
    expect(res.body.data.handRaised).toBe(true);
  });

  it('allows the host to mute a participant', async () => {
    const res = await request(app)
      .patch(`/api/v1/meetings/${meetingId}/participants/${guestId}`)
      .set('Authorization', `Bearer ${hostToken}`)
      .send({ isMutedByHost: true });

    expect(res.status).toBe(200);
    expect(res.body.data.isMutedByHost).toBe(true);
    expect(res.body.data.micEnabled).toBe(false);
  });

  it('prevents a non-host from removing participants', async () => {
    const res = await request(app)
      .post(`/api/v1/meetings/${meetingId}/participants/${hostId}/remove`)
      .set('Authorization', `Bearer ${guestToken}`);

    expect(res.status).toBe(403);
  });

  it('joins by meeting code', async () => {
    // leave then rejoin by code to exercise reconnect path
    await request(app)
      .post(`/api/v1/meetings/${meetingId}/leave`)
      .set('Authorization', `Bearer ${guestToken}`);

    const res = await request(app)
      .post('/api/v1/meetings/join')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ code: meetingCode, password: 'meet1234' });

    expect(res.status).toBe(200);
    expect(res.body.data.meeting.id).toBe(meetingId);
  });

  it('ends the meeting as host', async () => {
    const res = await request(app)
      .post(`/api/v1/meetings/${meetingId}/end`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ENDED');
  });

  it('rejects joining an ended meeting', async () => {
    const res = await request(app)
      .post(`/api/v1/meetings/${meetingId}/join`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ password: 'meet1234' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEETING_CLOSED');
  });
});

describe.runIf(!hasInfra)('meetings + participants (infra unavailable)', () => {
  it('skips integration tests when Postgres/Redis are down', () => {
    expect(hasInfra).toBe(false);
  });
});
