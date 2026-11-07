/**
 * Squeektoshi Radio — Audio & Station State Machine
 *
 * Implements honest, signal-driven state coordination:
 * - States: 'idle', 'preparing', 'buffering', 'playing', 'unknown', 'error'
 * - Debounces 'buffering' state entry by 300ms to eliminate visual flicker
 * - Smooth 0.6s reversible transition interpolation
 * - Direct aria-live="polite" screen-reader announcements
 * - Clean event listener subscription for waveform renderer and sound cues
 */

export const AUDIO_STATES = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  BUFFERING: 'buffering',
  PLAYING: 'playing',
  UNKNOWN: 'unknown',
  ERROR: 'error',
};

export const TRANSITION_DURATION_S = 0.6;
export const BUFFERING_DEBOUNCE_MS = 300;

export class AudioStateMachine {
  /**
   * @param {object} [options]
   * @param {string} [options.initialState='idle']
   * @param {HTMLElement} [options.ariaLiveElement]
   * @param {Function} [options.onRetry]
   */
  constructor(options = {}) {
    this.currentState = options.initialState || AUDIO_STATES.IDLE;
    this.previousState = this.currentState;
    this.targetState = this.currentState;

    // Transition progress [0.0 = previousState, 1.0 = targetState]
    this.transitionProgress = 1.0;
    this.isTransitioning = false;

    // Buffering metadata and causes
    this.currentCause = null;
    this.targetCause = null;

    // Debounce timer for transient buffering signals
    this.bufferingTimer = null;
    this.pendingBufferingCause = null;

    // Callbacks and accessibility
    this.listeners = new Set();
    this.ariaLiveElement = options.ariaLiveElement || null;
    this.onRetry = options.onRetry || null;

    // Announce initial state if element exists
    if (this.ariaLiveElement) {
      this.announceState(this.currentState, null);
    }
  }

  /**
   * Set the live DOM element used for aria-live accessibility announcements.
   * @param {HTMLElement} element
   */
  setAriaLiveElement(element) {
    this.ariaLiveElement = element;
    if (this.ariaLiveElement) {
      this.announceState(this.currentState, this.currentCause);
    }
  }

  /**
   * Register a retry handler for error recovery.
   * @param {Function} retryFn
   */
  setRetryHandler(retryFn) {
    this.onRetry = retryFn;
  }

  /**
   * Request a state change.
   * Buffering requests are debounced by 300ms.
   * Transitions reverse smoothly if interrupted mid-flight.
   *
   * @param {string} requestedState - One of AUDIO_STATES
   * @param {string} [cause=null] - Honest cause text
   */
  setState(requestedState, cause = null) {
    if (!Object.values(AUDIO_STATES).includes(requestedState)) {
      throw new Error(`Invalid audio state requested: ${requestedState}`);
    }

    // Handle Buffering Debounce (must persist >= 300ms to show)
    if (requestedState === AUDIO_STATES.BUFFERING) {
      this.pendingBufferingCause = cause;
      if (this.targetState === AUDIO_STATES.BUFFERING) {
        // Already buffering or transitioning to buffering: update cause immediately
        this.targetCause = cause;
        this.currentCause = cause;
        this.notifyListeners();
        return;
      }

      if (!this.bufferingTimer) {
        this.bufferingTimer = setTimeout(() => {
          this.bufferingTimer = null;
          this.commitStateTransition(AUDIO_STATES.BUFFERING, this.pendingBufferingCause);
        }, BUFFERING_DEBOUNCE_MS);
      }
      return;
    }

    // Cancel pending buffering debounce if another state is requested
    if (this.bufferingTimer) {
      clearTimeout(this.bufferingTimer);
      this.bufferingTimer = null;
      this.pendingBufferingCause = null;
    }

    this.commitStateTransition(requestedState, cause);
  }

  /**
   * Internal transition commit with smooth reversal support.
   * @private
   */
  commitStateTransition(nextState, cause) {
    if (nextState === this.targetState && cause === this.targetCause) {
      return; // Already target
    }

    // Interrupted transition reversal logic:
    // If transitioning A -> B at progress p, and state reverts to A:
    // We reverse smoothly by keeping previousState = B, targetState = A,
    // and setting progress = 1.0 - p.
    if (this.isTransitioning && nextState === this.previousState) {
      const reversedProgress = Math.max(0, Math.min(1.0, 1.0 - this.transitionProgress));
      this.previousState = this.targetState;
      this.targetState = nextState;
      this.transitionProgress = reversedProgress;
    } else {
      // Starting a new forward transition
      this.previousState = this.currentState;
      this.targetState = nextState;
      this.transitionProgress = 0.0;
    }

    this.targetCause = cause;
    this.isTransitioning = true;

    this.announceState(this.targetState, this.targetCause);
    this.notifyListeners();
  }

  /**
   * Advance transition timer by deltaTime (in seconds).
   * Call once per frame inside the shared requestAnimationFrame loop.
   * @param {number} deltaSeconds
   */
  update(deltaSeconds) {
    if (!this.isTransitioning) return;

    if (TRANSITION_DURATION_S <= 0) {
      this.transitionProgress = 1.0;
    } else {
      this.transitionProgress += deltaSeconds / TRANSITION_DURATION_S;
    }

    if (this.transitionProgress >= 1.0) {
      this.transitionProgress = 1.0;
      this.currentState = this.targetState;
      this.currentCause = this.targetCause;
      this.isTransitioning = false;
      this.notifyListeners();
    }
  }

  /**
   * Trigger the user-facing Retry handler if state is ERROR.
   */
  retry() {
    if (this.currentState === AUDIO_STATES.ERROR || this.targetState === AUDIO_STATES.ERROR) {
      if (typeof this.onRetry === 'function') {
        this.onRetry();
      }
    }
  }

  /**
   * Get complete current state snapshot.
   * @returns {{ state: string, targetState: string, previousState: string, cause: string|null, progress: number, isTransitioning: boolean }}
   */
  getState() {
    return {
      state: this.currentState,
      targetState: this.targetState,
      previousState: this.previousState,
      cause: this.targetCause || this.currentCause,
      progress: this.transitionProgress,
      isTransitioning: this.isTransitioning,
    };
  }

  /**
   * Format screen-reader accessible description.
   * @private
   */
  announceState(state, cause) {
    if (!this.ariaLiveElement) return;

    let message = '';
    switch (state) {
      case AUDIO_STATES.IDLE:
        message = 'Station idle. Press Tune in to begin.';
        break;
      case AUDIO_STATES.PREPARING:
        message = 'Preparing station audio graph.';
        break;
      case AUDIO_STATES.BUFFERING:
        message = `Buffering: ${cause || 'Synchronizing station'}.`;
        break;
      case AUDIO_STATES.PLAYING:
        message = 'Station playing live.';
        break;
      case AUDIO_STATES.UNKNOWN:
        message = 'Signal unknown. Holding last telemetry.';
        break;
      case AUDIO_STATES.ERROR:
        message = `Station error: ${cause || 'Playback failed'}. Retry available.`;
        break;
    }

    this.ariaLiveElement.textContent = message;
  }

  /**
   * Subscribe to state change notifications.
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * @private
   */
  notifyListeners() {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('AudioStateMachine listener error:', err);
      }
    }
  }

  /**
   * Clean up timers and listeners.
   */
  destroy() {
    if (this.bufferingTimer) {
      clearTimeout(this.bufferingTimer);
      this.bufferingTimer = null;
    }
    this.listeners.clear();
  }
}
