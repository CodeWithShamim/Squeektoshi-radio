/**
 * Squeektoshi Radio — Best Hour Selection & Excerpt Composer (replay/best-hour.js)
 *
 * Feature 2 (Priority 2):
 * - Pure selection function selecting the bucket with highest workAdded in last 24 hours.
 * - Ties go to the most recent bucket.
 * - Handles all-zero ("No active hour in the last 24 hours.") and unavailable ("Hour data unknown right now.").
 * - Pure deterministic ~40-second excerpt composition.
 * - Clean decay and audio context management with zero leaked nodes.
 */

import { resolveBucketMood } from '../music/replay.js';

/**
 * Formats start and end times into local timezone string with zone abbreviation.
 * e.g. "2:00 PM – 3:00 PM EDT" or "14:00 – 15:00 CET"
 * @param {string|Date} startAt
 * @param {string|Date} endAt
 * @param {string} [timeZone]
 * @returns {string}
 */
export function formatHourLocal(startAt, endAt, timeZone) {
  try {
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '--:-- – --:--';

    const opts = {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      ...(timeZone ? { timeZone } : {}),
    };
    const timeFormatter = new Intl.DateTimeFormat(undefined, opts);
    const partsStart = timeFormatter.formatToParts(s);
    const partsEnd = timeFormatter.formatToParts(e);

    // Extract time zone name from end parts
    const tzName = partsEnd.find((p) => p.type === 'timeZoneName')?.value || '';

    const startStr = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(s);

    const endStr = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(e);

    return `${startStr} – ${endStr} ${tzName}`.trim();
  } catch {
    return '--:-- – --:--';
  }
}

/**
 * Formats start and end times into UTC equivalent.
 * e.g. "18:00 – 19:00 UTC"
 * @param {string|Date} startAt
 * @param {string|Date} endAt
 * @returns {string}
 */
export function formatHourUTC(startAt, endAt) {
  try {
    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return '--:-- – --:-- UTC';

    const pad = (n) => String(n).padStart(2, '0');
    const sHour = pad(s.getUTCHours());
    const sMin = pad(s.getUTCMinutes());
    const eHour = pad(e.getUTCHours());
    const eMin = pad(e.getUTCMinutes());

    return `${sHour}:${sMin} – ${eHour}:${eMin} UTC`;
  } catch {
    return '--:-- – --:-- UTC';
  }
}

/**
 * Safe numeric parser for string, number, or BigInt workAdded/completedBlockCount.
 * @param {*} val
 * @returns {number|null}
 */
export function parseWorkValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : val;
  }
  if (typeof val === 'bigint') {
    return Number(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return null;
    const n = Number(trimmed);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Select the single best hour bucket from settlement data.
 * Pure function:
 * - Bucket with highest workAdded
 * - Ties broken by most recent timestamp / index
 * - Unavailable response or all unavailable buckets -> status: 'unavailable'
 * - All buckets zero -> status: 'all_zero'
 *
 * @param {object|Array} settlementsData
 * @returns {object}
 */
export function selectBestHour(settlementsData) {
  if (!settlementsData) {
    return {
      status: 'unavailable',
      reason: 'Hour data unknown right now.',
      hourIndex: -1,
      bucket: null,
    };
  }

  // Handle { status: 'unavailable', ... } wrapper
  if (settlementsData.status === 'unavailable') {
    return {
      status: 'unavailable',
      reason: 'Hour data unknown right now.',
      hourIndex: -1,
      bucket: null,
    };
  }

  const rawBuckets = Array.isArray(settlementsData)
    ? settlementsData
    : settlementsData.buckets || [];

  if (!Array.isArray(rawBuckets) || rawBuckets.length === 0) {
    return {
      status: 'unavailable',
      reason: 'Hour data unknown right now.',
      hourIndex: -1,
      bucket: null,
    };
  }

  let best = null;
  let hasAnyAvailable = false;
  let allZero = true;

  for (let idx = 0; idx < rawBuckets.length; idx++) {
    const b = rawBuckets[idx];
    if (!b) continue;

    // Check if bucket itself is unavailable
    if (b.status === 'unavailable' || b.isUnavailable === true) {
      continue;
    }

    const work = parseWorkValue(b.workAdded);
    if (work === null || work < 0) {
      continue;
    }

    hasAnyAvailable = true;
    if (work > 0) {
      allZero = false;
    }

    // Determine timestamp for tie-breaking
    let timestamp = 0;
    if (b.endAt) {
      const t = new Date(b.endAt).getTime();
      timestamp = isNaN(t) ? idx : t;
    } else if (b.startAt) {
      const t = new Date(b.startAt).getTime();
      timestamp = isNaN(t) ? idx : t;
    } else {
      timestamp = idx;
    }

    if (!best) {
      best = { bucket: b, hourIndex: idx, work, timestamp };
    } else if (work > best.work) {
      best = { bucket: b, hourIndex: idx, work, timestamp };
    } else if (work === best.work) {
      // Ties go to the most recent (greater timestamp, or greater index if equal)
      if (timestamp >= best.timestamp) {
        best = { bucket: b, hourIndex: idx, work, timestamp };
      }
    }
  }

  if (!hasAnyAvailable || !best) {
    return {
      status: 'unavailable',
      reason: 'Hour data unknown right now.',
      hourIndex: -1,
      bucket: null,
    };
  }

  if (allZero || best.work === 0) {
    return {
      status: 'all_zero',
      reason: 'No active hour in the last 24 hours.',
      hourIndex: -1,
      bucket: null,
    };
  }

  const totalBuckets = rawBuckets.length || 24;
  const b = best.bucket;
  const blocks = parseWorkValue(b.completedBlockCount) || 0;
  const settlements = parseWorkValue(b.settlementCount) || 0;

  return {
    status: 'ok',
    reason: null,
    hourIndex: best.hourIndex,
    bucket: b,
    workAdded: best.work,
    completedBlockCount: blocks,
    settlementCount: settlements,
    startAt: b.startAt,
    endAt: b.endAt,
    rank: 1,
    rankText: `1 of ${totalBuckets}`,
    localTimeText: formatHourLocal(b.startAt, b.endAt),
    utcTimeText: formatHourUTC(b.startAt, b.endAt),
  };
}

/**
 * Composes a deterministic ~40-second excerpt plan from a best hour bucket.
 * Pure function: same input always produces identical plan.
 *
 * @param {object} bucket
 * @param {{ t1: number, t2: number }} [tertiles]
 * @returns {object|null}
 */
export function composeBestHourExcerpt(bucket, tertiles = null) {
  if (!bucket || bucket.status === 'unavailable' || bucket.workAdded === null) {
    return null;
  }

  const work = parseWorkValue(bucket.workAdded) || 0;
  const blocks = parseWorkValue(bucket.completedBlockCount) || 0;
  const settlements = parseWorkValue(bucket.settlementCount) || 0;

  // Determine mood based on tertiles if available, or work heuristics
  let mood = 'jog';
  if (tertiles && (tertiles.t1 !== 0 || tertiles.t2 !== 0)) {
    mood = resolveBucketMood(work, tertiles.t1, tertiles.t2);
  } else {
    mood = work >= 1500 ? 'zoomies' : (work > 0 ? 'jog' : 'sleep');
  }

  // Base BPM quantized to multiples of 4
  let bpm = 96;
  if (mood === 'zoomies') {
    bpm = Math.min(148, Math.max(120, 120 + Math.floor((work % 800) / 40) * 4));
  } else if (mood === 'jog') {
    bpm = Math.min(108, Math.max(76, 76 + Math.floor((work % 600) / 30) * 4));
  } else {
    bpm = 52;
  }

  // Simulated RPM
  const rpm = mood === 'zoomies' ? 82.5 : mood === 'jog' ? 44.0 : 0.0;

  // 40.0s total duration with clean decay in the final 4.0s
  const totalDuration = 40.0;
  const decayDuration = 4.0;
  const playDuration = totalDuration - decayDuration; // 36.0s

  // 4 progressive stages over 40s
  const stages = [
    {
      name: 'ignition',
      startSec: 0.0,
      endSec: 8.0,
      blockProgress: 0.15,
      gainScale: 0.75,
      filterMult: 0.7,
    },
    {
      name: 'build',
      startSec: 8.0,
      endSec: 22.0,
      blockProgress: 0.55,
      gainScale: 1.0,
      filterMult: 1.0,
    },
    {
      name: 'peak',
      startSec: 22.0,
      endSec: 36.0,
      blockProgress: 0.95,
      gainScale: 1.0,
      filterMult: 1.2,
    },
    {
      name: 'decay',
      startSec: 36.0,
      endSec: 40.0,
      blockProgress: 1.0,
      gainScale: 0.0,
      filterMult: 0.4,
      isDecaying: true,
    },
  ];

  return {
    mood,
    bpm,
    rpm,
    workAdded: work,
    completedBlockCount: blocks,
    settlementCount: settlements,
    startAt: bucket.startAt,
    endAt: bucket.endAt,
    totalDuration,
    decayDuration,
    playDuration,
    stages,
  };
}

/**
 * Controller to play the Best Hour excerpt with AudioEngine.
 * Strictly guarantees clean end decay and zero node leaks after stopping.
 */
export class BestHourPlayer {
  /**
   * @param {object} audioEngine
   * @param {object} options
   * @param {(progress: number, elapsedSec: number, currentStage: object) => void} [options.onTick]
   * @param {() => void} [options.onComplete]
   */
  constructor(audioEngine, options = {}) {
    this.audioEngine = audioEngine;
    this.onTick = options.onTick || (() => {});
    this.onComplete = options.onComplete || (() => {});

    this.excerpt = null;
    this.bestHourResult = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.checkIntervalId = null;
    this.gainRampScheduled = false;
  }

  /**
   * Load the best hour selection result.
   * @param {object} bestHourResult - Result of selectBestHour()
   * @param {object} [tertiles]
   */
  load(bestHourResult, tertiles = null) {
    if (!bestHourResult || bestHourResult.status !== 'ok' || !bestHourResult.bucket) {
      this.bestHourResult = null;
      this.excerpt = null;
      return false;
    }
    this.bestHourResult = bestHourResult;
    this.excerpt = composeBestHourExcerpt(bestHourResult.bucket, tertiles);
    return Boolean(this.excerpt);
  }

  /**
   * Start playback of the ~40 second excerpt.
   */
  async play() {
    if (!this.excerpt || !this.audioEngine) return;

    this.isPlaying = true;
    this.gainRampScheduled = false;

    // Ensure audio engine is started
    if (!this.audioEngine.isPlaying) {
      await this.audioEngine.start();
    }

    // Set mode to 'replay' so scheduler uses deterministic chords & pattern
    this.audioEngine.setMode('replay');

    const ctx = this.audioEngine.ctx;
    this.startTime = ctx ? ctx.currentTime : performance.now() / 1000;

    // Apply initial stage telemetry
    this.applyStageTelemetry(this.excerpt.stages[0]);

    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    this.checkIntervalId = setInterval(() => this.tick(), 50);
  }

  applyStageTelemetry(stage) {
    if (!this.audioEngine || !stage || !this.excerpt) return;
    this.audioEngine.updateTelemetry({
      isAvailable: true,
      freshness: 'online',
      isSpinning: true,
      rpm: this.excerpt.rpm,
      blockHeight: 2400 + (this.bestHourResult?.hourIndex ?? 0),
      blockProgressRatio: stage.blockProgress,
    });
  }

  tick() {
    if (!this.isPlaying || !this.excerpt) return;

    const ctx = this.audioEngine.ctx;
    const now = ctx ? ctx.currentTime : performance.now() / 1000;
    const elapsed = Math.max(0, now - this.startTime);
    const total = this.excerpt.totalDuration;
    const progress = Math.min(1.0, elapsed / total);

    // Find current active stage
    const currentStage =
      this.excerpt.stages.find((s) => elapsed >= s.startSec && elapsed < s.endSec) ||
      this.excerpt.stages[this.excerpt.stages.length - 1];

    // Trigger decay ramp at 36s if not already scheduled
    if (elapsed >= this.excerpt.playDuration && !this.gainRampScheduled) {
      this.gainRampScheduled = true;
      if (this.audioEngine.masterGain && ctx) {
        const remainingDecay = Math.max(0.5, total - elapsed);
        try {
          this.audioEngine.masterGain.gain.setValueAtTime(
            this.audioEngine.masterGain.gain.value,
            ctx.currentTime
          );
          this.audioEngine.masterGain.gain.linearRampToValueAtTime(
            0.0001,
            ctx.currentTime + remainingDecay
          );
        } catch {}
      }
    }

    if (elapsed >= total) {
      this.stop();
      this.onComplete();
      return;
    }

    this.applyStageTelemetry(currentStage);
    this.onTick(progress, elapsed, currentStage);
  }

  /**
   * Stop playback cleanly and restore master gain.
   */
  stop() {
    this.isPlaying = false;
    this.gainRampScheduled = false;

    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    // Restore master volume cleanly
    if (this.audioEngine) {
      if (typeof this.audioEngine.setVolume === 'function') {
        this.audioEngine.setVolume(this.audioEngine.userVolume);
      }
      this.audioEngine.setMode('live');
    }
  }
}

