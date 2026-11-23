import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/utils/AppError.js';
import {
  assertHost,
  assertMeetingJoinable,
  defaultParticipantPermissions,
  isHostRole,
} from '../../src/modules/meetings/utils/permissions.js';

describe('meeting permissions', () => {
  it('recognises host roles', () => {
    expect(isHostRole('HOST')).toBe(true);
    expect(isHostRole('CO_HOST')).toBe(true);
    expect(isHostRole('PARTICIPANT')).toBe(false);
  });

  it('asserts host privileges', () => {
    expect(() => assertHost({ role: 'PARTICIPANT' })).toThrow(AppError);
    expect(() => assertHost({ role: 'HOST' })).not.toThrow();
  });

  it('blocks joining closed meetings', () => {
    expect(() =>
      assertMeetingJoinable({ status: 'ENDED', deletedAt: null }),
    ).toThrow(AppError);
  });

  it('returns elevated permissions for hosts', () => {
    expect(defaultParticipantPermissions('HOST').canAdmit).toBe(true);
    expect(defaultParticipantPermissions('PARTICIPANT').canAdmit).toBe(false);
  });
});
