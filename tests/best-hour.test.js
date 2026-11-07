import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectBestHour,
  composeBestHourExcerpt,
  parseWorkValue,
  formatHourLocal,
  formatHourUTC,
} from '../src/replay/best-hour.js';

describe('Best Hour Logic — Unit Tests', () => {
  it('parses work values from numbers, strings, and bigints safely', () => {
    assert.equal(parseWorkValue(100), 100);
    assert.equal(parseWorkValue('450'), 450);
    assert.equal(parseWorkValue(BigInt(1250)), 1250);
    assert.equal(parseWorkValue('  999  '), 999);
    assert.equal(parseWorkValue(null), null);
    assert.equal(parseWorkValue(undefined), null);
    assert.equal(parseWorkValue(''), null);
    assert.equal(parseWorkValue('invalid'), null);
    assert.equal(parseWorkValue(-5), -5);
  });

  it('correctly selects the bucket with the highest workAdded', () => {
    const buckets = [
      { startAt: '2026-11-06T00:00:00Z', endAt: '2026-11-06T01:00:00Z', workAdded: '150', completedBlockCount: '10' },
      { startAt: '2026-11-06T01:00:00Z', endAt: '2026-11-06T02:00:00Z', workAdded: 980, completedBlockCount: 95 },
      { startAt: '2026-11-06T02:00:00Z', endAt: '2026-11-06T03:00:00Z', workAdded: '2400', completedBlockCount: '210' },
      { startAt: '2026-11-06T03:00:00Z', endAt: '2026-11-06T04:00:00Z', workAdded: 500, completedBlockCount: 40 },
    ];

    const result = selectBestHour(buckets);
    assert.equal(result.status, 'ok');
    assert.equal(result.hourIndex, 2);
    assert.equal(result.workAdded, 2400);
    assert.equal(result.completedBlockCount, 210);
    assert.equal(result.rank, 1);
    assert.match(result.rankText, /1 of /);
    assert.ok(result.utcTimeText.includes('02:00 – 03:00 UTC'));
  });

  it('resolves ties by choosing the most recent bucket', () => {
    const buckets = [
      { startAt: '2026-11-06T01:00:00Z', endAt: '2026-11-06T02:00:00Z', workAdded: '1500', completedBlockCount: '120' },
      { startAt: '2026-11-06T02:00:00Z', endAt: '2026-11-06T03:00:00Z', workAdded: '800', completedBlockCount: '60' },
      // Same workAdded as hour 1, but later in time:
      { startAt: '2026-11-06T15:00:00Z', endAt: '2026-11-06T16:00:00Z', workAdded: '1500', completedBlockCount: '135' },
      { startAt: '2026-11-06T16:00:00Z', endAt: '2026-11-06T17:00:00Z', workAdded: '400', completedBlockCount: '30' },
    ];

    const result = selectBestHour(buckets);
    assert.equal(result.status, 'ok');
    // Must select index 2 because it is more recent
    assert.equal(result.hourIndex, 2);
    assert.equal(result.workAdded, 1500);
    assert.equal(result.completedBlockCount, 135);
  });

  it('handles all-zero data by returning status all_zero and exact honest text', () => {
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      startAt: `2026-11-06T${String(i).padStart(2, '0')}:00:00Z`,
      endAt: `2026-11-06T${String((i + 1) % 24).padStart(2, '0')}:00:00Z`,
      workAdded: '0',
      completedBlockCount: '0',
    }));

    const result = selectBestHour(buckets);
    assert.equal(result.status, 'all_zero');
    assert.equal(result.reason, 'No active hour in the last 24 hours.');
    assert.equal(result.hourIndex, -1);
    assert.equal(result.bucket, null);
  });

  it('handles missing and sparse buckets gracefully', () => {
    // Only 3 buckets provided instead of 24
    const sparseBuckets = [
      { startAt: '2026-11-06T10:00:00Z', endAt: '2026-11-06T11:00:00Z', workAdded: '300', completedBlockCount: '25' },
      null,
      { startAt: '2026-11-06T12:00:00Z', endAt: '2026-11-06T13:00:00Z', workAdded: '750', completedBlockCount: '65' },
    ];

    const result = selectBestHour(sparseBuckets);
    assert.equal(result.status, 'ok');
    assert.equal(result.hourIndex, 2);
    assert.equal(result.workAdded, 750);
  });

  it('handles unavailable buckets and unavailable response status', () => {
    // Response object with status: "unavailable"
    const unavailableResponse = {
      status: 'unavailable',
      reason: 'indexer_offline',
      buckets: [],
    };
    const result1 = selectBestHour(unavailableResponse);
    assert.equal(result1.status, 'unavailable');
    assert.equal(result1.reason, 'Hour data unknown right now.');
    assert.equal(result1.hourIndex, -1);

    // Array with all buckets marked unavailable
    const unavailableBuckets = [
      { status: 'unavailable', workAdded: null },
      { isUnavailable: true, workAdded: 500 },
      { status: 'unavailable', workAdded: '1200' },
    ];
    const result2 = selectBestHour(unavailableBuckets);
    assert.equal(result2.status, 'unavailable');
    assert.equal(result2.reason, 'Hour data unknown right now.');

    // Null or undefined input
    assert.equal(selectBestHour(null).status, 'unavailable');
    assert.equal(selectBestHour(undefined).status, 'unavailable');
    assert.equal(selectBestHour([]).status, 'unavailable');
  });

  it('deterministically composes ~40s excerpt with identical outputs for identical bucket input', () => {
    const bucket = {
      startAt: '2026-11-06T06:00:00.000Z',
      endAt: '2026-11-06T07:00:00.000Z',
      workAdded: '2198',
      completedBlockCount: '234',
      settlementCount: '6',
    };

    const excerpt1 = composeBestHourExcerpt(bucket);
    const excerpt2 = composeBestHourExcerpt(bucket);

    assert.ok(excerpt1);
    assert.deepEqual(excerpt1, excerpt2);

    // Total duration is exactly 40.0s
    assert.equal(excerpt1.totalDuration, 40.0);
    assert.equal(excerpt1.playDuration, 36.0);
    assert.equal(excerpt1.decayDuration, 4.0);

    // Check decay stage in the last 4 seconds
    const lastStage = excerpt1.stages[excerpt1.stages.length - 1];
    assert.equal(lastStage.name, 'decay');
    assert.equal(lastStage.isDecaying, true);
    assert.equal(lastStage.startSec, 36.0);
    assert.equal(lastStage.endSec, 40.0);
    assert.equal(lastStage.gainScale, 0.0);

    // BPM is quantized to multiple of 4
    assert.equal(excerpt1.bpm % 4, 0);
  });

  it('formats local and UTC times accurately', () => {
    const start = '2026-11-06T14:00:00.000Z';
    const end = '2026-11-06T15:00:00.000Z';

    const utcStr = formatHourUTC(start, end);
    assert.equal(utcStr, '14:00 – 15:00 UTC');

    const localStr = formatHourLocal(start, end, 'America/New_York');
    // In Nov 2026 (EST, UTC-5), 14:00 UTC is 9:00 AM EST
    assert.ok(localStr.includes('9:00 AM – 10:00 AM'));
  });
});

