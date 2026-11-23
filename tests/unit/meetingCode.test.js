import { describe, expect, it } from 'vitest';
import {
  generateMeetingCode,
  isValidMeetingCodeFormat,
  normalizeMeetingCode,
} from '../../src/modules/meetings/utils/meetingCode.js';

describe('meeting codes', () => {
  it('generates meet-style codes', () => {
    const code = generateMeetingCode();
    expect(isValidMeetingCodeFormat(code)).toBe(true);
  });

  it('normalizes codes', () => {
    expect(normalizeMeetingCode(' ABC-DEFG-HIJ ')).toBe('abc-defg-hij');
  });
});
