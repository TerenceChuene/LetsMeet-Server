import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plainText) {
  return argon2.hash(plainText, ARGON2_OPTIONS);
}

export async function verifyPassword(hash, plainText) {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}
