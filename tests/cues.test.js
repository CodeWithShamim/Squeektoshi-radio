import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CueManager } from '../src/audio/cues.js';

// Mock Web Audio Context for Node test runner
class MockAudioParam {
  constructor(val = 0) {
    this.value = val;
  }
  setValueAtTime(v) {
    this.value = v;
  }
  setTargetAtTime(v) {
    this.value = v;
  }
  linearRampToValueAtTime(v) {
    this.value = v;
  }
  exponentialRampToValueAtTime(v) {
    this.value = v;
  }
}

class MockAudioNode {
  constructor() {
    this.connections = [];
  }
  connect(dest) {
    this.connections.push(dest);
    return dest;
  }
  disconnect() {
    this.connections = [];
  }
}

class MockGainNode extends MockAudioNode {
  constructor() {
    super();
    this.gain = new MockAudioParam(1);
  }
}

class MockOscillatorNode extends MockAudioNode {
  constructor() {
    super();
    this.frequency = new MockAudioParam(440);
    this.type = 'sine';
    this.onended = null;
  }
  start() {}
  stop() {
    if (typeof this.onended === 'function') {
      setTimeout(() => this.onended(), 5);
    }
  }
}

class MockCompressorNode extends MockAudioNode {
  constructor() {
    super();
    this.threshold = new MockAudioParam(-18);
    this.knee = new MockAudioParam(6);
    this.ratio = new MockAudioParam(8);
    this.attack = new MockAudioParam(0.003);
    this.release = new MockAudioParam(0.08);
  }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = new MockAudioNode();
  }
  createGain() {
    return new MockGainNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
  createDynamicsCompressor() {
    return new MockCompressorNode();
  }
  createStereoPanner() {
    const p = new MockAudioNode();
    p.pan = new MockAudioParam(0);
    return p;
  }
}

describe('Sound Cues (CueManager) — Unit Tests', () => {
  test('initializes isolated cue sub-graph with limiter and -12dB bus gain', () => {
    const ctx = new MockAudioContext();
    const mgr = new CueManager();
    mgr.init(ctx);

    assert.ok(mgr.cueLimiter, 'Limiter should be created');
    assert.ok(mgr.cueBusGain, 'Cue bus gain should be created');

    // Limiter connects to ctx.destination
    assert.equal(mgr.cueLimiter.connections[0], ctx.destination);
    // cueBusGain connects to cueLimiter
    assert.equal(mgr.cueBusGain.connections[0], mgr.cueLimiter);
    // Gain is approximately ~0.176 (-12dB relative to master)
    assert.ok(mgr.cueBusGain.gain.value <= 0.25, `Cue bus gain must be <= 0.25 (-12dB), got ${mgr.cueBusGain.gain.value}`);
  });

  test('guards against playing before first user interaction', () => {
    const ctx = new MockAudioContext();
    const mgr = new CueManager();
    mgr.init(ctx);

    // Before unlock
    assert.equal(mgr.hasUserInteracted, false);
    const triggered = mgr.playSeat('1', 1);
    assert.equal(triggered, false, 'Cue must not trigger before user interaction');

    // After unlock
    mgr.unlock();
    assert.equal(mgr.hasUserInteracted, true);
    const triggeredAfter = mgr.playSeat('1', 1);
    assert.equal(triggeredAfter, true, 'Cue triggers once unlocked');
  });

  test('toggles on/off and silences bus gain', () => {
    const ctx = new MockAudioContext();
    const mgr = new CueManager();
    mgr.init(ctx);
    mgr.unlock();

    assert.equal(mgr.enabled, true);

    // Toggle OFF
    mgr.toggle(false);
    assert.equal(mgr.enabled, false);
    assert.equal(mgr.cueBusGain.gain.value, 0.0);
    assert.equal(mgr.playSeat('1', 1), false);

    // Toggle ON
    mgr.toggle(true);
    assert.equal(mgr.enabled, true);
    assert.ok(mgr.cueBusGain.gain.value > 0);
  });

  test('rate limiter: 100 rapid seat requests produce <= 8 sounds per second', () => {
    const ctx = new MockAudioContext();
    const mgr = new CueManager();
    mgr.init(ctx);
    mgr.unlock();

    mgr.seatPlayedCount = 0;
    let allowedCount = 0;

    // Simulate 100 rapid seat plucks in the same burst (0ms elapsed)
    for (let i = 0; i < 100; i++) {
      const allowed = mgr.playSeat(String(i + 1), (i % 5) + 1);
      if (allowed) allowedCount++;
    }

    assert.equal(allowedCount, 8, `Expected exactly 8 sounds allowed in initial burst, got ${allowedCount}`);
    assert.equal(mgr.seatPlayedCount, 8);
  });

  test('muted by default in overlay mode unless allowOverlayCues is set', () => {
    const overlayMgr = new CueManager({ isOverlay: true, allowOverlayCues: false });
    assert.equal(overlayMgr.enabled, false, 'Overlay mode must mute cues by default');

    const overlayWithCues = new CueManager({ isOverlay: true, allowOverlayCues: true });
    assert.equal(overlayWithCues.enabled, true, 'Overlay mode allows cues when ?cues=1 is present');
  });
});
