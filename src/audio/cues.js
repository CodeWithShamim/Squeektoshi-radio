/**
 * Squeektoshi Radio — Synthesized Sound-Effect Cues
 *
 * Implements subtle, synthesized UI audio cues using the Web Audio API:
 * - 'ignite': quiet rising tick micro-sequence over 0.6s on Tune in
 * - 'block': soft two-note harmonic chime on block completion (tuned to key & scale)
 * - 'settle': single dry high bell tap on settlement confirmation
 * - 'ready': single crisp high tick when buffering resolves
 * - 'warn': low double tick when buffering begins
 * - 'seat': micro-pluck panned by (tokenId % 16), rate-limited to <= 8/sec
 *
 * Routing:
 * [Cue Osc / Noise] -> [voiceGain] -> [cueBusGain (-12dB)] -> [cueLimiter] -> [ctx.destination]
 *
 * Controls:
 * - Separate Cues on/off toggle, stored in localStorage ('sqk_cues')
 * - Never plays before the first user interaction
 * - In overlay mode (?overlay=1), muted by default unless ?cues=1
 */

export class CueManager {
  /**
   * @param {object} [options]
   * @param {AudioContext} [options.ctx]
   * @param {boolean} [options.isOverlay=false]
   * @param {boolean} [options.allowOverlayCues=false]
   */
  constructor(options = {}) {
    this.ctx = options.ctx || null;
    this.isOverlay = options.isOverlay || false;
    this.allowOverlayCues = options.allowOverlayCues || false;

    // Load stored preference from localStorage safely
    let stored = null;
    try {
      if (typeof localStorage !== 'undefined') {
        stored = localStorage.getItem('sqk_cues');
      }
    } catch {}

    // In overlay mode: muted by default unless ?cues=1
    if (this.isOverlay && !this.allowOverlayCues) {
      this.enabled = false;
    } else if (stored !== null) {
      this.enabled = stored === 'true';
    } else {
      this.enabled = true; // Default ON after tune in
    }

    this.masterVolume = 0.8;
    this.hasUserInteracted = false;

    // Sub-graph nodes
    this.cueBusGain = null;
    this.cueLimiter = null;

    // Rate limiter for Squeek seat plucks (<= 8 per second)
    this.seatTokens = 8;
    this.maxSeatTokens = 8;
    this.lastSeatRefill = Date.now();
    this.seatPlayedCount = 0; // For testing and verification

    // Listeners for UI toggle sync
    this.listeners = new Set();
  }

  /**
   * Connect to initialized AudioContext.
   * @param {AudioContext} ctx
   */
  init(ctx) {
    if (!ctx) return;
    this.ctx = ctx;

    if (!this.cueLimiter && this.ctx) {
      // 1. Cue Limiter (DynamicsCompressorNode to prevent clipping/clash)
      this.cueLimiter = this.ctx.createDynamicsCompressor();
      this.cueLimiter.threshold.setValueAtTime(-18, this.ctx.currentTime);
      this.cueLimiter.knee.setValueAtTime(6, this.ctx.currentTime);
      this.cueLimiter.ratio.setValueAtTime(8, this.ctx.currentTime);
      this.cueLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.cueLimiter.release.setValueAtTime(0.08, this.ctx.currentTime);

      // 2. Cue Bus Gain (-12 dB relative to 1.0 master = ~0.25)
      this.cueBusGain = this.ctx.createGain();
      const initialGain = this.enabled ? 0.22 * this.masterVolume : 0.0;
      this.cueBusGain.gain.setValueAtTime(initialGain, this.ctx.currentTime);

      // 3. Connect: cueBusGain -> cueLimiter -> ctx.destination
      this.cueBusGain.connect(this.cueLimiter);
      this.cueLimiter.connect(this.ctx.destination);
    }
  }

  /**
   * Mark user interaction gesture to unlock cues.
   */
  unlock() {
    this.hasUserInteracted = true;
  }

  /**
   * Check if sound cues are currently enabled.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Toggle cues on/off.
   * @param {boolean} [forceState]
   * @returns {boolean}
   */
  toggle(forceState) {
    this.enabled = typeof forceState === 'boolean' ? forceState : !this.enabled;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('sqk_cues', String(this.enabled));
      }
    } catch {}

    if (this.cueBusGain && this.ctx) {
      const targetGain = this.enabled ? 0.22 * this.masterVolume : 0.0;
      this.cueBusGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.05);
    }

    this.notifyListeners();
    return this.enabled;
  }

  /**
   * Update master volume factor.
   * @param {number} vol [0.0 to 1.0]
   */
  setVolume(vol) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.cueBusGain && this.ctx && this.enabled) {
      this.cueBusGain.gain.setTargetAtTime(0.22 * this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  /**
   * Play 'ignite' cue: quiet rising tick micro-sequence over 0.6s on Tune In.
   */
  playIgnite() {
    if (!this.canPlay()) return;
    const now = this.ctx.currentTime;
    const freqs = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6

    freqs.forEach((freq, idx) => {
      const t = now + idx * 0.14;
      this.synthesizeTick(t, freq, 0.035, 0.4);
    });
  }

  /**
   * Play 'block' cue: soft two-note harmonic chime derived from current key & scale.
   * @param {number} rootFreq
   * @param {number} fifthFreq
   */
  playBlock(rootFreq = 440, fifthFreq = 660) {
    if (!this.canPlay()) return;
    const now = this.ctx.currentTime;

    // Two-note harmonic chime (root -> 5th or octave)
    this.synthesizeBell(now, rootFreq * 1.5, 0.35, 0.45);
    this.synthesizeBell(now + 0.16, (fifthFreq || rootFreq * 1.5) * 1.5, 0.45, 0.5);
  }

  /**
   * Play 'settle' cue: single dry high bell tap on settlement confirmation.
   */
  playSettle() {
    if (!this.canPlay()) return;
    const now = this.ctx.currentTime;
    this.synthesizeBell(now, 1760.0, 0.18, 0.55); // A6
  }

  /**
   * Play 'ready' cue: single short high tick when buffering completes.
   */
  playReady() {
    if (!this.canPlay()) return;
    const now = this.ctx.currentTime;
    this.synthesizeTick(now, 2400.0, 0.025, 0.5);
  }

  /**
   * Play 'warn' cue: low double tick when buffering begins.
   */
  playWarn() {
    if (!this.canPlay()) return;
    const now = this.ctx.currentTime;
    this.synthesizeTick(now, 330.0, 0.04, 0.45);
    this.synthesizeTick(now + 0.12, 220.0, 0.05, 0.4);
  }

  /**
   * Play 'seat' cue: micro-pluck panned by (tokenId % 16), rate-limited to <= 8/sec.
   * @param {string|number} tokenId
   * @param {number} [level=1]
   * @returns {boolean} whether sound was triggered or dropped by rate limiter
   */
  playSeat(tokenId, level = 1) {
    if (!this.canPlay()) return false;

    // Rate limiter: Token-bucket algorithm (refills at 8 tokens/second, max 8)
    const nowMs = Date.now();
    const elapsedSec = (nowMs - this.lastSeatRefill) / 1000;
    this.lastSeatRefill = nowMs;
    this.seatTokens = Math.min(this.maxSeatTokens, this.seatTokens + elapsedSec * 8);

    if (this.seatTokens < 1) {
      return false; // Dropped by rate limiter
    }
    this.seatTokens -= 1;
    this.seatPlayedCount++;

    const numId = parseInt(tokenId, 10) || 1;
    const panValue = ((numId % 16) - 7.5) / 7.5; // -1.0 (left) to +1.0 (right)

    // Base pitch derived from level and token
    const basePitches = [329.63, 440.0, 554.37, 659.25, 880.0];
    const pitch = basePitches[(level - 1) % basePitches.length] * (1 + (numId % 4) * 0.125);

    this.synthesizePannedPluck(this.ctx.currentTime, pitch, panValue, 0.12, 0.45);
    return true;
  }

  /**
   * Synthesize micro tick.
   * @private
   */
  synthesizeTick(startTime, freq, duration, gainAmount) {
    if (!this.ctx || !this.cueBusGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainAmount, startTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.cueBusGain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /**
   * Synthesize resonant bell.
   * @private
   */
  synthesizeBell(startTime, freq, duration, gainAmount) {
    if (!this.ctx || !this.cueBusGain) return;

    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const outGain = this.ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, startTime);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * 1.414, startTime); // Inharmonic metallic ratio

    modGain.gain.setValueAtTime(freq * 0.8, startTime);
    modGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    outGain.gain.setValueAtTime(0, startTime);
    outGain.gain.linearRampToValueAtTime(gainAmount, startTime + 0.004);
    outGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    carrier.connect(outGain);
    outGain.connect(this.cueBusGain);

    carrier.start(startTime);
    mod.start(startTime);

    carrier.stop(startTime + duration + 0.02);
    mod.stop(startTime + duration + 0.02);

    carrier.onended = () => {
      carrier.disconnect();
      mod.disconnect();
      modGain.disconnect();
      outGain.disconnect();
    };
  }

  /**
   * Synthesize spatially panned pluck for Squeek seat cue.
   * @private
   */
  synthesizePannedPluck(startTime, freq, panVal, duration, gainAmount) {
    if (!this.ctx || !this.cueBusGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    let panner = null;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, startTime + duration);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainAmount, startTime + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    if (this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), startTime);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(this.cueBusGain);
    } else {
      osc.connect(gain);
      gain.connect(this.cueBusGain);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      if (panner) panner.disconnect();
    };
  }

  /**
   * Internal guard before playing any cue.
   * @private
   */
  canPlay() {
    return Boolean(
      this.enabled &&
      this.hasUserInteracted &&
      this.ctx &&
      this.ctx.state === 'running' &&
      this.cueBusGain
    );
  }

  /**
   * Subscribe to toggle changes.
   * @param {Function} cb
   * @returns {Function} unsubscribe
   */
  addListener(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * @private
   */
  notifyListeners() {
    for (const cb of this.listeners) {
      try {
        cb(this.enabled);
      } catch (err) {
        console.error('CueManager listener error:', err);
      }
    }
  }

  /**
   * Clean up nodes.
   */
  destroy() {
    if (this.cueBusGain) {
      this.cueBusGain.disconnect();
      this.cueBusGain = null;
    }
    if (this.cueLimiter) {
      this.cueLimiter.disconnect();
      this.cueLimiter = null;
    }
    this.listeners.clear();
  }
}

export const cueManager = new CueManager();
