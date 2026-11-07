/**
 * Squeektoshi Radio - Replay the Day (Feature 2)
 *
 * Converts 24 hourly settlement buckets into a deterministic 2-minute composition
 * (5 seconds per hour).
 *
 * Key Architecture Updates:
 * - Master Audio Clock: AudioContext.currentTime is the single source of truth for audio & visuals
 * - Unavailable/Missing Buckets: Treated as 'rest' (silence + no-data marker), NOT 'sleep'
 * - Pause / Resume / Seek: Clean seek without leaking scheduled notes
 * - Deterministic Output: Same input buckets always produce identical output
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

  const values = buckets
    .filter((b) => b && b.status !== 'unavailable' && b.workAdded !== null)
    .map((b) => Number(b.workAdded ?? 0))
    .sort((a, b) => a - b);

  if (values.length === 0) return { t1: 0, t2: 0 };

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
 * Unavailable buckets become 'rest' (silence with no-data marker).
 * @param {Array<object>} rawBuckets
 * @returns {Array<object>} 24 planned hourly segments
 */
export function composeDayPlan(rawBuckets) {
  const buckets = rawBuckets && rawBuckets.length > 0 ? [...rawBuckets.slice(0, 24)] : [];

  // Pad up to 24 if missing
  while (buckets.length < 24) {
    const dummyHour = buckets.length;
    buckets.push({
      startAt: new Date(Date.now() - (24 - dummyHour) * 3600000).toISOString(),
      endAt: new Date(Date.now() - (23 - dummyHour) * 3600000).toISOString(),
      workAdded: null,
      status: 'unavailable',
      completedBlockCount: 0,
    });
  }

  const { t1, t2 } = calculateTertiles(buckets);

  return buckets.map((b, index) => {
    const isUnavailable = b.status === 'unavailable' || b.isUnavailable === true || b.workAdded === null;
    const workAdded = Number(b.workAdded ?? 0);
    const completedBlockCount = Number(b.completedBlockCount ?? 0);
    const mood = isUnavailable ? 'rest' : resolveBucketMood(workAdded, t1, t2);
    const busyness = isUnavailable ? 0 : calculateRhythmBusyness(completedBlockCount);

    let bpm = 0;
    if (mood === 'sleep') bpm = 48;
    if (mood === 'jog') bpm = 88;
    if (mood === 'zoomies') bpm = 136;

    return {
      hourIndex: index,
      startAt: b.startAt,
      endAt: b.endAt,
      workAdded: isUnavailable ? 0 : workAdded,
      completedBlockCount,
      mood,
      isUnavailable,
      bpm,
      busyness,
      durationSec: 5.0, // 5s per bucket = 120s total
    };
  });
}

/**
 * Replay Timeline Controller using AudioContext.currentTime as master clock.
 */
export class ReplayPlayer {
  /**
   * @param {AudioEngine} audioEngine
   * @param {(hourIndex: number, planItem: object, progressFrac: number) => void} onTick
   * @param {() => void} onComplete
   */
  constructor(audioEngine, onTick = () => {}, onComplete = () => {}) {
    this.audioEngine = audioEngine;
    this.onTick = onTick;
    this.onComplete = onComplete;

    this.plan = [];
    this.currentHour = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.startTime = 0;
    this.checkIntervalId = null;
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
    this.currentHour = Math.max(0, Math.min(23, startHour));
    this.isPlaying = true;
    this.isPaused = false;

    await this.audioEngine.start();
    this.audioEngine.setMode('replay');

    // Anchor master audio clock
    const ctx = this.audioEngine.ctx;
    this.startTime = ctx ? ctx.currentTime - this.currentHour * 5.0 : 0;

    this.applyHourTelemetry(this.currentHour);

    // Audio-clock synchronization loop (evaluates every 50ms)
    if (this.checkIntervalId) clearInterval(this.checkIntervalId);
    this.checkIntervalId = setInterval(() => this.syncAudioClock(), 50);
  }

  syncAudioClock() {
    if (!this.isPlaying || this.isPaused || !this.audioEngine.ctx) return;

    const ctx = this.audioEngine.ctx;
    const elapsedSec = ctx.currentTime - this.startTime;
    const targetHour = Math.floor(elapsedSec / 5.0);
    const progressFrac = Math.min(1.0, (elapsedSec % 5.0) / 5.0);

    if (targetHour >= 24) {
      this.stop();
      this.onComplete();
      return;
    }

    if (targetHour !== this.currentHour && targetHour >= 0 && targetHour < 24) {
      this.currentHour = targetHour;
      this.applyHourTelemetry(this.currentHour);
    }

    const currentItem = this.plan[this.currentHour] || this.plan[0];
    this.onTick(this.currentHour, currentItem, progressFrac);
  }

  applyHourTelemetry(hourIndex) {
    const item = this.plan[hourIndex];
    if (!item) return;

    if (item.mood === 'rest') {
      // Silence / rest hour
      this.audioEngine.updateTelemetry({
        isAvailable: false,
        freshness: 'unavailable',
        isSpinning: false,
        rpm: 0,
        blockHeight: 1200 + hourIndex,
        blockProgressRatio: 0,
      });
    } else {
      this.audioEngine.updateTelemetry({
        isAvailable: true,
        freshness: 'online',
        isSpinning: item.mood !== 'sleep',
        rpm: item.mood === 'sleep' ? 0 : item.mood === 'jog' ? 38 : 78,
        blockHeight: 1200 + hourIndex,
        blockProgressRatio: Math.min(1.0, (item.completedBlockCount % 10) / 10),
      });
    }
  }

  seek(hourIndex) {
    const h = Math.max(0, Math.min(23, hourIndex));
    this.currentHour = h;
    if (this.audioEngine.ctx) {
      this.startTime = this.audioEngine.ctx.currentTime - h * 5.0;
    }
    this.applyHourTelemetry(h);
    const item = this.plan[h];
    if (item) this.onTick(h, item, 0);
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.audioEngine.ctx) {
      this.startTime = this.audioEngine.ctx.currentTime - this.currentHour * 5.0;
    }
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    this.audioEngine.setMode('live');
  }
}
