/**
 * Squeektoshi Radio - Pure Music Mapping Functions
 *
 * Translates telemetry state (RPM, block height, progress) into musical structures:
 * mood, tempo, key, scale intervals, chord progressions, and filter cutoffs.
 * 100% pure functions suitable for unit testing in Node without Web Audio or DOM dependencies.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Scale interval definitions (semitones above root)
export const SCALES = {
  // Minor Pentatonic for sleep / lullaby
  sleep: [0, 3, 5, 7, 10],
  // Dorian mode for jog / groove
  jog: [0, 2, 3, 5, 7, 9, 10],
  // Mixolydian mode for zoomies / high-energy
  zoomies: [0, 2, 4, 5, 7, 9, 10],
  // Fallback for unknown / signal lost
  unknown: [0, 3, 5, 7, 10],
};

/**
 * Determine musical mood from telemetry status.
 * @param {object} statusData
 * @returns {'sleep'|'jog'|'zoomies'|'unknown'}
 */
export function resolveMood(statusData) {
  if (!statusData || !statusData.isAvailable || statusData.freshness === 'stale') {
    return 'unknown';
  }
  const rpm = Number(statusData.rpm ?? 0);
  const isSpinning = Boolean(statusData.isSpinning);

  if (!isSpinning || rpm <= 0) {
    return 'sleep';
  }
  if (rpm < 60) {
    return 'jog';
  }
  return 'zoomies';
}

/**
 * Calculate station tempo (BPM) from wheel RPM.
 * Formula: clamp(48 + rpm * 1.4, 48, 160), quantized to steps of 4.
 * @param {number} rpm
 * @returns {number}
 */
export function calculateBpm(rpm) {
  const safeRpm = Math.max(0, Number(rpm ?? 0));
  const rawBpm = Math.min(160, Math.max(48, 48 + safeRpm * 1.4));
  return Math.round(rawBpm / 4) * 4;
}

/**
 * Calculate root note information from Squeek block height.
 * Block height % 12 determines semitones above C.
 * @param {number} blockHeight
 * @returns {{ rootIndex: number, rootName: string, rootMidi: number }}
 */
export function calculateKey(blockHeight) {
  const safeHeight = Math.max(0, Math.floor(Number(blockHeight ?? 0)));
  const rootIndex = safeHeight % 12;
  const rootName = NOTE_NAMES[rootIndex];
  // Base MIDI root in 3rd octave (C3 = 48)
  const rootMidi = 48 + rootIndex;
  return { rootIndex, rootName, rootMidi };
}

/**
 * Convert MIDI note number to frequency in Hertz.
 * @param {number} midiNote
 * @returns {number}
 */
export function midiToFreq(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Generates note frequencies for a given scale and octave span.
 * @param {number} rootMidi - Base MIDI note (e.g. 48 for C3)
 * @param {'sleep'|'jog'|'zoomies'|'unknown'} mood
 * @param {number} [octaveCount=3]
 * @returns {number[]} Array of frequencies in Hz
 */
export function getScaleFrequencies(rootMidi, mood, octaveCount = 3) {
  const intervals = SCALES[mood] || SCALES.unknown;
  const freqs = [];

  for (let oct = 0; oct < octaveCount; oct++) {
    for (const semitone of intervals) {
      const midi = rootMidi + oct * 12 + semitone;
      freqs.push(midiToFreq(midi));
    }
  }

  return freqs;
}

/**
 * Returns a 4-chord progression deterministically seeded by blockHeight and mood.
 * Each chord contains an array of frequencies [root, third, fifth, optSeventh].
 * @param {number} blockHeight
 * @param {'sleep'|'jog'|'zoomies'|'unknown'} mood
 * @returns {Array<number[]>} Array of 4 chords, each an array of frequencies
 */
export function getChordProgression(blockHeight, mood) {
  const { rootMidi } = calculateKey(blockHeight);
  // Chord shapes relative to root (semitones):
  // sleep: [i, VI, III, VII] ambient minor
  // jog:   [i, IV, v, VII] dorian groove
  // zoomies: [I, VII, IV, I] mixolydian drive
  let patterns;
  if (mood === 'zoomies') {
    patterns = [
      [0, 4, 7],      // I
      [10, 14, 17],   // VII
      [5, 9, 12],     // IV
      [0, 4, 7, 12],  // I oct
    ];
  } else if (mood === 'jog') {
    patterns = [
      [0, 3, 7],      // i
      [5, 9, 12],     // IV (Dorian major IV)
      [7, 10, 14],    // v
      [10, 14, 17],   // VII
    ];
  } else {
    // sleep & unknown
    patterns = [
      [0, 3, 7],      // i
      [8, 12, 15],    // VI
      [3, 7, 10],     // III
      [10, 14, 17],   // VII
    ];
  }

  // Offset patterns slightly based on blockHeight variation
  const variation = Math.floor(blockHeight / 4) % patterns.length;
  const rotatedPatterns = [
    ...patterns.slice(variation),
    ...patterns.slice(0, variation),
  ];

  return rotatedPatterns.map((intervals) =>
    intervals.map((semitone) => midiToFreq(rootMidi + semitone))
  );
}

/**
 * Calculates master low-pass filter cutoff from blockProgressRatio (0.0 to 1.0).
 * Exponential curve from 350 Hz to 10,000 Hz.
 * As a block completes, listeners can physically hear the station brightening.
 * @param {number} progressRatio - Number between 0.0 and 1.0
 * @returns {number} Filter cutoff frequency in Hz
 */
export function calculateFilterCutoff(progressRatio) {
  const ratio = Math.min(1, Math.max(0, Number(progressRatio ?? 0)));
  const minFreq = 350;
  const maxFreq = 10000;
  return minFreq * Math.pow(maxFreq / minFreq, ratio);
}

