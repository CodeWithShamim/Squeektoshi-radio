/**
 * Squeektoshi Radio - Squeek NFT Band Engine (Feature 3)
 *
 * Maps an account's Squeek NFTs into synthesized musical voices:
 * - Level 1: Pluck
 * - Level 2: FM Bell
 * - Level 3: Marimba
 * - Level 4: Pad
 * - Level 5+: Lead with vibrato
 * - Stereo Pan: (tokenId % 16 - 7.5) / 7.5 (-1.0 to +1.0)
 * - Loudness: Proportional to basePower share among top 8 active voices
 * - Card Glow: Dispatches event on note trigger
 */

import {
  playPluck,
  playBell,
  playMarimba,
  playPad,
  playLead,
} from './voices.js';
import { choose } from './prng.js';
import { pulseCardGlow } from '../ui/cards.js';

export class SqueekVoice {
  /**
   * @param {object} token
   * @param {number} powerShare - 0.0 to 1.0
   * @param {AudioContext} [ctx]
   */
  constructor(token, powerShare = 0.25) {
    this.token = token;
    this.tokenId = String(token.tokenId);
    this.level = Number(token.level ?? 1);
    this.numericTokenId = Number(token.tokenId) || 1;
    this.powerShare = Math.min(1.0, Math.max(0.05, powerShare));

    // Stereo panning: tokenId % 16 mapped to [-1, 1]
    const rawPan = ((this.numericTokenId % 16) - 7.5) / 7.5;
    this.panValue = Math.min(0.9, Math.max(-0.9, rawPan));

    this.pannerNode = null;
  }

  /**
   * Returns or creates a StereoPannerNode connected to destination.
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @returns {AudioNode}
   */
  getDestination(ctx, destination) {
    if (!this.pannerNode || this.pannerNode.context !== ctx) {
      if (ctx.createStereoPanner) {
        this.pannerNode = ctx.createStereoPanner();
        this.pannerNode.pan.setValueAtTime(this.panValue, ctx.currentTime);
        this.pannerNode.connect(destination);
      } else {
        // Fallback for older browsers
        return destination;
      }
    }
    return this.pannerNode;
  }

  /**
   * Schedules a note event during a 16th-note step.
   * @param {AudioContext} ctx
   * @param {number} time
   * @param {number} step
   * @param {() => number} prng
   * @param {number[]} scaleFreqs
   * @param {number} [masterGain=1.0]
   */
  scheduleStep(ctx, time, step, prng, scaleFreqs, masterGain = 1.0) {
    const dest = this.getDestination(ctx, ctx.destination);
    const stepInBar = step % 16;
    const gain = this.powerShare * 0.5 * masterGain;

    let played = false;

    if (this.level === 1) {
      // Level 1: Pluck melody on 8th notes
      if (stepInBar % 2 === 0 && prng() > 0.45) {
        const freq = choose(prng, scaleFreqs.slice(2, 9)) || 440;
        playPluck(ctx, dest, time, freq, 0.28, gain * 0.9);
        played = true;
      }
    } else if (this.level === 2) {
      // Level 2: FM Bell on sparse accents
      if (stepInBar === 4 || stepInBar === 12) {
        if (prng() > 0.35) {
          const freq = choose(prng, scaleFreqs.slice(-6)) || 880;
          playBell(ctx, dest, time, freq, 1.8, gain * 0.85);
          played = true;
        }
      }
    } else if (this.level === 3) {
      // Level 3: Syncopated Marimba
      if ((stepInBar % 4 === 1 || stepInBar % 4 === 3) && prng() > 0.3) {
        const freq = choose(prng, scaleFreqs.slice(0, 7)) || 330;
        playMarimba(ctx, dest, time, freq, 0.22, gain * 0.95);
        played = true;
      }
    } else if (this.level === 4) {
      // Level 4: Sustained ambient pad chord
      if (stepInBar === 0 && prng() > 0.2) {
        const chord = [scaleFreqs[0] || 220, scaleFreqs[2] || 330, scaleFreqs[4] || 440];
        playPad(ctx, dest, time, chord, 2.2, gain * 0.7);
        played = true;
      }
    } else {
      // Level 5+: High-energy Solo Lead
      if (prng() > 0.35) {
        const freq = choose(prng, scaleFreqs.slice(5, 14)) || 587.33;
        playLead(ctx, dest, time, freq, 0.2, gain * 0.8);
        played = true;
      }
    }

    if (played) {
      const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
      setTimeout(() => pulseCardGlow(this.tokenId), delayMs);
    }
  }
}

/**
 * Builds up to 8 SqueekVoice instances from a tokens list,
 * sorted by basePower share.
 * @param {Array<object>} tokens
 * @returns {SqueekVoice[]}
 */
export function buildBandVoices(tokens) {
  if (!tokens || tokens.length === 0) return [];

  // Sort descending by numericBasePower
  const sorted = [...tokens].sort((a, b) => {
    const pA = Number(a.numericBasePower ?? a.basePower ?? 1000);
    const pB = Number(b.numericBasePower ?? b.basePower ?? 1000);
    return pB - pA;
  });

  // Cap at top 8 loudest voices
  const top8 = sorted.slice(0, 8);

  // Compute total power
  const totalPower = top8.reduce((sum, t) => sum + Number(t.numericBasePower ?? t.basePower ?? 1000), 0);

  return top8.map((token) => {
    const power = Number(token.numericBasePower ?? token.basePower ?? 1000);
    const share = totalPower > 0 ? power / totalPower : 1 / top8.length;
    return new SqueekVoice(token, share);
  });
}

