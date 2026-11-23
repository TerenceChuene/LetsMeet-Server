import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function randomSegment(length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/**
 * Google Meet–style code: abc-defg-hij
 */
export function generateMeetingCode() {
  return `${randomSegment(3)}-${randomSegment(4)}-${randomSegment(3)}`;
}

export function normalizeMeetingCode(code) {
  return String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function isValidMeetingCodeFormat(code) {
  return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(normalizeMeetingCode(code));
}
