#!/usr/bin/env node
/**
 * Promote a user to ADMIN (or create one).
 * Usage:
 *   node scripts/create-admin.mjs --email admin@example.com --password 'SecurePass1' --name Admin
 *   node scripts/create-admin.mjs --email existing@example.com
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const email = (arg('email') || '').toLowerCase();
  const password = arg('password');
  const displayName = arg('name') || 'Admin';
  const role = arg('role') || 'ADMIN';

  if (!email) {
    throw new Error('--email is required');
  }

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    if (!password) {
      throw new Error('User does not exist; provide --password to create');
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        globalRole: role,
        profile: { create: { displayName } },
        settings: { create: {} },
      },
    });
    console.log(`Created ${role} user ${user.email} (${user.id})`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        globalRole: role,
        status: 'ACTIVE',
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    });
    console.log(`Updated ${user.email} to role ${role}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
