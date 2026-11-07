/**
 * Squeektoshi Radio — Tab Title & Static Favicon Manager (platform/title.js)
 *
 * Feature 3 (Priority 3):
 * - Idle: "Squeektoshi Radio"
 * - Playing: "Squeektoshi Radio · 112 bpm · Block 2366"
 * - Unknown signal: "Squeektoshi Radio · signal unknown"
 * - Replay: "Replay · hour 14:00 · Squeektoshi Radio"
 *
 * Invariants:
 * - No emoji or special symbols (middle dot '·' is standard typography)
 * - Updates throttled to at most once per second and only when string changes
 * - Three static favicon variants drawn on offscreen canvas (idle, playing, unknown)
 *   swapped only on state change, never animated.
 */

export class TitleManager {
  constructor() {
    this.lastTitle = '';
    this.lastUpdate = 0;
    this.pendingTitle = null;
    this.throttleTimer = null;
    this.currentFaviconState = null; // 'idle' | 'playing' | 'unknown'
  }

  /**
   * Builds the formatted title string based on station state.
   * Pure string builder for unit testing.
   *
   * @param {object} state
   * @param {boolean} state.isTunedIn
   * @param {string} [state.mode='live']
   * @param {boolean} [state.isAvailable=true]
   * @param {number} [state.bpm]
   * @param {number} [state.blockHeight]
   * @param {string} [state.replayHourText]
   * @returns {string}
   */
  static buildTitle(state = {}) {
    const base = 'Squeektoshi Radio';

    if (!state.isTunedIn) {
      return base;
    }

    if (state.isAvailable === false || state.freshness === 'unavailable') {
      return `${base} · signal unknown`;
    }

    if (state.mode === 'replay' || state.isBestHour) {
      const hourStr = state.replayHourText || (state.replayHour !== undefined ? `hour ${state.replayHour}:00` : 'hour 0:00');
      return `Replay · ${hourStr} · ${base}`;
    }

    // Live playing
    const bpm = state.bpm ?? 48;
    const block = state.blockHeight !== undefined && state.blockHeight !== null ? `Block ${state.blockHeight}` : 'Block 0';
    return `${base} · ${bpm} bpm · ${block}`;
  }

  /**
   * Updates document.title throttled to at most once per second and only when changed.
   * @param {object} state
   */
  update(state) {
    if (typeof document === 'undefined') return;

    const newTitle = TitleManager.buildTitle(state);
    if (newTitle === this.lastTitle) return;

    const now = performance.now();
    const elapsed = now - this.lastUpdate;

    if (elapsed >= 1000) {
      this.lastUpdate = now;
      this.lastTitle = newTitle;
      document.title = newTitle;
    } else {
      this.pendingTitle = newTitle;
      if (!this.throttleTimer) {
        this.throttleTimer = setTimeout(() => {
          this.throttleTimer = null;
          if (this.pendingTitle && this.pendingTitle !== this.lastTitle) {
            this.lastUpdate = performance.now();
            this.lastTitle = this.pendingTitle;
            document.title = this.pendingTitle;
          }
        }, 1000 - elapsed);
      }
    }

    // Update static favicon variant if state changed
    this.updateFavicon(state);
  }

  /**
   * Swaps static SVG/canvas favicon among 3 variants: idle (amber ring), playing (solid amber + blue center), unknown (dashed amber).
   * Swapped strictly on state change, never animated.
   * @param {object} state
   */
  updateFavicon(state) {
    if (typeof document === 'undefined') return;

    let targetState = 'idle';
    if (state.isTunedIn) {
      if (state.isAvailable === false || state.freshness === 'unavailable') {
        targetState = 'unknown';
      } else {
        targetState = 'playing';
      }
    }

    if (targetState === this.currentFaviconState) return;
    this.currentFaviconState = targetState;

    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    if (targetState === 'playing') {
      // Playing: amber ring with solid center pip
      link.href =
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="%230b0b0e" stroke="%23ffb23e" stroke-width="8"/><circle cx="50" cy="50" r="20" fill="%235b8cff"/></svg>';
    } else if (targetState === 'unknown') {
      // Unknown: dashed amber ring
      link.href =
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="%230b0b0e" stroke="%23ffb23e" stroke-width="8" stroke-dasharray="16 12"/></svg>';
    } else {
      // Idle: hairline amber ring
      link.href =
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="%230b0b0e" stroke="%23ffb23e" stroke-width="8"/></svg>';
    }
  }
}

