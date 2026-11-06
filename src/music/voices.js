/**
 * Squeektoshi Radio - Web Audio Synthesizer Voices
 *
 * 100% procedurally synthesized instruments using Web Audio API:
 * - Kick: Pitch-swept sine wave
 * - Hi-Hat: Band-passed white noise bursts
 * - Pluck (Level 1 Squeek / Jog melody): Filter-enveloped triangle/sine
 * - Detuned Pad (Level 4 Squeek / Sleep mood): Dual detuned saws with slow envelope
 * - FM Bell (Level 2 Squeek / Settlement chime): Inharmonic frequency modulation
 * - Lead with Vibrato (Level 5+ Squeek / Zoomies lead): Bandlimited saw with 5Hz LFO
 * - Marimba (Level 3 Squeek): Woody percussive transient with rapid harmonic decay
 *
 * All voices use short click-free exponential envelopes and stop cleanly.
 */

let cachedNoiseBuffer = null;

/**
 * Returns a cached 1-second white noise buffer.
 * @param {AudioContext} ctx
 * @returns {AudioBuffer}
 */
export function getNoiseBuffer(ctx) {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const bufferSize = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}

/**
 * Generates an algorithmic stereo reverb impulse response.
 * @param {AudioContext} ctx
 * @param {number} [duration=2.2] - Duration in seconds
 * @param {number} [decay=2.5] - Exponential decay rate
 * @returns {AudioBuffer}
 */
export function createReverbImpulse(ctx, duration = 2.2, decay = 2.5) {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * decay);
    left[i] = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }

  return impulse;
}

/**
 * Synthesizes a punchy kick drum.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {number} [gain=0.75]
 */
export function playKick(ctx, dest, time, gain = 0.75) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.08);

  gainNode.gain.setValueAtTime(gain * 0.85, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

  osc.connect(gainNode);
  gainNode.connect(dest);

  osc.start(time);
  osc.stop(time + 0.23);
}

/**
 * Synthesizes a crisp hi-hat cymbal.
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {boolean} [isAccented=false]
 * @param {number} [gain=0.3]
 */
export function playHiHat(ctx, dest, time, isAccented = false, gain = 0.3) {
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(7500, time);

  const gainNode = ctx.createGain();
  const peakGain = (isAccented ? 0.35 : 0.2) * gain;
  gainNode.gain.setValueAtTime(peakGain, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + (isAccented ? 0.06 : 0.035));

  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dest);

  noise.start(time);
  noise.stop(time + 0.07);
}

/**
 * Synthesizes a plucked string voice (Level 1 Squeek / Jog Melody).
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {number} freq - Frequency in Hz
 * @param {number} [duration=0.35]
 * @param {number} [gain=0.5]
 */
export function playPluck(ctx, dest, time, freq, duration = 0.35, gain = 0.5) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, time);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(12000, freq * 5), time);
  filter.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.2), time + duration);

  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.linearRampToValueAtTime(gain * 0.55, time + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dest);

  osc.start(time);
  osc.stop(time + duration + 0.02);
}

/**
 * Synthesizes a warm detuned pad chord (Level 4 Squeek / Sleep Atmosphere).
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {number[]} freqs - Array of chord frequencies in Hz
 * @param {number} [duration=2.5]
 * @param {number} [gain=0.35]
 */
export function playPad(ctx, dest, time, freqs, duration = 2.5, gain = 0.35) {
  if (!freqs || freqs.length === 0) return;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(850, time);
  filter.Q.setValueAtTime(1.5, time);

  const gainNode = ctx.createGain();
  const noteGain = (gain / freqs.length) * 0.5;

  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.linearRampToValueAtTime(noteGain, time + 0.5); // 500ms attack
  gainNode.gain.setValueAtTime(noteGain, time + duration - 0.7);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration); // 700ms release

  gainNode.connect(filter);
  filter.connect(dest);

  freqs.forEach((freq) => {
    // Dual detuned oscillators (±6 cents) for lush chorus effect
    [-6, 6].forEach((detune) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      osc.detune.setValueAtTime(detune, time);
      osc.connect(gainNode);
      osc.start(time);
      osc.stop(time + duration + 0.05);
    });
  });
}

/**
 * Synthesizes an inharmonic FM Bell (Level 2 Squeek / Settlement Chime).
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {number} freq - Carrier frequency in Hz
 * @param {number} [duration=2.0]
 * @param {number} [gain=0.55]
 */
export function playBell(ctx, dest, time, freq, duration = 2.0, gain = 0.55) {
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const masterGain = ctx.createGain();

  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(freq, time);

  // Inharmonic ratio ~2.76 creates metallic chime spectrum
  modulator.type = 'sine';
  modulator.frequency.setValueAtTime(freq * 2.76, time);

  const modDepth = freq * 1.8;
  modGain.gain.setValueAtTime(modDepth, time);
  modGain.gain.exponentialRampToValueAtTime(0.1, time + 0.4);

  masterGain.gain.setValueAtTime(0.0001, time);
  masterGain.gain.linearRampToValueAtTime(gain * 0.5, time + 0.005);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  carrier.connect(masterGain);
  masterGain.connect(dest);

  modulator.start(time);
  carrier.start(time);

  modulator.stop(time + duration + 0.02);
  carrier.stop(time + duration + 0.02);
}

/**
 * Synthesizes a melodic lead with 5Hz vibrato (Level 5+ Squeek / Zoomies Lead).
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {number} freq - Frequency in Hz
 * @param {number} [duration=0.3]
 * @param {number} [gain=0.45]
 */
export function playLead(ctx, dest, time, freq, duration = 0.3, gain = 0.45) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  // Vibrato LFO at 5 Hz
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.setValueAtTime(5, time);
  lfoGain.gain.setValueAtTime(freq * 0.015, time); // ~25 cents vibrato
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(10000, freq * 3.5), time);
  filter.Q.setValueAtTime(2.0, time);

  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.linearRampToValueAtTime(gain * 0.45, time + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(dest);

  lfo.start(time);
  osc.start(time);

  lfo.stop(time + duration + 0.02);
  osc.stop(time + duration + 0.02);
}

/**
 * Synthesizes a woody Marimba tone (Level 3 Squeek).
 * @param {AudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} time
 * @param {number} freq - Frequency in Hz
 * @param {number} [duration=0.25]
 * @param {number} [gain=0.55]
 */
export function playMarimba(ctx, dest, time, freq, duration = 0.25, gain = 0.55) {
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  const gain2 = ctx.createGain();
  const masterGain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(freq, time);
  gain1.gain.setValueAtTime(1.0, time);

  // 4th harmonic transient for wood hit character
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 3.98, time);
  gain2.gain.setValueAtTime(0.4, time);
  gain2.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

  masterGain.gain.setValueAtTime(0.0001, time);
  masterGain.gain.linearRampToValueAtTime(gain * 0.5, time + 0.004);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc1.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(masterGain);
  gain2.connect(masterGain);
  masterGain.connect(dest);

  osc1.start(time);
  osc2.start(time);

  osc1.stop(time + duration + 0.02);
  osc2.stop(time + duration + 0.02);
}

