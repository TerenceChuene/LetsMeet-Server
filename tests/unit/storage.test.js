import { describe, expect, it } from 'vitest';
import { buildRecordingObjectKey } from '../../src/infrastructure/storage/azureBlob.js';

describe('storage helpers', () => {
  it('builds safe recording object keys', () => {
    const key = buildRecordingObjectKey(
      '11111111-1111-1111-1111-111111111111',
      'clip name!.mp4',
    );
    expect(key).toBe(
      'recordings/11111111-1111-1111-1111-111111111111/clip_name_.mp4',
    );
  });
});
