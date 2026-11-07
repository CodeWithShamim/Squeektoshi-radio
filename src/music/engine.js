/**
 * Squeektoshi Radio - Audio Engine & Master Output Chain
 *
 * Coordinates AudioContext lifecycle, master dynamics compressor,
 * procedural reverb convolver, block progress filter modulation,
 * and audio safety constraints (master gain ceiling <= 0.8).
 */

import { createReverbImpulse, prewarmReverbImpulse, playBell } from './voices.js';
import { calculateFilterCutoff } from './mapping.js';
import { LookAheadScheduler } from './scheduler.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isInitialized = false;
    this.isPlaying = false;
    this.isMuted = false;
    this.userVolume = 0.75;

    this.isPrewarmed = false;
    this.isPrewarming = false;
    this.activePalette = 'analog'; // 'glass' | 'analog' | 'chamber' | 'dub'
    this.activeMode = 'live';      // 'live' | 'replay' | 'band' | 'orchestra'

    // Audio Graph Nodes
    this.synthBus = null;
    this.blockFilter = null;
    this.reverbNode = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.compressor = null;
    this.masterGain = null;
    this.analyser = null;

    // Scheduler
    this.scheduler = null;
    this.latestTelemetry = null;
    this.bandVoices = [];
    this.onBufferingStateChange = null;
    this.onVoiceTriggered = null;
  }

  /**
   * Prewarms audio assets (such as procedural reverb impulse) asynchronously
   * before the user clicks "Tune in", ensuring click-to-sound latency <= 150ms.
   * @returns {Promise<void>}
   */
  async prewarm() {
    if (this.isPrewarmed || this.isPrewarming) return;
    this.isPrewarming = true;

    try {
      await prewarmReverbImpulse(48000, 2.4, 2.2);
      this.isPrewarmed = true;
    } catch (e) {
      console.warn('Audio prewarm fallback:', e);
    } finally {
      this.isPrewarming = false;
    }
  }

  /**
   * Initializes the Web Audio graph on first user interaction.
   */
  init() {
    if (this.isInitialized) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    // 1. Synth Bus: all voices connect here
    this.synthBus = this.ctx.createGain();
    this.synthBus.gain.setValueAtTime(1.0, this.ctx.currentTime);

    // 2. Block Progress Low-Pass Filter: opens up as block progress increases
    this.blockFilter = this.ctx.createBiquadFilter();
    this.blockFilter.type = 'lowpass';
    this.blockFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
    this.blockFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.synthBus.connect(this.blockFilter);

    // 3. Procedural Algorithmic Reverb
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = createReverbImpulse(this.ctx, 2.4, 2.2);

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.35, this.ctx.currentTime); // 35% wet reverb

    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.setValueAtTime(0.85, this.ctx.currentTime); // 85% dry

    this.blockFilter.connect(this.dryGain);
    this.blockFilter.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);

    // 4. Dynamics Compressor: ensures no clipping or ear-piercing peaks
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
    this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

    this.dryGain.connect(this.compressor);
    this.reverbGain.connect(this.compressor);

    // 5. Master Gain: hard ceiling at 0.8
    this.masterGain = this.ctx.createGain();
    const effectiveGain = this.isMuted ? 0 : Math.min(0.8, this.userVolume * 0.8);
    this.masterGain.gain.setValueAtTime(effectiveGain, this.ctx.currentTime);

    this.compressor.connect(this.masterGain);

    // 6. Analyser Node: for visualizer (oscilloscope & spectrum)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // 7. Scheduler
    this.scheduler = new LookAheadScheduler(
      this.ctx,
      this.synthBus,
      () => this.latestTelemetry,
      () => this.bandVoices
    );
    this.scheduler.setPalette(this.activePalette);
    this.scheduler.setMode(this.activeMode);
    this.scheduler.onBufferingStateChange = (struggling, lateness) => {
      if (this.onBufferingStateChange) {
        this.onBufferingStateChange(struggling, lateness);
      }
    };
    this.scheduler.onVoiceTriggered = (layer, intensity) => {
      if (this.onVoiceTriggered) {
        this.onVoiceTriggered(layer, intensity);
      }
    };

    this.isInitialized = true;
  }

  /**
   * Crossfades sound palette over 1.2s: 'glass' | 'analog' | 'chamber' | 'dub'.
   * @param {string} name
   */
  setPalette(name) {
    const valid = ['glass', 'analog', 'chamber', 'dub'];
    const p = valid.includes(name?.toLowerCase()) ? name.toLowerCase() : 'analog';
    this.activePalette = p;

    if (this.scheduler) {
      this.scheduler.setPalette(p);
    }

    if (!this.ctx || !this.isInitialized) return;
    const now = this.ctx.currentTime;
    const transitionTime = now + 1.2; // 1.2s smooth crossfade

    try {
      switch (p) {
        case 'glass':
          this.reverbGain.gain.exponentialRampToValueAtTime(0.48, transitionTime);
          this.dryGain.gain.exponentialRampToValueAtTime(0.72, transitionTime);
          this.blockFilter.Q.linearRampToValueAtTime(0.8, transitionTime);
          break;
        case 'chamber':
          this.reverbGain.gain.exponentialRampToValueAtTime(0.42, transitionTime);
          this.dryGain.gain.exponentialRampToValueAtTime(0.78, transitionTime);
          this.blockFilter.Q.linearRampToValueAtTime(1.2, transitionTime);
          break;
        case 'dub':
          this.reverbGain.gain.exponentialRampToValueAtTime(0.55, transitionTime);
          this.dryGain.gain.exponentialRampToValueAtTime(0.65, transitionTime);
          this.blockFilter.Q.linearRampToValueAtTime(2.2, transitionTime);
          break;
        case 'analog':
        default:
          this.reverbGain.gain.exponentialRampToValueAtTime(0.32, transitionTime);
          this.dryGain.gain.exponentialRampToValueAtTime(0.85, transitionTime);
          this.blockFilter.Q.linearRampToValueAtTime(1.4, transitionTime);
          break;
      }
    } catch {}
  }

  /**
   * Sets active playback mode: 'live' | 'replay' | 'band' | 'orchestra'.
   * @param {string} mode
   */
  setMode(mode) {
    this.activeMode = mode || 'live';
    if (this.scheduler) {
      this.scheduler.setMode(this.activeMode);
    }
  }

  /**
   * Returns scheduler lateness, polyphony and audio context health metrics.
   * @returns {object}
   */
  getSchedulerStats() {
    if (!this.scheduler) {
      return {
        avgLatenessMs: 0,
        maxLatenessMs: 0,
        currentLatenessMs: 0,
        activeVoices: 0,
        isStruggling: false,
        maxPolyphony: 16,
        mode: this.activeMode,
        palette: this.activePalette,
        contextState: this.ctx ? this.ctx.state : 'uninitialized',
        baseLatency: this.ctx?.baseLatency ? Number((this.ctx.baseLatency * 1000).toFixed(1)) : 0,
      };
    }
    const stats = this.scheduler.getStats();
    stats.contextState = this.ctx ? this.ctx.state : 'uninitialized';
    stats.baseLatency = this.ctx?.baseLatency ? Number((this.ctx.baseLatency * 1000).toFixed(1)) : 0;
    return stats;
  }

  /**
   * Start or resume audio playback.
   * @returns {Promise<void>}
   */
  async start() {
    this.init();

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    this.isPlaying = true;
    this.scheduler.start();
  }

  /**
   * Stop or suspend audio playback.
   */
  stop() {
    if (!this.isInitialized) return;
    this.isPlaying = false;
    if (this.scheduler) {
      this.scheduler.stop();
    }
  }

  /**
   * Set master volume with 0.8 maximum safety ceiling.
   * @param {number} vol - 0.0 to 1.0
   */
  setVolume(vol) {
    this.userVolume = Math.min(1.0, Math.max(0, Number(vol || 0)));
    if (!this.masterGain || !this.ctx) return;

    const safeLevel = this.isMuted ? 0.0001 : Math.min(0.8, this.userVolume * 0.8);
    this.masterGain.gain.linearRampToValueAtTime(safeLevel, this.ctx.currentTime + 0.05);
  }

  /**
   * Mute or unmute audio.
   * @param {boolean} isMuted
   */
  setMute(isMuted) {
    this.isMuted = Boolean(isMuted);
    if (!this.masterGain || !this.ctx) return;

    const safeLevel = this.isMuted ? 0.0001 : Math.min(0.8, this.userVolume * 0.8);
    this.masterGain.gain.linearRampToValueAtTime(safeLevel, this.ctx.currentTime + 0.05);
  }

  /**
   * Updates telemetry state and modulates filter cutoff.
   * @param {object} statusData
   */
  updateTelemetry(statusData) {
    this.latestTelemetry = statusData;

    if (!this.blockFilter || !this.ctx || !statusData) return;

    const targetCutoff = calculateFilterCutoff(statusData.blockProgressRatio);
    // Smooth exponential transition for filter opening
    this.blockFilter.frequency.exponentialRampToValueAtTime(
      Math.max(200, Math.min(18000, targetCutoff)),
      this.ctx.currentTime + 0.8
    );
  }

  /**
   * Rings the FM settlement chime when a block settlement confirms.
   */
  ringSettlementChime() {
    if (!this.ctx || !this.isPlaying || !this.synthBus) return;
    const chimeFreq = 1174.66; // D6 high bell
    playBell(this.ctx, this.synthBus, this.ctx.currentTime, chimeFreq, 3.5, 0.7);
  }

  /**
   * Registers active NFT band voices.
   * @param {Array} voices
   */
  setBandVoices(voices) {
    this.bandVoices = voices || [];
  }

  /**
   * Returns frequency data array for visualizer.
   * @param {Uint8Array} [array]
   * @returns {Uint8Array}
   */
  getFrequencyData(array) {
    if (!this.analyser) return new Uint8Array(128);
    const data = array || new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Returns time-domain waveform data array for visualizer.
   * @param {Uint8Array} [array]
   * @returns {Uint8Array}
   */
  getTimeDomainData(array) {
    if (!this.analyser) return new Uint8Array(128);
    const data = array || new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }
}

// Global audio engine singleton
export const audioEngine = new AudioEngine();

