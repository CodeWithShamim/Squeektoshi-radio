/**
 * Squeektoshi Radio - Visualizers
 *
 * 1. Hamster Wheel (WHEELY9000):
 *    Spins smoothly at the physical hamster's real RPM (or stops smoothly when asleep).
 *    Supports reduced motion preference.
 *
 * 2. Harmonic Oscilloscope:
 *    Renders real-time Web Audio time-domain and frequency data from AnalyserNode.
 */

import { audioEngine } from '../music/engine.js';

export class VisualizerManager {
  /**
   * @param {HTMLCanvasElement} wheelCanvas
   * @param {HTMLCanvasElement} scopeCanvas
   * @param {HTMLCanvasElement} [overlayWheelCanvas]
   */
  constructor(wheelCanvas, scopeCanvas, overlayWheelCanvas = null) {
    this.wheelCanvas = wheelCanvas;
    this.scopeCanvas = scopeCanvas;
    this.overlayWheelCanvas = overlayWheelCanvas;

    this.wheelCtx = wheelCanvas?.getContext('2d');
    this.scopeCtx = scopeCanvas?.getContext('2d');
    this.overlayWheelCtx = overlayWheelCanvas?.getContext('2d');

    // Animation state
    this.wheelAngle = 0;
    this.targetRpm = 0;
    this.currentRpm = 0;
    this.lastFrameTime = performance.now();
    this.animationId = null;

    // Reduced motion media query
    this.prefersReducedMotion = false;
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.prefersReducedMotion = mq.matches;
      mq.addEventListener('change', (e) => {
        this.prefersReducedMotion = e.matches;
      });
    }

    // Allocate analyzer arrays
    this.timeDomainBuffer = new Uint8Array(128);
    this.freqBuffer = new Uint8Array(128);
  }

  start() {
    if (this.animationId) return;
    this.lastFrameTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000); // delta in seconds
      this.lastFrameTime = now;

      this.update(dt);
      this.render();

      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Updates wheel physics and animation parameters.
   * @param {number} dt - Elapsed seconds
   */
  update(dt) {
    // Smooth deceleration / acceleration toward target RPM
    const smoothing = this.targetRpm > this.currentRpm ? 2.5 : 1.2;
    this.currentRpm += (this.targetRpm - this.currentRpm) * Math.min(1.0, dt * smoothing);

    if (this.prefersReducedMotion) {
      // Reduced motion: wheel does not rotate rapidly
      this.wheelAngle = 0;
    } else {
      // Angular velocity omega = (2 * pi * rpm) / 60 radians per second
      const omega = (2 * Math.PI * Math.max(0, this.currentRpm)) / 60;
      this.wheelAngle = (this.wheelAngle + omega * dt) % (2 * Math.PI);
    }
  }

  /**
   * Sets target RPM from live status telemetry.
   * @param {number} rpm
   */
  setRpm(rpm) {
    this.targetRpm = Math.max(0, Number(rpm || 0));
  }

  /**
   * Main render method.
   */
  render() {
    if (this.wheelCtx) this.drawWheel(this.wheelCtx, this.wheelCanvas);
    if (this.overlayWheelCtx) this.drawWheel(this.overlayWheelCtx, this.overlayWheelCanvas);
    if (this.scopeCtx) this.drawOscilloscope(this.scopeCtx, this.scopeCanvas);
  }

  /**
   * Draws the WHEELY9000 Hamster Wheel.
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   */
  drawWheel(ctx, canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) * 0.85;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);

    // Wheel Stand (Static Base)
    ctx.strokeStyle = '#2e2e3d';
    ctx.lineWidth = Math.max(3, radius * 0.06);
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-radius * 0.7, radius * 1.05);
    ctx.lineTo(0, 0);
    ctx.lineTo(radius * 0.7, radius * 1.05);
    ctx.stroke();

    // Rotate spinning wheel assembly
    ctx.rotate(this.wheelAngle);

    // Outer Rim
    const isSpinning = this.currentRpm > 0.5;
    ctx.strokeStyle = isSpinning ? '#f2b84b' : '#5b8cff';
    ctx.lineWidth = Math.max(2, radius * 0.05);
    ctx.shadowColor = isSpinning ? 'rgba(242, 184, 75, 0.4)' : 'rgba(91, 140, 255, 0.3)';
    ctx.shadowBlur = isSpinning ? 12 : 6;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Inner Rim
    ctx.strokeStyle = '#3a3a4c';
    ctx.lineWidth = Math.max(1, radius * 0.02);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.94, 0, 2 * Math.PI);
    ctx.stroke();

    // Wheel Spokes (12 cross spokes)
    const spokeCount = 12;
    ctx.lineWidth = Math.max(1, radius * 0.02);
    ctx.strokeStyle = '#4e4e66';

    for (let i = 0; i < spokeCount; i++) {
      const angle = (i * 2 * Math.PI) / spokeCount;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      ctx.stroke();
    }

    // Magnet Sensor Dot on Wheel Rim
    const magnetAngle = 0;
    const magnetX = Math.cos(magnetAngle) * radius * 0.94;
    const magnetY = Math.sin(magnetAngle) * radius * 0.94;

    ctx.fillStyle = '#ff5b5b';
    ctx.shadowColor = 'rgba(255, 91, 91, 0.8)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(magnetX, magnetY, Math.max(3, radius * 0.04), 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Center Axle Hub
    ctx.fillStyle = '#f2b84b';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, radius * 0.09), 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draws the real-time audio oscilloscope and spectrum.
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} canvas
   */
  drawOscilloscope(ctx, canvas) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // If audio engine is not active, draw calm idle baseline
    if (!audioEngine.isPlaying || !audioEngine.analyser) {
      ctx.strokeStyle = '#2e2e3d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    // Fetch live audio data
    audioEngine.getTimeDomainData(this.timeDomainBuffer);
    audioEngine.getFrequencyData(this.freqBuffer);

    // 1. Frequency Spectrum Backdrop Bars (subtle glow)
    const barCount = 32;
    const barWidth = width / barCount;
    ctx.fillStyle = 'rgba(91, 140, 255, 0.12)';

    for (let i = 0; i < barCount; i++) {
      const val = this.freqBuffer[i * 2] || 0;
      const barHeight = (val / 255) * (height * 0.6);
      ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }

    // 2. Oscilloscope Waveform Line
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#f2b84b';
    ctx.shadowColor = 'rgba(242, 184, 75, 0.6)';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    const sliceWidth = width / (this.timeDomainBuffer.length - 1);
    let x = 0;

    for (let i = 0; i < this.timeDomainBuffer.length; i++) {
      const v = this.timeDomainBuffer[i] / 128.0; // 0..2
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

