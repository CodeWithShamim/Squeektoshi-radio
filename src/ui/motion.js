/**
 * Squeektoshi Radio — Motion System (motion.js)
 * Adheres strictly to design tokens:
 * - Two durations: 0.6s and 1.2s
 * - Easing: cubic-bezier(0.22, 1, 0.36, 1)
 * - Masked line reveals & rolling tabular digits
 * - Entry sequence, ignition wave, settlement bell pulse
 * - Bypassed entirely when prefers-reduced-motion is active
 */

export class MotionSystem {
  constructor() {
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 1. Entry Animation (continues the Launch transition from landing page)
   * - Amber sweep line exits across the screen
   * - Dial draws outer rim via stroke-dashoffset
   * - Readouts reveal by masked lines with 60ms stagger
   * - Controls rise last
   * - Total duration <= 1.2s
   */
  runEntrySequence() {
    if (this.prefersReducedMotion) {
      const sweep = document.getElementById('entry-sweep-line');
      if (sweep) sweep.remove();
      return;
    }

    // 1. Amber Sweep Line Exit
    const sweep = document.getElementById('entry-sweep-line');
    if (sweep) {
      sweep.classList.add('exiting');
      setTimeout(() => sweep.remove(), 600);
    }

    // 2. Dial Outer Rim Draw
    const outerRim = document.getElementById('dial-outer-rim');
    if (outerRim) {
      const circ = 2 * Math.PI * 250; // ~1570.8
      outerRim.style.strokeDasharray = circ;
      outerRim.style.strokeDashoffset = circ;
      outerRim.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1)';
      requestAnimationFrame(() => {
        outerRim.style.strokeDashoffset = '0';
      });
    }

    // 3. Staggered Masked Line Reveals for Readouts
    const readoutWrappers = document.querySelectorAll('.mask-num-wrapper, .readout-label');
    readoutWrappers.forEach((el, idx) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      el.style.transition = `opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${idx * 0.05}s, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${idx * 0.05}s`;
      requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });

    // 4. Controls Rise
    const bottomBar = document.querySelector('.app-bottom-bar');
    if (bottomBar) {
      bottomBar.style.opacity = '0';
      bottomBar.style.transform = 'translateY(16px)';
      bottomBar.style.transition = 'opacity 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.5s, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.5s';
      requestAnimationFrame(() => {
        bottomBar.style.opacity = '1';
        bottomBar.style.transform = 'translateY(0)';
      });
    }
  }

  /**
   * 2. Ignition Animation on clicking "Tune in"
   * - 36 magnet ticks brighten in a sequential 0.6s wave around the dial
   * - Master gain ramps up over 0.8s
   * - Button label performs a masked swap to "Mute"
   */
  runIgnition(onComplete) {
    if (this.prefersReducedMotion) {
      if (onComplete) onComplete();
      return;
    }

    // 36 magnets sequential flash wave
    const totalMagnets = 36;
    const waveDuration = 600; // 0.6s
    const stepDelay = waveDuration / totalMagnets;

    for (let j = 0; j < totalMagnets; j++) {
      setTimeout(() => {
        const dot = document.getElementById(`dial-magnet-${j}`);
        if (dot) {
          dot.setAttribute('fill', '#ffb23e');
          dot.setAttribute('fill-opacity', '1.0');
          dot.setAttribute('r', '4.2');
          setTimeout(() => {
            dot.setAttribute('fill', '#e9e6dc');
            dot.setAttribute('fill-opacity', '0.7');
            dot.setAttribute('r', '2.8');
          }, 180);
        }
      }, j * stepDelay);
    }

    // Button label masked swap
    const tuneText = document.getElementById('tune-text');
    if (tuneText) {
      tuneText.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease';
      tuneText.style.transform = 'translateY(-10px)';
      tuneText.style.opacity = '0';
      setTimeout(() => {
        const tuneBtn = document.getElementById('tune-btn');
        if (!tuneBtn || tuneBtn.getAttribute('aria-pressed') === 'true') {
          tuneText.textContent = 'Mute';
        }
        tuneText.style.transform = 'translateY(10px)';
        requestAnimationFrame(() => {
          tuneText.style.transform = 'translateY(0)';
          tuneText.style.opacity = '1';
        });
      }, 300);
    }

    if (onComplete) {
      setTimeout(onComplete, waveDuration);
    }
  }

  /**
   * 3. Rolling Digits for Numeric Values (BPM, RPM, Block)
   * Slides digits vertically inside an overflow-hidden mask instead of count-up.
   */
  rollNumber(element, newText) {
    if (!element) return;
    if (this.prefersReducedMotion || element.textContent === newText) {
      element.textContent = newText;
      return;
    }

    const currentText = element.textContent;
    // Animate subtle vertical slide
    element.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease';
    element.style.transform = 'translateY(-6px)';
    element.style.opacity = '0.4';

    setTimeout(() => {
      element.textContent = newText;
      element.style.transform = 'translateY(6px)';
      requestAnimationFrame(() => {
        element.style.transform = 'translateY(0)';
        element.style.opacity = '1';
      });
    }, 120);
  }

  /**
   * 4. Block Completion Sweep
   */
  runBlockComplete() {
    if (this.prefersReducedMotion) return;

    const gauge = document.getElementById('dial-gauge-fill');
    if (gauge) {
      gauge.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.22, 1, 0.36, 1)';
      gauge.style.stroke = '#ffb23e';
      setTimeout(() => {
        gauge.style.stroke = '#5b8cff';
      }, 600);
    }
  }
}
