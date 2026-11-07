/**
 * Squeektoshi Radio - Look-Ahead Audio Scheduler
 *
 * Implements the Web Audio dual-thread look-ahead scheduling architecture.
 * Schedules events 100ms into the future using precise audioContext.currentTime timestamps,
 * evaluated via a 25ms JavaScript interval.
 */

import { createMulberry32, getSharedSeed, choose } from './prng.js';
import {
  resolveMood,
  calculateBpm,
  calculateKey,
  getScaleFrequencies,
  getChordProgression,
} from './mapping.js';
import {
  playKick,
  playHiHat,
  playPluck,
  playPad,
  playBell,
  playLead,
} from './voices.js';

export class LookAheadScheduler {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {() => object} getTelemetry
   * @param {() => Array} [getBandVoices]
   */
  constructor(ctx, destination, getTelemetry, getBandVoices = () => []) {
    this.ctx = ctx;
    this.destination = destination;
    this.getTelemetry = getTelemetry;
    this.getBandVoices = getBandVoices;

    this.lookAheadMs = 100; // Look-ahead window (100ms)
    this.intervalMs = 25;   // Timer tick interval (25ms)
    this.timerId = null;

    this.nextStepTime = 0;
    this.stepIndex = 0;
    this.isRunning = false;

    // Smoothed tempo
    this.currentBpm = 48;
    this.targetBpm = 48;

    // Performance & Voice Pool
    this.maxPolyphony = 16;
    this.activeVoices = 0;
    this.palette = 'analog';
    this.mode = 'live'; // 'live' | 'replay' | 'band' | 'orchestra'

    // Lateness Telemetry & Buffering Monitor
    this.latenessSamples = [];
    this.maxLatenessMs = 0;
    this.avgLatenessMs = 0;
    this.currentLatenessMs = 0;
    this.strugglingDurationMs = 0;
    this.isStruggling = false;
    this.onBufferingStateChange = null;
  }

  setPalette(palette) {
    this.palette = palette || 'analog';
  }

  setMode(mode) {
    this.mode = mode || 'live';
  }

  recordLateness(lateness) {
    this.currentLatenessMs = lateness;
    this.latenessSamples.push(lateness);
    if (this.latenessSamples.length > 80) this.latenessSamples.shift();

    const sum = this.latenessSamples.reduce((a, b) => a + b, 0);
    this.avgLatenessMs = sum / this.latenessSamples.length;
    if (lateness > this.maxLatenessMs) this.maxLatenessMs = lateness;

    // Buffering condition: lateness > 40ms for 2s (2000ms)
    if (lateness > 40) {
      this.strugglingDurationMs += this.intervalMs;
      if (this.strugglingDurationMs >= 2000 && !this.isStruggling) {
        this.isStruggling = true;
        this.maxPolyphony = 8; // Adaptively drop polyphony
        if (this.onBufferingStateChange) this.onBufferingStateChange(true, lateness);
      }
    } else if (lateness < 25) {
      this.strugglingDurationMs = Math.max(0, this.strugglingDurationMs - this.intervalMs * 2);
      if (this.strugglingDurationMs === 0 && this.isStruggling) {
        this.isStruggling = false;
        this.maxPolyphony = 16;
        if (this.onBufferingStateChange) this.onBufferingStateChange(false, lateness);
      }
    }
  }

  getStats() {
    return {
      avgLatenessMs: Number(this.avgLatenessMs.toFixed(2)),
      maxLatenessMs: Number(this.maxLatenessMs.toFixed(2)),
      currentLatenessMs: Number(this.currentLatenessMs.toFixed(2)),
      activeVoices: this.activeVoices,
      isStruggling: this.isStruggling,
      maxPolyphony: this.maxPolyphony,
      mode: this.mode,
      palette: this.palette,
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.stepIndex = Math.floor(Date.now() / 150); // Initialize roughly with epoch step

    this.timerId = setInterval(() => this.scheduleTick(), this.intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  scheduleTick() {
    if (!this.isRunning) return;

    const now = this.ctx.currentTime;
    const lateness = Math.max(0, (now - this.nextStepTime) * 1000);
    this.recordLateness(lateness);

    const horizon = now + this.lookAheadMs / 1000;

    while (this.nextStepTime < horizon) {
      this.scheduleStep(this.nextStepTime, this.stepIndex);

      // Smooth BPM ramp over time
      const telemetry = this.getTelemetry() || {};
      this.targetBpm = calculateBpm(telemetry.rpm);
      this.currentBpm += (this.targetBpm - this.currentBpm) * 0.1;

      // 16th-note step duration: (60 / BPM) / 4
      const stepDuration = (60 / this.currentBpm) / 4;
      this.nextStepTime += stepDuration;
      this.stepIndex++;
    }
  }

  /**
   * Schedules a single 16th-note step.
   * @param {number} time - AudioContext time
   * @param {number} step - Step index
   */
  scheduleStep(time, step) {
    const telemetry = this.getTelemetry() || {};
    const mood = resolveMood(telemetry);
    const blockHeight = Number(telemetry.blockHeight ?? 0);

    const seed = getSharedSeed(blockHeight, step);
    const prng = createMulberry32(seed);

    const { rootMidi } = calculateKey(blockHeight);
    const scaleFreqs = getScaleFrequencies(rootMidi, mood, 3);
    const chords = getChordProgression(blockHeight, mood);

    const stepInBar = step % 16;
    const barIndex = Math.floor(step / 16);
    const currentChord = chords[barIndex % chords.length] || chords[0];

    // Master mood volume modifier
    const masterGain = mood === 'unknown' ? 0.4 : 1.0;

    // Orchestra Mode: Harmonic richness is the foreground feature
    if (this.mode === 'orchestra') {
      // Pad chord on downbeat of each bar (16 steps)
      if (stepInBar === 0 && this.activeVoices < this.maxPolyphony) {
        playPad(this.ctx, this.destination, time, currentChord, 3.2, 0.55 * masterGain);
      }
      // Counterpoint arpeggios on 8th notes
      if (stepInBar % 2 === 0 && this.activeVoices < this.maxPolyphony) {
        const chordNote = currentChord[Math.floor(stepInBar / 2) % currentChord.length];
        if (chordNote) {
          playPluck(this.ctx, this.destination, time, chordNote, 0.45, 0.5 * masterGain);
        }
      }
      // Subtle chamber chime on bar transitions
      if (stepInBar === 12 && prng() > 0.4 && this.activeVoices < this.maxPolyphony) {
        const highChime = (scaleFreqs[scaleFreqs.length - 2] || 880);
        playBell(this.ctx, this.destination, time, highChime, 2.8, 0.35 * masterGain);
      }
      // Gentle soft kick on beat 1 only
      if (stepInBar === 0) {
        playKick(this.ctx, this.destination, time, 0.5 * masterGain);
      }
    } else {
      switch (mood) {
        case 'sleep':
        case 'unknown': {
          // Pad chord every 2 bars (32 steps)
          if (step % 32 === 0 && this.activeVoices < this.maxPolyphony) {
            playPad(this.ctx, this.destination, time, currentChord, 4.0, 0.45 * masterGain);
          }
          // Sparse high bell chimes on deterministic probability
          if ((stepInBar === 0 || stepInBar === 6 || stepInBar === 12) && this.activeVoices < this.maxPolyphony) {
            if (prng() > 0.45) {
              const highFreqs = scaleFreqs.slice(-6); // high octave
              const bellFreq = choose(prng, highFreqs) || 880;
              playBell(this.ctx, this.destination, time, bellFreq, 2.5, 0.35 * masterGain);
            }
          }
          break;
        }

        case 'jog': {
          // Bar downbeat pad
          if (stepInBar === 0 && this.activeVoices < this.maxPolyphony) {
            playPad(this.ctx, this.destination, time, currentChord, 2.2, 0.35 * masterGain);
          }
          // Soft kick on beats 1 and 3 (steps 0 and 8)
          if (stepInBar === 0 || stepInBar === 8) {
            playKick(this.ctx, this.destination, time, 0.7 * masterGain);
          }
          // Off-beat hi-hat (steps 4 and 12)
          if (stepInBar % 4 === 2) {
            playHiHat(this.ctx, this.destination, time, false, 0.25 * masterGain);
          }
          // Plucked Dorian melody on 8th notes
          if (stepInBar % 2 === 0 && prng() > 0.25 && this.activeVoices < this.maxPolyphony) {
            const midFreqs = scaleFreqs.slice(3, 11);
            const noteFreq = choose(prng, midFreqs) || 440;
            playPluck(this.ctx, this.destination, time, noteFreq, 0.3, 0.45 * masterGain);
          }
          break;
        }

        case 'zoomies': {
          // Pad chord on downbeat
          if (stepInBar === 0 && this.activeVoices < this.maxPolyphony) {
            playPad(this.ctx, this.destination, time, currentChord, 1.8, 0.3 * masterGain);
          }
          // Driving kick on every quarter note (beats 1, 2, 3, 4)
          if (stepInBar % 4 === 0) {
            playKick(this.ctx, this.destination, time, 0.85 * masterGain);
          }
          // Driving 16th-note hi-hat groove
          playHiHat(this.ctx, this.destination, time, stepInBar % 4 === 0, 0.25 * masterGain);

          // Fast arpeggiated Mixolydian lead
          if (prng() > 0.2 && this.activeVoices < this.maxPolyphony) {
            const leadFreqs = scaleFreqs.slice(4, 13);
            const leadFreq = choose(prng, leadFreqs) || 523.25;
            playLead(this.ctx, this.destination, time, leadFreq, 0.18, 0.4 * masterGain);
          }
          break;
        }
      }
    }

    // Schedule active NFT band voices if any exist
    const bandVoices = this.getBandVoices();
    if (bandVoices && bandVoices.length > 0) {
      bandVoices.forEach((voice) => {
        voice.scheduleStep(this.ctx, time, step, prng, scaleFreqs, masterGain);
      });
    }
  }
}

