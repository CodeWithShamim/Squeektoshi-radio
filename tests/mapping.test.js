import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMood,
  calculateBpm,
  calculateKey,
  midiToFreq,
  getScaleFrequencies,
  getChordProgression,
  calculateFilterCutoff,
} from '../src/music/mapping.js';

describe('Music Mapping - Pure Functions', () => {
  it('resolves moods correctly from telemetry status', () => {
    // Sleep: IDLE or 0 rpm
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'online', isSpinning: false, rpm: 0 }),
      'sleep'
    );
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'online', isSpinning: true, rpm: 0 }),
      'sleep'
    );

    // Jog: spinning and rpm < 60
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'online', isSpinning: true, rpm: 25.5 }),
      'jog'
    );
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'online', isSpinning: true, rpm: 59.9 }),
      'jog'
    );

    // Zoomies: spinning and rpm >= 60
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'online', isSpinning: true, rpm: 60 }),
      'zoomies'
    );
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'online', isSpinning: true, rpm: 110 }),
      'zoomies'
    );

    // Unknown: stale or unavailable
    assert.equal(
      resolveMood({ isAvailable: true, freshness: 'stale', isSpinning: true, rpm: 75 }),
      'unknown'
    );
    assert.equal(
      resolveMood({ isAvailable: false, freshness: 'online', isSpinning: true, rpm: 75 }),
      'unknown'
    );
    assert.equal(resolveMood(null), 'unknown');
  });

  it('calculates BPM clamped [48, 160] and quantized to multiples of 4', () => {
    // 0 RPM: 48 + 0 = 48
    assert.equal(calculateBpm(0), 48);

    // Negative RPM: clamped to 48
    assert.equal(calculateBpm(-10), 48);

    // Moderate RPM (e.g. 35 RPM): 48 + 35*1.4 = 97 -> quantized to 96
    assert.equal(calculateBpm(35), 96);

    // Zoomies RPM (e.g. 70 RPM): 48 + 70*1.4 = 146 -> quantized to 148
    assert.equal(calculateBpm(70), 148);

    // Extreme RPM (e.g. 150 RPM): 48 + 210 = 258 -> clamped to 160
    assert.equal(calculateBpm(150), 160);

    // Quantization invariant: always a multiple of 4
    for (let r = 0; r <= 120; r += 3) {
      const bpm = calculateBpm(r);
      assert.equal(bpm % 4, 0, `BPM ${bpm} for RPM ${r} is not a multiple of 4`);
      assert.ok(bpm >= 48 && bpm <= 160);
    }
  });

  it('calculates key root note and MIDI number from block height', () => {
    const key0 = calculateKey(0);
    assert.equal(key0.rootName, 'C');
    assert.equal(key0.rootMidi, 48);

    const key1 = calculateKey(1);
    assert.equal(key1.rootName, 'C#');
    assert.equal(key1.rootMidi, 49);

    const key12 = calculateKey(12);
    assert.equal(key12.rootName, 'C');
    assert.equal(key12.rootMidi, 48);

    // Real Sepolia block 1140: 1140 % 12 = 0 -> C
    assert.equal(calculateKey(1140).rootName, 'C');

    // Block 2366: 2366 % 12 = 2 -> D
    assert.equal(calculateKey(2366).rootName, 'D');
  });

  it('converts MIDI notes to accurate frequencies', () => {
    // A4 (MIDI 69) = 440 Hz
    assert.ok(Math.abs(midiToFreq(69) - 440) < 0.001);

    // Middle C (MIDI 60) ≈ 261.6256 Hz
    assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 0.01);

    // C3 (MIDI 48) ≈ 130.8128 Hz
    assert.ok(Math.abs(midiToFreq(48) - 130.8128) < 0.01);
  });

  it('generates scale frequencies for all moods', () => {
    const sleepFreqs = getScaleFrequencies(48, 'sleep', 2);
    assert.equal(sleepFreqs.length, 10); // 5 notes * 2 octaves
    assert.ok(sleepFreqs[0] < sleepFreqs[1]);

    const jogFreqs = getScaleFrequencies(48, 'jog', 2);
    assert.equal(jogFreqs.length, 14); // 7 notes * 2 octaves

    const zoomiesFreqs = getScaleFrequencies(48, 'zoomies', 2);
    assert.equal(zoomiesFreqs.length, 14); // 7 notes * 2 octaves
  });

  it('generates 4-chord progression deterministically', () => {
    const prog1 = getChordProgression(1140, 'sleep');
    const prog2 = getChordProgression(1140, 'sleep');
    assert.deepEqual(prog1, prog2);
    assert.equal(prog1.length, 4);
    assert.ok(prog1[0].length >= 3);

    const zoomProg = getChordProgression(1140, 'zoomies');
    assert.equal(zoomProg.length, 4);
  });

  it('calculates low-pass filter opening from block progress', () => {
    const cutoff0 = calculateFilterCutoff(0);
    assert.ok(Math.abs(cutoff0 - 350) < 0.01);

    const cutoff1 = calculateFilterCutoff(1);
    assert.ok(Math.abs(cutoff1 - 10000) < 0.01);

    const cutoffHalf = calculateFilterCutoff(0.5);
    // Exponential midpoint should be sqrt(350 * 10000) ≈ 1870.8 Hz
    assert.ok(Math.abs(cutoffHalf - 1870.8) < 1.0);

    // Monotonicity test
    let prev = 0;
    for (let p = 0; p <= 1; p += 0.1) {
      const c = calculateFilterCutoff(p);
      assert.ok(c > prev);
      prev = c;
    }
  });
});

