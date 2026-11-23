import { prisma } from '../../../database/prisma.js';

export async function writeAuditLog({
  actorId = null,
  action,
  resource,
  resourceId = null,
  ipAddress = null,
  userAgent = null,
  metadata = {},
}) {
  return prisma.auditLog.create({
    data: {
      actorId,
      action,
      resource,
      resourceId,
      ipAddress,
      userAgent,
      metadata,
    },
  });
}
