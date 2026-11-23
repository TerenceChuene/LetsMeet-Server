import { AppError } from '../../../utils/AppError.js';
import {
  serializePublicProfile,
  serializeUser,
} from '../../auth/serializers/userSerializer.js';
import { writeAuditLog } from '../../auth/repositories/auditRepository.js';
import * as userRepo from '../repositories/userRepository.js';

export async function getMe(user) {
  return serializeUser(user, { includeSettings: true });
}

export async function updateMe(userId, payload, context = {}) {
  const profile = {};
  const settings = {};

  if (payload.displayName !== undefined) profile.displayName = payload.displayName;
  if (payload.avatarUrl !== undefined) profile.avatarUrl = payload.avatarUrl;
  if (payload.bio !== undefined) profile.bio = payload.bio;
  if (payload.timezone !== undefined) profile.timezone = payload.timezone;
  if (payload.locale !== undefined) profile.locale = payload.locale;

  if (payload.settings) {
    const s = payload.settings;
    if (s.emailNotifications !== undefined) settings.emailNotifications = s.emailNotifications;
    if (s.meetingReminders !== undefined) settings.meetingReminders = s.meetingReminders;
    if (s.inAppNotifications !== undefined) settings.inAppNotifications = s.inAppNotifications;
    if (s.defaultMuteMicrophone !== undefined) {
      settings.defaultMuteMicrophone = s.defaultMuteMicrophone;
    }
    if (s.defaultDisableCamera !== undefined) {
      settings.defaultDisableCamera = s.defaultDisableCamera;
    }
    if (s.preferences !== undefined) settings.preferences = s.preferences;
  }

  const updated = await userRepo.updateProfileAndSettings(userId, { profile, settings });

  await writeAuditLog({
    actorId: userId,
    action: 'user.update_me',
    resource: 'user',
    resourceId: userId,
    ipAddress: context.ip,
    userAgent: context.userAgent,
    metadata: {
      fields: [...Object.keys(profile), ...Object.keys(settings).map((k) => `settings.${k}`)],
    },
  });

  return serializeUser(updated, { includeSettings: true });
}

export async function getUserById(id, requester) {
  const user = await userRepo.findById(id);
  if (!user) {
    throw new AppError('User not found', 404, { code: 'USER_NOT_FOUND' });
  }

  if (requester?.id === user.id) {
    return serializeUser(user, { includeSettings: true });
  }

  return serializePublicProfile(user);
}

export async function search(query, limit) {
  if (!query || query.trim().length < 2) {
    throw new AppError('Search query must be at least 2 characters', 400, {
      code: 'INVALID_QUERY',
    });
  }

  const users = await userRepo.searchUsers({ query: query.trim(), limit });
  return users.map(serializePublicProfile);
}
