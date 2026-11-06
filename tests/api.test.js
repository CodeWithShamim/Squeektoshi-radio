import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStatus,
  parseSettlements,
  parseEconomy,
  parseAccount,
  fetchAllAccountTokens,
  apiFetch,
  getDemoStatus,
} from '../src/api.js';

describe('API Client - Data Parsing and Invariants', () => {
  it('parses live status payload with BigInt and Number conversions', () => {
    const raw = {
      schemaVersion: 1,
      installationId: 'test-install',
      measurement: {
        freshness: 'online',
        coreStatus: 'IDLE',
        rpmMilli: 77005,
        speedMmPerSecond: 1127,
        distanceMm: 3455808,
        cumulativeWorkUnits: '26009',
        observedAt: '2026-11-04T23:39:11.037Z',
      },
      builder: {
        status: 'available',
        anchor: {
          blockHeight: '2366',
          blockProgress: '143705150',
          workPerThousandBlocks: '11005',
          settledThroughRound: '166',
          cumulativeWork: '25701',
        },
      },
    };

    const parsed = parseStatus(raw);
    assert.equal(parsed.status, 'available');
    assert.equal(parsed.isAvailable, true);
    assert.equal(parsed.freshness, 'online');
    assert.equal(parsed.isOnline, true);
    assert.equal(parsed.coreStatus, 'IDLE');
    assert.equal(parsed.isSpinning, true); // rpm > 0
    assert.equal(parsed.rpmMilli, 77005);
    assert.equal(parsed.rpm, 77.005);
    assert.equal(parsed.speedMmPerSecond, 1127);
    assert.equal(parsed.blockHeight, 2366);
    assert.equal(parsed.blockProgressUnits, 143705150n);
    assert.equal(parsed.cumulativeWork, 26009n);
    assert.equal(parsed.workPerThousandBlocks, 11005);
    assert.equal(parsed.settledThroughRound, 166);
    assert.ok(Math.abs(parsed.blockProgressRatio - 0.14370515) < 0.0001);
  });

  it('CRITICAL: handles "status": "unavailable" as UNKNOWN, never zero or silence', () => {
    const rawUnavailable = {
      schemaVersion: 1,
      status: 'unavailable',
      reason: 'indexer_unavailable',
    };

    const parsed = parseStatus(rawUnavailable);
    assert.equal(parsed.status, 'unavailable');
    assert.equal(parsed.isAvailable, false);
    assert.equal(parsed.reason, 'indexer_unavailable');
    assert.equal(parsed.rpm, undefined);
    assert.equal(parsed.blockHeight, undefined);
  });

  it('handles builder unavailable as UNKNOWN', () => {
    const raw = {
      schemaVersion: 1,
      measurement: {
        freshness: 'online',
        coreStatus: 'IDLE',
        rpmMilli: 0,
      },
      builder: {
        status: 'unavailable',
        reason: 'oracle_head_unavailable',
      },
    };

    const parsed = parseStatus(raw);
    assert.equal(parsed.status, 'unavailable');
    assert.equal(parsed.isAvailable, false);
    assert.equal(parsed.reason, 'oracle_head_unavailable');
  });

  it('parses settlements 24h buckets and summary', () => {
    const raw = {
      schemaVersion: 3,
      status: 'available',
      summary: {
        settlementCount: '140',
        activeRoundCount: '22',
        workAdded: '7231',
        completedBlockCount: '774',
      },
      buckets: [
        {
          startAt: '2026-11-05T18:00:00.000Z',
          endAt: '2026-11-05T19:00:00.000Z',
          settlementCount: '6',
          activeRoundCount: '0',
          workAdded: '0',
          completedBlockCount: '0',
          sqkMintedBaseUnits: '0',
        },
        {
          startAt: '2026-11-05T19:00:00.000Z',
          endAt: '2026-11-05T20:00:00.000Z',
          settlementCount: '8',
          activeRoundCount: '3',
          workAdded: '1500',
          completedBlockCount: '12',
          sqkMintedBaseUnits: '10000000000000000000',
        },
      ],
    };

    const parsed = parseSettlements(raw);
    assert.equal(parsed.status, 'available');
    assert.equal(parsed.settlementCount, 140);
    assert.equal(parsed.completedBlockCount, 774);
    assert.equal(parsed.workAdded, 7231);
    assert.equal(parsed.buckets.length, 2);
    assert.equal(parsed.buckets[1].workAdded, 1500);
    assert.equal(parsed.buckets[1].completedBlockCount, 12);
    assert.equal(parsed.buckets[1].sqkMintedBaseUnits, 10000000000000000000n);
  });

  it('parses economy state with 18-decimal token conversion', () => {
    const raw = {
      status: 'available',
      supply: {
        capBaseUnits: '2100000000000000000000000000', // 2.1B SQK
        totalMintedBaseUnits: '5000000000000000000000000', // 5M SQK
      },
      mining: {
        processedThroughRound: '415',
      },
    };

    const parsed = parseEconomy(raw);
    assert.equal(parsed.status, 'available');
    assert.equal(parsed.capBaseUnits, 2100000000000000000000000000n);
    assert.equal(parsed.totalMintedBaseUnits, 5000000000000000000000000n);
    assert.equal(parsed.totalMintedSQK, 5000000);
    assert.equal(parsed.processedThroughRound, 415);
  });

  it('parses account with Squeek tokens and custody', () => {
    const raw = {
      status: 'available',
      account: '0x798cf7770337a9283b6f2af69a8f079b3d7544dc',
      tokens: [
        {
          tokenId: '1',
          custody: 'wallet',
          level: 1,
          basePower: '1000',
          nextMergeHeight: '0',
          mergeState: 'ready',
        },
        {
          tokenId: '42',
          custody: 'staking',
          level: 3,
          basePower: '3500',
          nextMergeHeight: '1200',
          mergeState: 'cooldown',
        },
      ],
      power: {
        nftPower: '3500',
        sqkPower: '0',
      },
      nextCursor: null,
    };

    const parsed = parseAccount(raw);
    assert.equal(parsed.status, 'available');
    assert.equal(parsed.tokens.length, 2);
    assert.equal(parsed.tokens[0].tokenId, '1');
    assert.equal(parsed.tokens[0].numericTokenId, 1);
    assert.equal(parsed.tokens[0].level, 1);
    assert.equal(parsed.tokens[0].basePower, 1000n);
    assert.equal(parsed.tokens[1].level, 3);
    assert.equal(parsed.tokens[1].basePower, 3500n);
  });

  it('validates Ethereum address before fetching tokens', async () => {
    await assert.rejects(
      () => fetchAllAccountTokens('invalid-address'),
      /Invalid Ethereum address format/
    );
    await assert.rejects(
      () => fetchAllAccountTokens('0x1234'),
      /Invalid Ethereum address format/
    );
  });

  it('handles ETag caching and 304 Not Modified', async () => {
    let callCount = 0;
    const mockData = { schemaVersion: 1, measurement: { coreStatus: 'IDLE', rpmMilli: 0 } };

    const mockFetch = async (url, init) => {
      callCount++;
      if (init.headers['If-None-Match'] === '"etag-123"') {
        return {
          status: 304,
          ok: true,
          headers: new Headers({ etag: '"etag-123"' }),
        };
      }
      return {
        status: 200,
        ok: true,
        headers: new Headers({ etag: '"etag-123"' }),
        json: async () => mockData,
      };
    };

    // First fetch sets cache
    const res1 = await apiFetch('/v1/test-etag', { fetchFn: mockFetch, baseUrl: 'https://mock.local' });
    assert.deepEqual(res1, mockData);
    assert.equal(callCount, 1);

    // Second fetch sends If-None-Match and receives 304 -> returns cached data
    const res2 = await apiFetch('/v1/test-etag', { fetchFn: mockFetch, baseUrl: 'https://mock.local' });
    assert.deepEqual(res2, mockData);
    assert.equal(callCount, 2);
  });

  it('handles 429 rate limit with Retry-After backoff', async () => {
    let attempts = 0;
    const mockData = { status: 'available' };

    const mockFetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          status: 429,
          ok: false,
          headers: new Headers({ 'retry-after': '1' }),
          json: async () => ({ error: 'rate_limited' }),
        };
      }
      return {
        status: 200,
        ok: true,
        headers: new Headers(),
        json: async () => mockData,
      };
    };

    const res = await apiFetch('/v1/test-rate-limit', {
      fetchFn: mockFetch,
      baseUrl: 'https://mock.local',
      maxRetries: 2,
    });
    assert.equal(attempts, 2);
    assert.deepEqual(res, mockData);
  });

  it('demo status produces plausible rotating moods', () => {
    const sleepState = getDemoStatus(5000); // 5s -> sleep
    assert.equal(sleepState.coreStatus, 'IDLE');
    assert.equal(sleepState.rpm, 0);

    const jogState = getDemoStatus(25000); // 25s -> jog
    assert.equal(jogState.coreStatus, 'ACTIVE');
    assert.ok(jogState.rpm >= 26 && jogState.rpm <= 50);

    const zoomState = getDemoStatus(45000); // 45s -> zoomies
    assert.equal(zoomState.coreStatus, 'ACTIVE');
    assert.ok(zoomState.rpm >= 54 && zoomState.rpm <= 94);
  });
});

