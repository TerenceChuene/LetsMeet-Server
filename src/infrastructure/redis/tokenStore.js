import { getRedis } from './client.js';
import { hashToken } from '../../utils/tokens.js';

const PREFIX = {
  emailVerify: 'auth:email-verify:',
  passwordReset: 'auth:password-reset:',
};

async function setToken(prefix, rawToken, payload, ttlSeconds) {
  const client = getRedis();
  const key = `${prefix}${hashToken(rawToken)}`;
  await client.set(key, JSON.stringify(payload), 'EX', ttlSeconds);
  return key;
}

async function consumeToken(prefix, rawToken) {
  const client = getRedis();
  const key = `${prefix}${hashToken(rawToken)}`;
  const value = await client.get(key);
  if (!value) return null;
  await client.del(key);
  return JSON.parse(value);
}

async function peekToken(prefix, rawToken) {
  const client = getRedis();
  const key = `${prefix}${hashToken(rawToken)}`;
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
}

export async function storeEmailVerificationToken(rawToken, userId, ttlSeconds = 86_400) {
  return setToken(PREFIX.emailVerify, rawToken, { userId, purpose: 'email_verify' }, ttlSeconds);
}

export async function consumeEmailVerificationToken(rawToken) {
  return consumeToken(PREFIX.emailVerify, rawToken);
}

export async function storePasswordResetToken(rawToken, userId, ttlSeconds = 3_600) {
  return setToken(PREFIX.passwordReset, rawToken, { userId, purpose: 'password_reset' }, ttlSeconds);
}

export async function consumePasswordResetToken(rawToken) {
  return consumeToken(PREFIX.passwordReset, rawToken);
}

export async function peekPasswordResetToken(rawToken) {
  return peekToken(PREFIX.passwordReset, rawToken);
}
