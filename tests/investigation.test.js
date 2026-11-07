import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { composeDayPlan } from '../src/music/replay.js';
import { ConcurrencyLimiter, fetchAllAccountTokens } from '../src/api.js';

describe('Investigation & Resilience Verification Tests', () => {
  test('REPLAY: unavailable bucket is marked as rest/no-data, NOT sleep', () => {
    const rawBuckets = [
      { startAt: '2026-11-06T10:00:00Z', endAt: '2026-11-06T11:00:00Z', workAdded: 500, completedBlockCount: 2 },
      { startAt: '2026-11-06T11:00:00Z', endAt: '2026-11-06T12:00:00Z', status: 'unavailable', workAdded: null, completedBlockCount: 0 },
    ];

    const plan = composeDayPlan(rawBuckets);
    const unavailableHour = plan[1];

    assert.equal(unavailableHour.mood, 'rest');
    assert.equal(unavailableHour.isUnavailable, true);
    assert.equal(unavailableHour.bpm, 0);
  });

  test('REPLAY DETERMINISM: identical raw buckets always produce identical compositions', () => {
    const rawBuckets = Array.from({ length: 24 }, (_, i) => ({
      startAt: `2026-11-06T${String(i).padStart(2, '0')}:00:00Z`,
      endAt: `2026-11-06T${String(i + 1).padStart(2, '0')}:00:00Z`,
      workAdded: (i * 137) % 1000,
      completedBlockCount: i % 4,
    }));

    const plan1 = composeDayPlan(rawBuckets);
    const plan2 = composeDayPlan(rawBuckets);

    assert.deepEqual(plan1, plan2);
    assert.equal(plan1.length, 24);
  });

  test('CONCURRENCY LIMITER: caps active concurrent tasks to 4', async () => {
    const limiter = new ConcurrencyLimiter(4);
    let active = 0;
    let maxObservedActive = 0;

    const task = async () => {
      active++;
      if (active > maxObservedActive) maxObservedActive = active;
      await new Promise((r) => setTimeout(r, 20));
      active--;
    };

    const promises = Array.from({ length: 12 }, () => limiter.run(task));
    await Promise.all(promises);

    assert.equal(maxObservedActive <= 4, true, `Max observed active ${maxObservedActive} must not exceed 4`);
  });

  test('PAGINATION: 409 cursor_invalidated triggers restart from page 1', async () => {
    let callCount = 0;
    const mockFetchFn = async (url) => {
      callCount++;
      const u = new URL(url);
      const cursor = u.searchParams.get('cursor');

      if (callCount === 1) {
        // Page 1 success
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            tokens: [{ tokenId: '1', level: 1 }],
            nextCursor: 'bad_cursor_123',
          }),
        };
      } else if (callCount === 2) {
        // Page 2 failure with 409 cursor_invalidated
        return {
          ok: false,
          status: 409,
          headers: new Headers(),
          json: async () => ({ error: 'cursor_invalidated' }),
        };
      } else {
        // Restarted Page 1 success
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({
            tokens: [{ tokenId: '1', level: 1 }],
            nextCursor: null,
          }),
        };
      }
    };

    const tokens = await fetchAllAccountTokens('0x1111111111111111111111111111111111111111', {
      fetchFn: mockFetchFn,
      maxRetries: 0,
    });

    assert.equal(tokens.length, 1);
    assert.equal(callCount >= 3, true, 'Expected pagination to recover and retry from page one');
  });
});
