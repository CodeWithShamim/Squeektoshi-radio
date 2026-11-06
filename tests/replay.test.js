import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTertiles,
  resolveBucketMood,
  calculateRhythmBusyness,
  composeDayPlan,
} from '../src/music/replay.js';

describe('Replay The Day - Pure Deterministic Composition', () => {
  it('calculates tertiles accurately', () => {
    // 6 values: 10, 20, 30, 40, 50, 60
    const buckets = [
      { workAdded: 10 },
      { workAdded: 20 },
      { workAdded: 30 },
      { workAdded: 40 },
      { workAdded: 50 },
      { workAdded: 60 },
    ];
    const { t1, t2 } = calculateTertiles(buckets);
    // t1 at index 2 = 30, t2 at index 4 = 50
    assert.equal(t1, 30);
    assert.equal(t2, 50);
  });

  it('resolves bucket mood based on tertiles', () => {
    const t1 = 100;
    const t2 = 500;

    // 0 work -> always sleep
    assert.equal(resolveBucketMood(0, t1, t2), 'sleep');

    // <= t1 -> sleep
    assert.equal(resolveBucketMood(50, t1, t2), 'sleep');
    assert.equal(resolveBucketMood(100, t1, t2), 'sleep');

    // between t1 and t2 -> jog
    assert.equal(resolveBucketMood(101, t1, t2), 'jog');
    assert.equal(resolveBucketMood(350, t1, t2), 'jog');
    assert.equal(resolveBucketMood(500, t1, t2), 'jog');

    // > t2 -> zoomies
    assert.equal(resolveBucketMood(501, t1, t2), 'zoomies');
    assert.equal(resolveBucketMood(2500, t1, t2), 'zoomies');
  });

  it('determines rhythmic busyness from completedBlockCount', () => {
    assert.equal(calculateRhythmBusyness(0), 1);
    assert.equal(calculateRhythmBusyness(1), 2);
    assert.equal(calculateRhythmBusyness(5), 3);
    assert.equal(calculateRhythmBusyness(15), 4);
  });

  it('deterministically composes 24 hour segments', () => {
    const sampleBuckets = Array.from({ length: 24 }, (_, i) => ({
      startAt: `2026-11-05T${String(i).padStart(2, '0')}:00:00.000Z`,
      endAt: `2026-11-05T${String(i + 1).padStart(2, '0')}:00:00.000Z`,
      workAdded: i * 150,
      completedBlockCount: Math.floor(i / 2),
    }));

    const plan1 = composeDayPlan(sampleBuckets);
    const plan2 = composeDayPlan(sampleBuckets);

    assert.equal(plan1.length, 24);
    assert.deepEqual(plan1, plan2);

    // Verify first hour (0 work) is sleep
    assert.equal(plan1[0].mood, 'sleep');
    assert.equal(plan1[0].bpm, 48);

    // Verify highest work hour is zoomies
    assert.equal(plan1[23].mood, 'zoomies');
    assert.equal(plan1[23].bpm, 136);

    // Total duration: exactly 120s (2 minutes)
    const totalDuration = plan1.reduce((sum, item) => sum + item.durationSec, 0);
    assert.equal(totalDuration, 120);
  });
});

