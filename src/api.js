/**
 * Squeektoshi Radio - API Client
 *
 * Implements resilient data fetching from https://api.squeekchain.com
 * Handles:
 * - Large number parsing (BigInt for baseUnits/blockUnits, Number for speeds/counts)
 * - ETag caching & 304 Not Modified reuse
 * - "status": "unavailable" as UNKNOWN (never zero/silent)
 * - 429/503 rate-limiting with Retry-After exponential backoff
 * - 8s timeout with AbortController
 * - Demo state generator for ?demo mode
 */

export const DEFAULT_API_BASE = 'https://api.squeekchain.com';
export const REQUEST_TIMEOUT_MS = 8000;

// In-memory ETag and response cache
const cache = new Map();

/**
 * Fetch helper with ETag, 8s timeout, and 429/503 retry backoff.
 * @param {string} path - URL path including query parameters
 * @param {object} options
 * @param {string} [options.baseUrl]
 * @param {number} [options.maxRetries=3]
 * @param {boolean} [options.useCache=true]
 * @param {typeof fetch} [options.fetchFn=fetch]
 * @returns {Promise<any>}
 */
export async function apiFetch(path, options = {}) {
  const {
    baseUrl = DEFAULT_API_BASE,
    maxRetries = 3,
    useCache = true,
    fetchFn = globalThis.fetch,
  } = options;

  const url = `${baseUrl}${path}`;
  const cached = cache.get(url);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = { Accept: 'application/json' };
    if (useCache && cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchFn(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 304 Not Modified -> return cached data
      if (response.status === 304 && cached) {
        return cached.data;
      }

      // Handle Rate Limit (429) or Service Busy (503)
      if ((response.status === 429 || response.status === 503) && attempt < maxRetries) {
        const retryAfterHeader = response.headers.get('retry-after');
        const waitSec = retryAfterHeader ? Math.max(1, parseInt(retryAfterHeader, 10) || 2) : Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
        continue;
      }

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody?.error) errMessage += `: ${errBody.error}`;
        } catch {
          // ignore json parse fail on errors
        }
        throw new Error(`API call failed [${path}]: ${errMessage}`);
      }

      const json = await response.json();

      // Cache if ETag present
      const etag = response.headers.get('etag');
      if (useCache && etag) {
        cache.set(url, { etag, data: json });
      }

      return json;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        throw new Error(`API request timed out after ${REQUEST_TIMEOUT_MS}ms [${path}]`);
      }
      if (attempt >= maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

/**
 * Parses /v1/status payload into strongly typed music & UI fields.
 * Handles unavailable status, missing fields, and decimal numbers.
 * @param {object} raw
 * @returns {object}
 */
export function parseStatus(raw) {
  if (!raw) {
    return {
      status: 'unavailable',
      reason: 'no_data',
      isAvailable: false,
    };
  }

  // Builder or status unavailable
  if (raw.status === 'unavailable' || raw.builder?.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: raw.reason || raw.builder?.reason || 'indexer_unavailable',
      isAvailable: false,
      raw,
    };
  }

  const measurement = raw.measurement || {};
  const anchor = raw.builder?.anchor || {};
  const projected = raw.builder?.projected || {};

  // Wheel speed & status
  const rpmMilli = Number(measurement.rpmMilli ?? 0);
  const rpm = rpmMilli / 1000;
  const speedMmPerSecond = Number(measurement.speedMmPerSecond ?? 0);
  const distanceMm = Number(measurement.distanceMm ?? 0);
  const coreStatus = String(measurement.coreStatus || 'IDLE').toUpperCase();
  const freshness = String(measurement.freshness || 'stale').toLowerCase();

  // Determine spinning state
  const isSpinning = (coreStatus === 'ACTIVE' || coreStatus === 'SPINNING' || rpm > 0);

  // Block height & progress
  const blockHeight = Number(anchor.blockHeight ?? projected.blockHeight ?? 0);
  const blockProgressUnits = BigInt(anchor.blockProgress ?? projected.blockProgress ?? 0);
  // blockProgress: 0.0 to 1.0 (1 block = 1e9 block units)
  const blockProgressRatio = Number(blockProgressUnits) / 1_000_000_000;

  const cumulativeWork = BigInt(measurement.cumulativeWorkUnits ?? anchor.cumulativeWork ?? 0);
  const workPerThousandBlocks = Number(anchor.workPerThousandBlocks ?? 10000);
  const settledThroughRound = Number(anchor.settledThroughRound ?? 0);

  return {
    status: 'available',
    isAvailable: true,
    freshness, // 'online' | 'stale'
    isOnline: freshness === 'online',
    coreStatus, // 'IDLE' | 'ACTIVE' | 'SPINNING'
    isSpinning,
    rpmMilli,
    rpm,
    speedMmPerSecond,
    distanceMm,
    blockHeight,
    blockProgressUnits,
    blockProgressRatio,
    cumulativeWork,
    workPerThousandBlocks,
    settledThroughRound,
    observedAt: measurement.observedAt || raw.generatedAt || new Date().toISOString(),
    raw,
  };
}

/**
 * Parses /v1/settlements payload.
 * @param {object} raw
 * @returns {object}
 */
export function parseSettlements(raw) {
  if (!raw || raw.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: raw?.reason || 'unavailable',
      buckets: [],
      summary: null,
    };
  }

  const summary = raw.summary || {};
  const buckets = (raw.buckets || []).map((b) => ({
    startAt: b.startAt,
    endAt: b.endAt,
    settlementCount: Number(b.settlementCount ?? 0),
    activeRoundCount: Number(b.activeRoundCount ?? 0),
    workAdded: Number(b.workAdded ?? 0),
    completedBlockCount: Number(b.completedBlockCount ?? 0),
    sqkMintedBaseUnits: BigInt(b.sqkMintedBaseUnits ?? 0),
  }));

  return {
    status: 'available',
    settlementCount: Number(summary.settlementCount ?? 0),
    completedBlockCount: Number(summary.completedBlockCount ?? 0),
    workAdded: Number(summary.workAdded ?? 0),
    activeRoundCount: Number(summary.activeRoundCount ?? 0),
    buckets,
    raw,
  };
}

/**
 * Parses /v1/economy/state payload.
 * @param {object} raw
 * @returns {object}
 */
export function parseEconomy(raw) {
  if (!raw || raw.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: raw?.reason || 'unavailable',
      totalMintedBaseUnits: 0n,
      capBaseUnits: 0n,
    };
  }

  const supply = raw.supply || {};
  const totalMintedBaseUnits = BigInt(supply.totalMintedBaseUnits ?? 0);
  const capBaseUnits = BigInt(supply.capBaseUnits ?? 0);

  // Convert to whole SQK tokens for display (18 decimals)
  const totalMintedSQK = Number(totalMintedBaseUnits / 10n ** 18n);

  return {
    status: 'available',
    totalMintedBaseUnits,
    capBaseUnits,
    totalMintedSQK,
    processedThroughRound: Number(raw.mining?.processedThroughRound ?? 0),
    raw,
  };
}

/**
 * Parses /v1/accounts/{address} payload.
 * @param {object} raw
 * @returns {object}
 */
export function parseAccount(raw) {
  if (!raw || raw.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: raw?.reason || 'unavailable',
      tokens: [],
      nextCursor: null,
    };
  }

  const tokens = (raw.tokens || []).map((t) => ({
    tokenId: String(t.tokenId),
    numericTokenId: Number(t.tokenId),
    custody: t.custody, // 'staking' | 'wallet'
    level: Number(t.level ?? 1),
    basePower: BigInt(t.basePower ?? 1000),
    numericBasePower: Number(t.basePower ?? 1000),
    nextMergeHeight: Number(t.nextMergeHeight ?? 0),
    mergeState: t.mergeState,
  }));

  const power = raw.power || {};
  const nftPower = BigInt(power.nftPower ?? 0);
  const sqkPower = BigInt(power.sqkPower ?? 0);

  return {
    status: 'available',
    account: raw.account,
    tokens,
    nftPower,
    sqkPower,
    nextCursor: raw.nextCursor || null,
    raw,
  };
}

/**
 * Fetch all Squeek tokens for a wallet address, handling pagination up to 100 tokens.
 * @param {string} address
 * @param {object} [options]
 * @returns {Promise<Array>}
 */
export async function fetchAllAccountTokens(address, options = {}) {
  // Validate address: 0x followed by 40 hex characters
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('Invalid Ethereum address format. Expected 0x followed by 40 hex digits.');
  }

  const allTokens = [];
  let cursor = null;
  const maxTokens = 100;

  do {
    const query = new URLSearchParams({ limit: '25' });
    if (cursor) query.set('cursor', cursor);

    const data = await apiFetch(`/v1/accounts/${address.toLowerCase()}?${query.toString()}`, options);
    const parsed = parseAccount(data);

    if (parsed.status === 'unavailable') {
      throw new Error(`Account data currently unavailable: ${parsed.reason}`);
    }

    allTokens.push(...parsed.tokens);
    cursor = parsed.nextCursor;

    if (allTokens.length >= maxTokens) {
      break;
    }
  } while (cursor !== null);

  return allTokens.slice(0, maxTokens);
}

/**
 * Fetch Squeek metadata with fallback for image.
 * @param {string|number} tokenId
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function fetchSqueekMetadata(tokenId, options = {}) {
  try {
    const raw = await apiFetch(`/v1/squeeks/${tokenId}`, options);
    if (raw?.status === 'available' && raw?.metadata) {
      return {
        tokenId: String(tokenId),
        name: raw.metadata.name || `Squeek #${tokenId}`,
        imageDataUri: raw.metadata.imageDataUri || null,
        attributes: raw.metadata.attributes || [],
        level: Number(raw.level ?? 1),
      };
    }
  } catch {
    // Ignore fetch failure and return fallback
  }

  // Graceful fallback to dot-grid avatar
  return {
    tokenId: String(tokenId),
    name: `Squeek #${tokenId}`,
    imageDataUri: null,
    attributes: [],
    level: 1,
  };
}

/**
 * Generates plausible simulated live telemetry for ?demo mode.
 * Cycles smoothly through sleep -> jog -> zoomies.
 * @param {number} [elapsedMs=0]
 * @returns {object}
 */
export function getDemoStatus(elapsedMs = 0) {
  // 60-second cycle:
  // 0-20s: sleep (IDLE, 0 rpm)
  // 20-40s: jog (SPINNING, 42 rpm)
  // 40-60s: zoomies (SPINNING, 88 rpm)
  const cycleSec = (Math.floor(elapsedMs / 1000) % 60);
  let coreStatus = 'IDLE';
  let rpm = 0;
  let speedMmPerSecond = 0;

  if (cycleSec >= 20 && cycleSec < 40) {
    coreStatus = 'ACTIVE';
    rpm = 38 + Math.sin(cycleSec * 0.5) * 12; // 26 - 50 rpm
    speedMmPerSecond = Math.round(rpm * 14.5);
  } else if (cycleSec >= 40) {
    coreStatus = 'ACTIVE';
    rpm = 74 + Math.sin(cycleSec * 0.8) * 20; // 54 - 94 rpm
    speedMmPerSecond = Math.round(rpm * 15.2);
  }

  const baseBlock = 1200;
  const blockHeight = baseBlock + Math.floor(elapsedMs / 15000);
  const blockProgressRatio = ((elapsedMs % 15000) / 15000);
  const blockProgressUnits = BigInt(Math.floor(blockProgressRatio * 1_000_000_000));

  return {
    status: 'available',
    isAvailable: true,
    freshness: 'online',
    isOnline: true,
    coreStatus,
    isSpinning: coreStatus === 'ACTIVE' && rpm > 0,
    rpmMilli: Math.round(rpm * 1000),
    rpm: Math.round(rpm * 10) / 10,
    speedMmPerSecond,
    distanceMm: 1420000 + Math.floor(elapsedMs * 0.8),
    blockHeight,
    blockProgressUnits,
    blockProgressRatio,
    cumulativeWork: 12500n + BigInt(Math.floor(elapsedMs / 1000)),
    workPerThousandBlocks: 8950,
    settledThroughRound: 420 + Math.floor(elapsedMs / 60000),
    observedAt: new Date().toISOString(),
    isDemo: true,
  };
}

/**
 * Returns a set of demo Squeek tokens for testing band mode.
 */
export function getDemoBandTokens() {
  return [
    { tokenId: '101', numericTokenId: 101, level: 1, basePower: 1000n, numericBasePower: 1000, custody: 'wallet' },
    { tokenId: '242', numericTokenId: 242, level: 2, basePower: 2200n, numericBasePower: 2200, custody: 'staking' },
    { tokenId: '318', numericTokenId: 318, level: 3, basePower: 3500n, numericBasePower: 3500, custody: 'wallet' },
    { tokenId: '404', numericTokenId: 404, level: 4, basePower: 4800n, numericBasePower: 4800, custody: 'staking' },
    { tokenId: '777', numericTokenId: 777, level: 5, basePower: 7000n, numericBasePower: 7000, custody: 'staking' },
  ];
}

