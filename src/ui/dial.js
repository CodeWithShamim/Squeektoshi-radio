/**
 * Squeektoshi Radio — Central Instrument Dial (SVG + 2D Canvas)
 * Built with SVG vector linework and a lightweight 2D canvas layer for waveform.
 * - 16 hairline spokes
 * - 36 magnet ticks
 * - Fixed amber sensor gate at 12 o'clock with pass pulse
 * - Inner block progress gauge arc
 * - Outer 24-hour replay segmented ring
 * - Audio-reactive waveform radius-modulated around inner circle
 * - Mood visual language: sleep (breathing gauge), jog, zoomies (<= 3Hz), unknown (dashed)
 */

export class CentralDial {
  constructor(options = {}) {
    this.svg = document.getElementById('dial-svg');
    this.canvas = document.getElementById('dial-waveform-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    // Elements
    this.wheelGroup = document.getElementById('dial-rotating-wheel');
    this.spokesGroup = document.getElementById('dial-spokes');
    this.magnetsGroup = document.getElementById('dial-magnets');
    this.gaugeFill = document.getElementById('dial-gauge-fill');
    this.sensorPulse = document.getElementById('sensor-pulse-ring');
    this.hourRingGroup = document.getElementById('dial-hour-ring');
    this.chimePulse = document.getElementById('dial-chime-pulse');

    // State
    this.rotation = 0;
    this.currentSpeed = 0.2; // rad/s
    this.targetSpeed = 0.2;
    this.lastMagnetIndex = -1;
    this.mood = 'sleep';
    this.blockProgress = 0;
    this.activeHourIndex = -1;
    this.analyser = null;
    this.timeDomainBuffer = null;

    // Pulse animation
    this.pulseAge = 1.0;
    this.chimeAge = 1.0;

    // Performance governor
    this.frameTimes = [];
    this.lastFrame = performance.now();
    this.canvasScale = 1.0;

    // Callbacks
    this.onHourSelect = options.onHourSelect || null;
    this.onRenderFrame = options.onRenderFrame || null;

    this.initStructure();
    this.startLoop();
  }

  initStructure() {
    if (!this.svg) return;

    const rimRadius = 250;
    const center = 300;

    // 1. Generate 16 Hairline Spokes
    if (this.spokesGroup && this.spokesGroup.children.length === 0) {
      for (let i = 0; i < 16; i++) {
        const angle = (i * Math.PI * 2) / 16;
        const x2 = center + Math.cos(angle) * rimRadius;
        const y2 = center + Math.sin(angle) * rimRadius;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', center);
        line.setAttribute('y1', center);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#e9e6dc');
        line.setAttribute('stroke-opacity', '0.15');
        line.setAttribute('stroke-width', '0.8');
        this.spokesGroup.appendChild(line);
      }
    }

    // 2. Generate 36 Rim Magnets
    if (this.magnetsGroup && this.magnetsGroup.children.length === 0) {
      for (let j = 0; j < 36; j++) {
        const angle = (j * Math.PI * 2) / 36;
        const x = center + Math.cos(angle) * (rimRadius - 2);
        const y = center + Math.sin(angle) * (rimRadius - 2);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '2.8');
        circle.setAttribute('fill', '#e9e6dc');
        circle.setAttribute('fill-opacity', '0.7');
        circle.setAttribute('id', `dial-magnet-${j}`);
        this.magnetsGroup.appendChild(circle);
      }
    }

    // 3. Generate 24 Replay Hour Segments (r=280)
    if (this.hourRingGroup && this.hourRingGroup.children.length === 0) {
      const hourRadius = 280;
      const step = (Math.PI * 2) / 24;
      const gap = 0.04; // gap between segments

      for (let h = 0; h < 24; h++) {
        const startAngle = h * step - Math.PI / 2 + gap / 2;
        const endAngle = (h + 1) * step - Math.PI / 2 - gap / 2;
        const x1 = center + Math.cos(startAngle) * hourRadius;
        const y1 = center + Math.sin(startAngle) * hourRadius;
        const x2 = center + Math.cos(endAngle) * hourRadius;
        const y2 = center + Math.sin(endAngle) * hourRadius;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} A ${hourRadius} ${hourRadius} 0 0 1 ${x2} ${y2}`);
        path.setAttribute('stroke', '#e9e6dc');
        path.setAttribute('stroke-opacity', '0.18');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-linecap', 'butt');
        path.setAttribute('id', `dial-hour-seg-${h}`);
        path.style.cursor = 'pointer';

        path.addEventListener('click', () => {
          if (this.onHourSelect) this.onHourSelect(h);
        });

        this.hourRingGroup.appendChild(path);
      }
    }
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
    if (this.analyser) {
      this.timeDomainBuffer = new Uint8Array(this.analyser.fftSize);
    }
  }

  setTelemetry(statusData) {
    if (!statusData) return;

    // RPM to speed mapping
    const rpm = statusData.rpm || 0;
    if (statusData.mood) this.mood = statusData.mood;

    if (this.mood === 'sleep') {
      this.targetSpeed = 0.08;
    } else if (this.mood === 'unknown') {
      this.targetSpeed = 0.14;
    } else {
      // omega = (rpm * 2 * PI) / 60
      this.targetSpeed = Math.max(0.2, (rpm * Math.PI * 2) / 60);
    }

    // Block progress (0..1)
    if (statusData.blockProgressRatio !== undefined) {
      this.setBlockProgress(statusData.blockProgressRatio);
    }

    // Apply mood visual styling to dial
    this.applyMoodStyling(this.mood);
  }

  setBlockProgress(ratio) {
    this.blockProgress = Math.min(1.0, Math.max(0, ratio));
    if (this.gaugeFill) {
      const circumference = 2 * Math.PI * 243; // ~1526.8
      const offset = circumference * (1.0 - this.blockProgress);
      this.gaugeFill.style.strokeDashoffset = offset.toFixed(1);
    }
  }

  setActiveHour(hourIndex) {
    this.activeHourIndex = hourIndex;
    if (!this.hourRingGroup) return;

    for (let h = 0; h < 24; h++) {
      const seg = document.getElementById(`dial-hour-seg-${h}`);
      if (!seg) continue;
      if (h === hourIndex) {
        seg.setAttribute('stroke', '#e9e6dc');
        seg.setAttribute('stroke-opacity', '1.0');
        seg.setAttribute('stroke-width', '4');
      } else if (h < hourIndex) {
        seg.setAttribute('stroke', '#ffb23e');
        seg.setAttribute('stroke-opacity', '0.6');
        seg.setAttribute('stroke-width', '2.5');
      } else {
        seg.setAttribute('stroke', '#e9e6dc');
        seg.setAttribute('stroke-opacity', '0.18');
        seg.setAttribute('stroke-width', '2.5');
      }
    }
  }

  applyMoodStyling(mood) {
    if (!this.svg) return;

    if (mood === 'sleep') {
      this.svg.classList.add('dial-mood-sleep');
      this.svg.classList.remove('dial-mood-zoomies', 'dial-mood-unknown');
    } else if (mood === 'zoomies') {
      this.svg.classList.add('dial-mood-zoomies');
      this.svg.classList.remove('dial-mood-sleep', 'dial-mood-unknown');
    } else if (mood === 'unknown') {
      this.svg.classList.add('dial-mood-unknown');
      this.svg.classList.remove('dial-mood-sleep', 'dial-mood-zoomies');
    } else {
      this.svg.classList.remove('dial-mood-sleep', 'dial-mood-zoomies', 'dial-mood-unknown');
    }
  }

  triggerChimePulse() {
    this.chimeAge = 0.0;
  }

  triggerMagnetPass() {
    this.pulseAge = 0.0;
  }

  update(delta, now) {
    // 1. Interpolate rotation speed
    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * Math.min(1, delta * 3);
    this.rotation += this.currentSpeed * delta;

    if (this.wheelGroup) {
      const deg = (this.rotation * 180) / Math.PI;
      this.wheelGroup.setAttribute('transform', `rotate(${deg.toFixed(2)} 300 300)`);
    }

    // 2. Check 36 magnet passages across 12 o'clock (-PI/2)
    const step = (Math.PI * 2) / 36;
    const normalizedAngle = (this.rotation % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const currentMagnet = Math.floor(normalizedAngle / step);

    if (currentMagnet !== this.lastMagnetIndex) {
      this.lastMagnetIndex = currentMagnet;
      this.triggerMagnetPass();
    }

    // 3. Sensor Gate Pulse Animation
    if (this.pulseAge < 1.0) {
      this.pulseAge += delta * 2.8; // ~0.35s duration
      if (this.sensorPulse) {
        const r = 4 + this.pulseAge * 14;
        const opacity = Math.max(0, 1.0 - this.pulseAge);
        this.sensorPulse.setAttribute('r', r.toFixed(1));
        this.sensorPulse.setAttribute('opacity', opacity.toFixed(2));
      }
    } else if (this.sensorPulse) {
      this.sensorPulse.setAttribute('opacity', '0');
    }

    // 4. Settlement Bell Center Chime Pulse Animation
    if (this.chimeAge < 1.0) {
      this.chimeAge += delta * 1.6; // ~0.6s expanding wave
      if (this.chimePulse) {
        const r = 10 + this.chimeAge * 160;
        const opacity = Math.max(0, 0.9 - this.chimeAge);
        this.chimePulse.setAttribute('r', r.toFixed(1));
        this.chimePulse.setAttribute('opacity', opacity.toFixed(2));
      }
    } else if (this.chimePulse) {
      this.chimePulse.setAttribute('opacity', '0');
    }

    // 5. Sleep Mood Breathing Gauge (scale 1.0 -> 1.01 over 6s)
    if (this.mood === 'sleep' && this.gaugeFill) {
      const breath = 1.0 + Math.sin(now * 0.001) * 0.008;
      this.gaugeFill.style.transform = `rotate(-90deg) scale(${breath.toFixed(4)})`;
      this.gaugeFill.style.transformOrigin = '300px 300px';
    } else if (this.gaugeFill) {
      this.gaugeFill.style.transform = 'rotate(-90deg) scale(1)';
    }

    // 6. Audio-Reactive Waveform on 2D Canvas
    this.renderWaveform();
  }

  renderWaveform() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, 600, 600);

    const baseRadius = 160;
    const center = 300;

    if (!this.analyser || !this.timeDomainBuffer) {
      // Draw quiet phosphor hairline circle when audio is inactive
      this.ctx.beginPath();
      this.ctx.arc(center, center, baseRadius, 0, Math.PI * 2);
      this.ctx.strokeStyle = 'rgba(91, 140, 255, 0.20)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      return;
    }

    this.analyser.getByteTimeDomainData(this.timeDomainBuffer);

    this.ctx.beginPath();
    const count = this.timeDomainBuffer.length;
    const stride = this.canvasScale < 1.0 ? 2 : 1;
    const step = (Math.PI * 2) / (count / stride);

    for (let i = 0; i < count; i += stride) {
      const angle = (i / stride) * step;
      // Byte values range 0 to 255 (128 is center/silence)
      const amplitude = (this.timeDomainBuffer[i] - 128) / 128.0;
      const modRadius = baseRadius + amplitude * 24;

      const x = center + Math.cos(angle) * modRadius;
      const y = center + Math.sin(angle) * modRadius;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.closePath();
    this.ctx.strokeStyle = this.mood === 'zoomies' ? 'rgba(255, 178, 62, 0.85)' : 'rgba(91, 140, 255, 0.75)';
    this.ctx.lineWidth = 1.6;
    this.ctx.stroke();
  }

  startLoop() {
    const loop = (now) => {
      if (document.hidden) {
        requestAnimationFrame(loop);
        return;
      }

      const delta = Math.min((now - this.lastFrame) / 1000, 0.1);
      this.lastFrame = now;

      // Governor: track frame duration
      this.frameTimes.push(delta * 1000);
      if (this.frameTimes.length > 60) {
        this.frameTimes.shift();
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        if (avg > 20 && this.canvasScale > 0.6) {
          this.canvasScale = 0.5;
          // Reduce tick count by hiding alternate ticks
          for (let j = 1; j < 36; j += 2) {
            const dot = document.getElementById(`dial-magnet-${j}`);
            if (dot) dot.style.display = 'none';
          }
        } else if (avg < 16 && this.canvasScale < 1.0) {
          this.canvasScale = 1.0;
          for (let j = 1; j < 36; j += 2) {
            const dot = document.getElementById(`dial-magnet-${j}`);
            if (dot) dot.style.display = '';
          }
        }
      }

      this.update(delta, now);
      if (typeof this.onRenderFrame === 'function') {
        this.onRenderFrame(delta, now);
      }
      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }
}

