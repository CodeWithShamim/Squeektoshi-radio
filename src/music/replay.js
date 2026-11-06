/**
 * Squeektoshi Radio - Replay the Day (Feature 2)
 *
 * Converts 24 hourly settlement buckets into a deterministic 2-minute composition
 * (5 seconds per hour).
 *
 * - Tertile calculation on workAdded:
 *   - 0 or lowest third -> sleep
 *   - middle third -> jog
 *   - top third -> zoomies
 * - completedBlockCount controls rhythmic busyness
 * - Deterministic playback with timeline scrubber synchronization
 */

/**
 * Computes the 33rd and 67th percentiles (tertiles) across workAdded.
 * @param {Array<{ workAdded: number }>} buckets
 * @returns {{ t1: number, t2: number }}
 */
export function calculateTertiles(buckets) {
  if (!buckets || buckets.length === 0) {
    return { t1: 0, t2: 0 };
  }

  const values = buckets.map((b) => Number(b.workAdded ?? 0)).sort((a, b) => a - b);
  const n = values.length;

  const t1 = values[Math.floor(n / 3)];
  const t2 = values[Math.floor((2 * n) / 3)];

  return { t1, t2 };
}

/**
 * Resolves an individual bucket's mood from its workAdded relative to day tertiles.
 * @param {number} workAdded
 * @param {number} t1
 * @param {number} t2
 * @returns {'sleep'|'jog'|'zoomies'}
 */
export function resolveBucketMood(workAdded, t1, t2) {
  const w = Number(workAdded ?? 0);
  if (w === 0 || w <= t1 || (t1 === 0 && t2 === 0)) {
    return 'sleep';
  }
  if (w <= t2) {
    return 'jog';
  }
  return 'zoomies';
}

/**
 * Resolves rhythm density from completedBlockCount.
 * @param {number} completedBlockCount
 * @returns {number} Density factor from 1 (sparse) to 4 (intense)
 */
export function calculateRhythmBusyness(completedBlockCount) {
  const count = Number(completedBlockCount ?? 0);
  if (count === 0) return 1;
  if (count <= 2) return 2;
  if (count <= 8) return 3;
  return 4;
}

/**
 * Composes the 24-hour replay structure from buckets.
 * Pure and deterministic: same input always produces identical composition.
 * @param {Array<object>} rawBuckets
 * @returns {Array<object>} 24 planned hourly segments
 */
export function composeDayPlan(rawBuckets) {
  // Ensure exactly 24 buckets (pad or slice if necessary)
  const buckets = (rawBuckets && rawBuckets.length > 0)
    ? rawBuckets.slice(0, 24)
    : [];

  while (buckets.length < 24) {
    const dummyHour = buckets.length;
    buckets.push({
      startAt: new Date(Date.now() - (24 - dummyHour) * 3600000).toISOString(),
      endAt: new Date(Date.now() - (23 - dummyHour) * 3600000).toISOString(),
      workAdded: 0,
      completedBlockCount: 0,
    });
  }

  const { t1, t2 } = calculateTertiles(buckets);

  return buckets.map((b, index) => {
    const workAdded = Number(b.workAdded ?? 0);
    const completedBlockCount = Number(b.completedBlockCount ?? 0);
    const mood = resolveBucketMood(workAdded, t1, t2);
    const busyness = calculateRhythmBusyness(completedBlockCount);

    let bpm = 48;
    if (mood === 'jog') bpm = 88;
    if (mood === 'zoomies') bpm = 136;

    return {
      hourIndex: index,
      startAt: b.startAt,
      endAt: b.endAt,
      workAdded,
      completedBlockCount,
      mood,
      bpm,
      busyness,
      durationSec: 5.0, // 5s per bucket = 120s total composition
    };
  });
}

/**
 * Replay Timeline Controller
 */
export class ReplayPlayer {
  /**
   * @param {AudioEngine} audioEngine
   * @param {(hourIndex: number, planItem: object) => void} onTick
   * @param {() => void} onComplete
   */
  constructor(audioEngine, onTick = () => {}, onComplete = () => {}) {
    this.audioEngine = audioEngine;
    this.onTick = onTick;
    this.onComplete = onComplete;

    this.plan = [];
    this.currentHour = 0;
    this.isPlaying = false;
    this.timerId = null;
  }

  /**
   * Load 24-hour settlement buckets and build composition plan.
   * @param {Array} buckets
   */
  load(buckets) {
    this.plan = composeDayPlan(buckets);
  }

  /**
   * Start 24h playback from given hour (default 0).
   * @param {number} [startHour=0]
   */
  async play(startHour = 0) {
    if (this.plan.length === 0) return;
    this.isPlaying = true;
    this.currentHour = startHour;

    await this.audioEngine.start();
    this.advanceHour();
  }

  advanceHour() {
    if (!this.isPlaying) return;

    if (this.currentHour >= this.plan.length) {
      this.stop();
      this.onComplete();
      return;
    }

    const item = this.plan[this.currentHour];

    // Feed hour telemetry into audio engine
    this.audioEngine.updateTelemetry({
      isAvailable: true,
      freshness: 'online',
      isSpinning: item.mood !== 'sleep',
      rpm: item.mood === 'sleep' ? 0 : item.mood === 'jog' ? 38 : 78,
      blockHeight: 1200 + this.currentHour,
      blockProgressRatio: Math.min(1.0, (item.completedBlockCount % 10) / 10),
    });

    this.onTick(this.currentHour, item);

    this.currentHour++;
    this.timerId = setTimeout(() => this.advanceHour(), 5000); // 5s per hour
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}

