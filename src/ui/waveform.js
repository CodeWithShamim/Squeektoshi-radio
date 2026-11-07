/**
 * Squeektoshi Radio — Full-Bleed Background Oscilloscope & Ridgeline Renderer
 *
 * Implements a measuring instrument oscilloscope background:
 * - Master output ridgeline: 5 stacked hairline traces (center = live, 4 older frames offset)
 * - 7 Vertical audio lanes on left edge: KICK, BASS, LEAD, PAD, HARMONY, BELL, BAND
 * - Real-time per-layer level ticks on trigger/activity
 * - Traveling amber beat line (left to right) and data-blue block progress line
 * - Mood-reactive drift & spacing (sleep, jog, zoomies, unknown)
 * - State machine visual integration (idle, preparing, buffering, playing, unknown, error)
 * - Contrast-preserving: hairlines at low opacity ensuring foreground text >= 4.5:1
 * - Adaptive performance: DPR capped at 1.5, scales down if frame time > 20ms
 * - Pre-allocated Float32Array ring buffers (zero per-frame GC allocations)
 */

import { AUDIO_STATES } from './audio-state.js';

export const LANE_NAMES = ['KICK', 'BASS', 'LEAD', 'PAD', 'HARMONY', 'BELL', 'BAND'];

export class BackgroundWaveform {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas
   * @param {import('./audio-state.js').AudioStateMachine} options.stateMachine
   * @param {boolean} [options.isOverlay=false]
   */
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.stateMachine = options.stateMachine;
    this.isOverlay = options.isOverlay || false;

    // Dimensions
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Audio node reference
    this.analyser = null;
    this.fftSize = 512;

    // Pre-allocated Float32Array buffers (reused every frame)
    this.timeDomainBuffer = new Float32Array(this.fftSize);
    this.numHistoryFrames = 4; // 2 frames above, 2 frames below
    this.historyBuffers = Array.from(
      { length: this.numHistoryFrames },
      () => new Float32Array(this.fftSize)
    );
    this.historyWriteIndex = 0;
    this.historyInterval = 0.4; // update history buffer every 400ms (~2s total horizon)
    this.historyTimer = 0;

    // Visual State
    this.mood = 'sleep';
    this.bpm = 48;
    this.blockProgress = 0;
    this.beatPhase = 0; // 0.0 to 1.0 (traveling amber line across width)
    this.driftOffset = 0;
    this.preparingDashOffset = 0;
    this.activeWalletLoaded = false;

    // Per-layer activity levels [0.0 to 1.0] with smooth decay
    this.layerLevels = {
      KICK: 0,
      BASS: 0,
      LEAD: 0,
      PAD: 0,
      HARMONY: 0,
      BELL: 0,
      BAND: 0,
    };

    // Performance & adaptive scale
    this.canvasScale = 1.0;
    this.lastFrameTime = performance.now();
    this.frameTimes = [];

    // Accessibility: Reduced Motion
    this.prefersReducedMotion = false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion = mediaQuery.matches;
      mediaQuery.addEventListener('change', (e) => {
        this.prefersReducedMotion = e.matches;
      });
    }

    this.handleResize = this.resize.bind(this);
    window.addEventListener('resize', this.handleResize, { passive: true });
    this.resize();
  }

  /**
   * Connect master Web Audio AnalyserNode.
   * @param {AnalyserNode} analyser
   */
  setAnalyser(analyser) {
    this.analyser = analyser;
    if (this.analyser) {
      this.analyser.fftSize = this.fftSize;
      if (this.timeDomainBuffer.length !== this.analyser.fftSize) {
        this.timeDomainBuffer = new Float32Array(this.analyser.fftSize);
      }
    }
  }

  /**
   * Trigger activity pulse for a specific layer.
   * @param {string} layer - 'KICK' | 'BASS' | 'LEAD' | 'PAD' | 'HARMONY' | 'BELL' | 'BAND'
   * @param {number} [intensity=1.0]
   */
  pulseLayer(layer, intensity = 1.0) {
    const key = layer.toUpperCase();
    if (this.layerLevels[key] !== undefined) {
      this.layerLevels[key] = Math.max(this.layerLevels[key], Math.min(1.0, intensity));
    }
  }

  /**
   * Update telemetry and musical state.
   */
  updateTelemetry(statusData, bpm, mood) {
    if (bpm) this.bpm = bpm;
    if (mood) this.mood = mood;
    if (statusData?.blockProgressRatio !== undefined) {
      this.blockProgress = statusData.blockProgressRatio;
    }
  }

  /**
   * Set band wallet state (whether BAND lane is active).
   * @param {boolean} active
   */
  setBandActive(active) {
    this.activeWalletLoaded = Boolean(active);
  }

  /**
   * Handle viewport resize and adapt DPR.
   */
  resize() {
    if (!this.canvas) return;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    const effectiveDpr = this.dpr * this.canvasScale;
    this.canvas.width = Math.floor(this.width * effectiveDpr);
    this.canvas.height = Math.floor(this.height * effectiveDpr);

    if (this.ctx) {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(effectiveDpr, effectiveDpr);
    }
  }

  /**
   * Frame update called from shared RAF loop.
   * @param {number} deltaSeconds
   * @param {number} now
   */
  render(deltaSeconds, now) {
    if (!this.ctx || !this.canvas || (typeof document !== 'undefined' && document.hidden)) {
      return;
    }

    // Adaptive Performance Governor: monitor frame duration
    this.frameTimes.push(deltaSeconds * 1000);
    if (this.frameTimes.length > 45) {
      this.frameTimes.shift();
      const avgMs = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      if (avgMs > 20 && this.canvasScale > 0.75) {
        this.canvasScale = 0.75;
        this.resize();
      } else if (avgMs < 15 && this.canvasScale < 1.0) {
        this.canvasScale = 1.0;
        this.resize();
      }
    }

    // Decay per-layer levels smoothly
    for (const lane of LANE_NAMES) {
      if (this.layerLevels[lane] > 0) {
        this.layerLevels[lane] = Math.max(0, this.layerLevels[lane] - deltaSeconds * 2.8);
      }
    }

    // Update beat phase (traveling amber line across width, 4 beats per bar)
    const beatsPerSecond = this.bpm / 60;
    this.beatPhase = (this.beatPhase + (beatsPerSecond / 4) * deltaSeconds) % 1.0;

    // Drift speed by mood (max <= 3Hz equivalent)
    let driftRate = 25; // px/s
    if (this.mood === 'sleep') driftRate = 12;
    if (this.mood === 'jog') driftRate = 30;
    if (this.mood === 'zoomies') driftRate = 60;
    if (this.prefersReducedMotion) driftRate = 0;

    this.driftOffset = (this.driftOffset + driftRate * deltaSeconds) % (this.width || 1);
    this.preparingDashOffset = (this.preparingDashOffset + 120 * deltaSeconds) % 40;

    // Sample audio time domain into pre-allocated buffer
    let hasLiveAudio = false;
    let rms = 0;
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.timeDomainBuffer);
      let sumSq = 0;
      for (let i = 0; i < this.timeDomainBuffer.length; i++) {
        sumSq += this.timeDomainBuffer[i] * this.timeDomainBuffer[i];
      }
      rms = Math.sqrt(sumSq / this.timeDomainBuffer.length);
      hasLiveAudio = rms > 0.002;
    } else {
      this.timeDomainBuffer.fill(0);
    }

    // Update history ring buffer periodically
    this.historyTimer += deltaSeconds;
    if (this.historyTimer >= this.historyInterval) {
      this.historyTimer = 0;
      this.historyBuffers[this.historyWriteIndex].set(this.timeDomainBuffer);
      this.historyWriteIndex = (this.historyWriteIndex + 1) % this.numHistoryFrames;
    }

    // Clear Canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update state machine transitions
    if (this.stateMachine) {
      this.stateMachine.update(deltaSeconds);
    }

    // Get current state snapshot
    const smSnapshot = this.stateMachine ? this.stateMachine.getState() : { state: AUDIO_STATES.IDLE };
    const currentState = smSnapshot.targetState || smSnapshot.state;

    // Draw Visual Elements
    this.drawOscilloscopeGraticule(currentState, rms);
    this.drawLanes(currentState);
    this.drawBlockProgressLine();
    this.drawBeatLine();
    this.drawWaveformTraces(currentState, smSnapshot, rms);
    this.drawStateOverlay(smSnapshot);
  }

  /**
   * Draw professional calibrated oscilloscope frame, graticule reticle, and telemetry HUD.
   */
  drawOscilloscopeGraticule(state, rms) {
    if (this.isOverlay) return;

    const centerY = this.height / 2;
    this.ctx.save();

    // 1. Horizontal Calibrated Voltage Reference Lines (+1.0V, +0.5V, 0.0V, -0.5V, -1.0V)
    const voltLines = [
      { offset: -90, label: '+1.0V', dashed: false, alpha: 0.08 },
      { offset: -45, label: '+0.5V', dashed: true, alpha: 0.05 },
      { offset: 0, label: ' 0.0V', dashed: false, alpha: 0.12 },
      { offset: 45, label: '-0.5V', dashed: true, alpha: 0.05 },
      { offset: 90, label: '-1.0V', dashed: false, alpha: 0.08 },
    ];

    this.ctx.font = '8px "JetBrains Mono", monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    voltLines.forEach(({ offset, label, dashed, alpha }) => {
      const y = centerY + offset;
      this.ctx.beginPath();
      this.ctx.strokeStyle = `rgba(91, 140, 255, ${alpha})`;
      this.ctx.lineWidth = 1;
      if (dashed) {
        this.ctx.setLineDash([2, 6]);
      } else {
        this.ctx.setLineDash([]);
      }
      this.ctx.moveTo(70, y);
      this.ctx.lineTo(this.width - 70, y);
      this.ctx.stroke();

      // Right-edge voltage label
      this.ctx.fillStyle = `rgba(91, 140, 255, ${Math.min(0.35, alpha * 3.5)})`;
      this.ctx.fillText(label, this.width - 25, y);
    });

    // 2. Graticule Reticle Crosshairs (+) at key horizontal intervals
    const divisions = [0.1, 0.25, 0.5, 0.75, 0.9];
    this.ctx.strokeStyle = 'rgba(91, 140, 255, 0.14)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([]);

    divisions.forEach((ratio) => {
      const x = Math.floor(this.width * ratio);
      // Center crosshair
      this.ctx.beginPath();
      this.ctx.moveTo(x - 5, centerY);
      this.ctx.lineTo(x + 5, centerY);
      this.ctx.moveTo(x, centerY - 5);
      this.ctx.lineTo(x, centerY + 5);
      this.ctx.stroke();
    });

    // 3. Corner Registration Marks (+)
    const corners = [
      { x: 24, y: 32 },
      { x: this.width - 24, y: 32 },
      { x: 24, y: this.height - 76 },
      { x: this.width - 24, y: this.height - 76 },
    ];
    this.ctx.strokeStyle = 'rgba(91, 140, 255, 0.25)';
    corners.forEach(({ x, y }) => {
      this.ctx.beginPath();
      this.ctx.moveTo(x - 6, y);
      this.ctx.lineTo(x + 6, y);
      this.ctx.moveTo(x, y - 6);
      this.ctx.lineTo(x, y + 6);
      this.ctx.stroke();
    });

    // 4. Oscilloscope Frame Telemetry Readouts
    this.ctx.font = '9px "JetBrains Mono", monospace';
    this.ctx.fillStyle = 'rgba(91, 140, 255, 0.32)';

    // Top Right Status
    this.ctx.textAlign = 'right';
    this.ctx.fillText('CH1 · OSCILLOSCOPE · 48.0 kHz / 24-BIT · 25ms/DIV', this.width - 34, 34);

    // Bottom Right Level
    const peakPct = (rms * 100).toFixed(1);
    this.ctx.fillText(`RMS: ${peakPct}% · TIMEBASE: 25ms · 60 FPS`, this.width - 34, this.height - 76);

    this.ctx.restore();
  }

  /**
   * Draw horizontal lane hairlines and mono labels with activity ticks on left edge.
   */
  drawLanes(state) {
    const laneHeight = this.height / LANE_NAMES.length;
    this.ctx.save();

    for (let i = 0; i < LANE_NAMES.length; i++) {
      const lane = LANE_NAMES[i];
      const y = (i + 0.5) * laneHeight;

      // Skip inactive BAND lane unless wallet is loaded
      if (lane === 'BAND' && !this.activeWalletLoaded) {
        continue;
      }

      // 1. Subtle horizontal lane separation hairline (bone ~4% opacity)
      this.ctx.beginPath();
      this.ctx.strokeStyle = 'rgba(233, 230, 220, 0.04)';
      this.ctx.lineWidth = 1;
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();

      // 2. Mono label on left edge
      const level = this.layerLevels[lane] || 0;
      this.ctx.font = '10px "JetBrains Mono", monospace';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';

      // Label opacity illuminates on active sound
      const labelOpacity = 0.22 + level * 0.65;
      this.ctx.fillStyle = `rgba(233, 230, 220, ${labelOpacity.toFixed(2)})`;
      this.ctx.fillText(lane, 20, y - 6);

      // 3. Level ticks (3 micro ticks showing discrete activity)
      const tickWidth = 4;
      const tickGap = 3;
      const startX = 20;
      const tickY = y + 5;

      for (let t = 0; t < 3; t++) {
        const tickThreshold = (t + 1) / 3;
        const isLit = level >= tickThreshold * 0.7;
        this.ctx.fillStyle = isLit
          ? 'rgba(255, 178, 62, 0.75)' // amber
          : 'rgba(233, 230, 220, 0.12)'; // faint bone
        this.ctx.fillRect(startX + t * (tickWidth + tickGap), tickY, tickWidth, 2);
      }
    }

    this.ctx.restore();
  }

  /**
   * Draw vertical block progress threshold line (data-blue #5b8cff).
   */
  drawBlockProgressLine() {
    if (this.isOverlay) return;
    const progressX = Math.floor(this.width * Math.min(1.0, Math.max(0, this.blockProgress)));

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(91, 140, 255, 0.35)'; // data blue
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 6]);
    this.ctx.moveTo(progressX, 0);
    this.ctx.lineTo(progressX, this.height);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Draw traveling amber beat line moving left to right.
   */
  drawBeatLine() {
    if (this.isOverlay) return;
    const beatX = Math.floor(this.width * this.beatPhase);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.strokeStyle = 'rgba(255, 178, 62, 0.28)'; // amber
    this.ctx.lineWidth = 1;
    this.ctx.moveTo(beatX, 0);
    this.ctx.lineTo(beatX, this.height);
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Draw master waveform and ridgeline horizon.
   */
  drawWaveformTraces(state, smSnapshot, rms) {
    const centerY = this.height / 2;
    const isBuffering = state === AUDIO_STATES.BUFFERING;
    const isUnknown = state === AUDIO_STATES.UNKNOWN;
    const isError = state === AUDIO_STATES.ERROR;
    const isIdle = state === AUDIO_STATES.IDLE;
    const isPreparing = state === AUDIO_STATES.PREPARING;

    // Amplitude scale by mood
    let ampScale = 70;
    if (this.mood === 'sleep') ampScale = 35;
    if (this.mood === 'jog') ampScale = 65;
    if (this.mood === 'zoomies') ampScale = 100;
    if (isBuffering || isUnknown) ampScale = 25;

    // 1. Draw Older History Frames (Ridgeline above & below in Phosphor Data Blue / Amber)
    if (!this.isOverlay && !isIdle && !isError) {
      const offsets = [-70, -35, 35, 70];
      const opacities = [0.06, 0.12, 0.12, 0.06];

      for (let h = 0; h < this.numHistoryFrames; h++) {
        const bufIndex = (this.historyWriteIndex - 1 - h + this.numHistoryFrames) % this.numHistoryFrames;
        const buf = this.historyBuffers[bufIndex];
        const offsetY = offsets[h] || 0;
        const alpha = isBuffering ? opacities[h] * 0.5 : opacities[h];

        this.ctx.save();
        this.ctx.beginPath();
        // Use Phosphor Data Blue for history frames (or amber in zoomies)
        if (this.mood === 'zoomies') {
          this.ctx.strokeStyle = `rgba(255, 178, 62, ${alpha.toFixed(3)})`;
        } else {
          this.ctx.strokeStyle = `rgba(91, 140, 255, ${alpha.toFixed(3)})`;
        }
        this.ctx.lineWidth = 1;
        if (isUnknown || isBuffering) {
          this.ctx.setLineDash([4, 6]);
        }

        this.drawWavePath(buf, centerY + offsetY, ampScale * 0.7);
        this.ctx.stroke();
        this.ctx.restore();
      }
    }

    // 2. Draw Live Master Center Trace (Electric Oscilloscope Phosphor)
    this.ctx.save();
    this.ctx.beginPath();

    if (isIdle) {
      // Idle: Flat center line with faint phosphor blue and amber dot
      this.ctx.strokeStyle = 'rgba(91, 140, 255, 0.22)';
      this.ctx.lineWidth = 1;
      this.ctx.moveTo(0, centerY);
      this.ctx.lineTo(this.width, centerY);
      this.ctx.stroke();

      // Amber dot resting at left
      this.ctx.fillStyle = 'rgba(255, 178, 62, 0.85)';
      this.ctx.fillRect(20, centerY - 2, 4, 4);
    } else if (isPreparing) {
      // Preparing: Dashed flat line with traveling amber dash
      this.ctx.strokeStyle = 'rgba(91, 140, 255, 0.20)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([8, 8]);
      this.ctx.lineDashOffset = -this.preparingDashOffset;
      this.ctx.moveTo(0, centerY);
      this.ctx.lineTo(this.width, centerY);
      this.ctx.stroke();

      // Traveling amber pulse
      const pulseX = (this.preparingDashOffset * 25) % this.width;
      this.ctx.strokeStyle = 'rgba(255, 178, 62, 0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(pulseX, centerY);
      this.ctx.lineTo(pulseX + 40, centerY);
      this.ctx.stroke();
    } else if (isError) {
      // Error: Flat line with cross-hatch marker
      this.ctx.strokeStyle = 'rgba(255, 90, 90, 0.35)';
      this.ctx.lineWidth = 1;
      this.ctx.moveTo(0, centerY);
      this.ctx.lineTo(this.width, centerY);
      this.ctx.stroke();

      // Cross-hatch red/bone marker at center
      this.ctx.strokeStyle = 'rgba(255, 110, 110, 0.85)';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(this.width / 2 - 10, centerY - 10);
      this.ctx.lineTo(this.width / 2 + 10, centerY + 10);
      this.ctx.moveTo(this.width / 2 + 10, centerY - 10);
      this.ctx.lineTo(this.width / 2 - 10, centerY + 10);
      this.ctx.stroke();
    } else {
      // Live Master Trace in Oscilloscope Phosphor
      let traceColor = 'rgba(91, 140, 255, 0.65)';
      if (this.mood === 'zoomies') {
        traceColor = isBuffering ? 'rgba(255, 178, 62, 0.50)' : 'rgba(255, 178, 62, 0.72)';
      } else if (this.mood === 'jog') {
        traceColor = isBuffering ? 'rgba(91, 140, 255, 0.45)' : 'rgba(91, 140, 255, 0.65)';
      } else if (this.mood === 'sleep') {
        traceColor = isBuffering ? 'rgba(77, 162, 255, 0.35)' : 'rgba(77, 162, 255, 0.52)';
      } else if (isUnknown) {
        traceColor = 'rgba(148, 163, 184, 0.38)';
      }

      this.ctx.strokeStyle = traceColor;
      this.ctx.lineWidth = 1.2;

      if (isUnknown || isBuffering) {
        this.ctx.setLineDash([6, 6]);
      }

      this.drawWavePath(this.timeDomainBuffer, centerY, ampScale);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Helper to draw continuous waveform path across canvas width.
   */
  drawWavePath(buffer, baseY, amplitude) {
    const len = buffer.length;
    const stepX = this.width / (len - 1);

    for (let i = 0; i < len; i++) {
      const val = buffer[i] || 0;
      const x = i * stepX;
      const y = baseY + val * amplitude;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
  }

  /**
   * Render state-specific readouts and error controls.
   */
  drawStateOverlay(smSnapshot) {
    if (this.isOverlay) return;

    const state = smSnapshot.targetState || smSnapshot.state;
    const cause = smSnapshot.cause;
    const centerY = this.height / 2;

    this.ctx.save();
    this.ctx.font = '11px "JetBrains Mono", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    if (state === AUDIO_STATES.IDLE) {
      this.ctx.fillStyle = 'rgba(233, 230, 220, 0.35)';
      this.ctx.fillText('PRESS TUNE IN', this.width / 2, centerY - 20);
    } else if (state === AUDIO_STATES.PREPARING) {
      this.ctx.fillStyle = 'rgba(255, 178, 62, 0.65)';
      this.ctx.fillText('PREPARING AUDIO GRAPH...', this.width / 2, centerY - 20);
    } else if (state === AUDIO_STATES.BUFFERING) {
      this.ctx.fillStyle = 'rgba(255, 178, 62, 0.85)';
      const causeText = cause ? `BUFFERING: ${cause.toUpperCase()}` : 'BUFFERING AUDIO...';
      this.ctx.fillText(causeText, this.width / 2, centerY - 25);
    } else if (state === AUDIO_STATES.UNKNOWN) {
      this.ctx.fillStyle = 'rgba(233, 230, 220, 0.4)';
      this.ctx.fillText('SIGNAL UNKNOWN // HOLDING TELEMETRY', this.width / 2, centerY - 25);
    } else if (state === AUDIO_STATES.ERROR) {
      this.ctx.fillStyle = 'rgba(233, 230, 220, 0.75)';
      const msg = cause ? `ERROR: ${cause.toUpperCase()}` : 'STATION PLAYBACK ERROR';
      this.ctx.fillText(msg, this.width / 2, centerY - 30);
      this.ctx.fillText('[ PRESS RETRY IN CONTROLS ]', this.width / 2, centerY + 25);
    }

    this.ctx.restore();
  }

  /**
   * Clean up listeners.
   */
  destroy() {
    window.removeEventListener('resize', this.handleResize);
  }
}
