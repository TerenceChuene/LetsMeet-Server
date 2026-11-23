import { describe, expect, it } from 'vitest';
import { createEventRateLimiter } from '../../src/sockets/middleware/eventRateLimit.js';

describe('socket event rate limiter', () => {
  it('allows events under the limit and blocks after', () => {
    const limiter = createEventRateLimiter({ limit: 3, windowMs: 10_000 });
    const socket = {};

    for (let i = 0; i < 3; i += 1) {
      let err;
      limiter(socket, (error) => {
        err = error;
      });
      expect(err).toBeUndefined();
    }

    let blocked;
    limiter(socket, (error) => {
      blocked = error;
    });
    expect(blocked).toBeInstanceOf(Error);
    expect(blocked.message).toBe('RATE_LIMITED');
  });
});
