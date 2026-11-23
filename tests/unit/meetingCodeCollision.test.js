import { describe, expect, it } from 'vitest';
import { generateMeetingCode, isValidMeetingCodeFormat } from '../../src/modules/meetings/utils/meetingCode.js';

describe('meeting code uniqueness characteristics', () => {
  it('generates many valid unique codes in a sample', () => {
    const codes = new Set();
    for (let i = 0; i < 200; i += 1) {
      const code = generateMeetingCode();
      expect(isValidMeetingCodeFormat(code)).toBe(true);
      codes.add(code);
    }
    expect(codes.size).toBe(200);
  });
});
