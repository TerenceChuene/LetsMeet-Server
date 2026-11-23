import { getRedis } from './client.js';

function activeKey(meetingId) {
  return `meeting:${meetingId}:active`;
}

function stateKey(meetingId, userId) {
  return `meeting:${meetingId}:participant:${userId}`;
}

function waitingKey(meetingId) {
  return `meeting:${meetingId}:waiting`;
}

export async function markParticipantActive(meetingId, userId, state = {}) {
  const client = getRedis();
  const pipeline = client.pipeline();
  pipeline.sadd(activeKey(meetingId), userId);
  pipeline.set(
    stateKey(meetingId, userId),
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }),
    'EX',
    60 * 60 * 6,
  );
  pipeline.srem(waitingKey(meetingId), userId);
  await pipeline.exec();
}

export async function markParticipantWaiting(meetingId, userId) {
  const client = getRedis();
  await client.sadd(waitingKey(meetingId), userId);
  await client.srem(activeKey(meetingId), userId);
}

export async function clearParticipantPresence(meetingId, userId) {
  const client = getRedis();
  const pipeline = client.pipeline();
  pipeline.srem(activeKey(meetingId), userId);
  pipeline.srem(waitingKey(meetingId), userId);
  pipeline.del(stateKey(meetingId, userId));
  await pipeline.exec();
}

export async function getActiveParticipantIds(meetingId) {
  const client = getRedis();
  return client.smembers(activeKey(meetingId));
}

export async function getWaitingParticipantIds(meetingId) {
  const client = getRedis();
  return client.smembers(waitingKey(meetingId));
}

export async function clearMeetingPresence(meetingId) {
  const client = getRedis();
  const active = await client.smembers(activeKey(meetingId));
  const waiting = await client.smembers(waitingKey(meetingId));
  const pipeline = client.pipeline();
  pipeline.del(activeKey(meetingId));
  pipeline.del(waitingKey(meetingId));
  for (const userId of [...active, ...waiting]) {
    pipeline.del(stateKey(meetingId, userId));
  }
  await pipeline.exec();
}
