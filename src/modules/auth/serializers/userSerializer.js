export function serializeUser(user, { includeSettings = false } = {}) {
  if (!user) return null;

  const base = {
    id: user.id,
    email: user.email,
    status: user.status,
    globalRole: user.globalRole,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    profile: user.profile
      ? {
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
          bio: user.profile.bio,
          timezone: user.profile.timezone,
          locale: user.profile.locale,
        }
      : null,
  };

  if (includeSettings && user.settings) {
    base.settings = {
      emailNotifications: user.settings.emailNotifications,
      meetingReminders: user.settings.meetingReminders,
      inAppNotifications: user.settings.inAppNotifications,
      defaultMuteMicrophone: user.settings.defaultMuteMicrophone,
      defaultDisableCamera: user.settings.defaultDisableCamera,
      preferences: user.settings.preferences,
    };
  }

  return base;
}

export function serializePublicProfile(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.profile?.displayName ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    bio: user.profile?.bio ?? null,
    lastSeenAt: user.lastSeenAt,
  };
}
