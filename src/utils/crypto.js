import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function newUuid() {
  return randomUUID();
}

/**
 * Parse durations like 15m, 7d, 3600s into milliseconds.
 * @param {string} value
 * @returns {number}
 */
export function parseDurationToMs(value) {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(String(value).trim());
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit];
}

export function addDuration(fromDate, duration) {
  return new Date(fromDate.getTime() + parseDurationToMs(duration));
}
