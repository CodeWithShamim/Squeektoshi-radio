import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AudioStateMachine,
  AUDIO_STATES,
  TRANSITION_DURATION_S,
  BUFFERING_DEBOUNCE_MS,
} from '../src/ui/audio-state.js';

describe('AudioStateMachine — Unit Tests', () => {
  test('initializes with default IDLE state and progress 1.0', () => {
    const sm = new AudioStateMachine();
    const state = sm.getState();

    assert.equal(state.state, AUDIO_STATES.IDLE);
    assert.equal(state.targetState, AUDIO_STATES.IDLE);
    assert.equal(state.progress, 1.0);
    assert.equal(state.isTransitioning, false);
    assert.equal(state.cause, null);
    sm.destroy();
  });

  test('transitions from IDLE to PREPARING and completes over 0.6s', () => {
    const sm = new AudioStateMachine({ initialState: AUDIO_STATES.IDLE });

    sm.setState(AUDIO_STATES.PREPARING);
    let state = sm.getState();
    assert.equal(state.targetState, AUDIO_STATES.PREPARING);
    assert.equal(state.previousState, AUDIO_STATES.IDLE);
    assert.equal(state.isTransitioning, true);
    assert.equal(state.progress, 0.0);

    // Advance 0.3s (50% progress)
    sm.update(0.3);
    state = sm.getState();
    assert.equal(state.isTransitioning, true);
    assert.ok(Math.abs(state.progress - 0.5) < 0.01, `Progress should be 0.5, got ${state.progress}`);
    assert.equal(state.state, AUDIO_STATES.IDLE); // current state remains previous until complete

    // Advance remaining 0.3s (100% progress)
    sm.update(0.3);
    state = sm.getState();
    assert.equal(state.isTransitioning, false);
    assert.equal(state.progress, 1.0);
    assert.equal(state.state, AUDIO_STATES.PREPARING);
    assert.equal(state.targetState, AUDIO_STATES.PREPARING);
    sm.destroy();
  });

  test('reverses interrupted transition cleanly without jump', () => {
    const sm = new AudioStateMachine({ initialState: AUDIO_STATES.PLAYING });

    // Start transitioning to UNKNOWN
    sm.setState(AUDIO_STATES.UNKNOWN);
    sm.update(0.24); // 40% along the 0.6s transition (progress = 0.4)

    let state = sm.getState();
    assert.ok(Math.abs(state.progress - 0.4) < 0.01, `Progress should be ~0.4, got ${state.progress}`);
    assert.equal(state.targetState, AUDIO_STATES.UNKNOWN);
    assert.equal(state.previousState, AUDIO_STATES.PLAYING);

    // Suddenly revert back to PLAYING
    sm.setState(AUDIO_STATES.PLAYING);
    state = sm.getState();

    // Reversal should start at (1.0 - 0.4) = 0.6 progress towards PLAYING
    assert.equal(state.targetState, AUDIO_STATES.PLAYING);
    assert.equal(state.previousState, AUDIO_STATES.UNKNOWN);
    assert.ok(Math.abs(state.progress - 0.6) < 0.01, `Reversed progress should be ~0.6, got ${state.progress}`);

    // Advance another 0.24s (0.4 progress) -> should complete transition back to PLAYING
    sm.update(0.24);
    state = sm.getState();
    assert.equal(state.isTransitioning, false);
    assert.equal(state.state, AUDIO_STATES.PLAYING);
    assert.equal(state.progress, 1.0);
    sm.destroy();
  });

  test('debounces BUFFERING state: transient (<300ms) buffering signal is ignored', async () => {
    const sm = new AudioStateMachine({ initialState: AUDIO_STATES.PLAYING });

    // Transient buffering signal for 100ms
    sm.setState(AUDIO_STATES.BUFFERING, 'Audio is struggling');

    // State should still be PLAYING immediately
    let state = sm.getState();
    assert.equal(state.targetState, AUDIO_STATES.PLAYING);

    // 100ms later, signal clears back to PLAYING
    await new Promise((r) => setTimeout(r, 100));
    sm.setState(AUDIO_STATES.PLAYING);

    // Wait past the 300ms debounce threshold
    await new Promise((r) => setTimeout(r, 250));

    state = sm.getState();
    // Buffering was successfully debounced and never committed
    assert.equal(state.state, AUDIO_STATES.PLAYING);
    assert.equal(state.targetState, AUDIO_STATES.PLAYING);
    sm.destroy();
  });

  test('commits BUFFERING state when signal persists >= 300ms with honest cause text', async () => {
    const sm = new AudioStateMachine({ initialState: AUDIO_STATES.PLAYING });

    // Sustained buffering signal
    sm.setState(AUDIO_STATES.BUFFERING, 'Audio is struggling');

    // Wait 350ms (exceeding 300ms debounce)
    await new Promise((r) => setTimeout(r, 350));

    let state = sm.getState();
    assert.equal(state.targetState, AUDIO_STATES.BUFFERING);
    assert.equal(state.cause, 'Audio is struggling');
    assert.equal(state.isTransitioning, true);

    // Complete the 0.6s transition
    sm.update(0.6);
    state = sm.getState();
    assert.equal(state.state, AUDIO_STATES.BUFFERING);
    assert.equal(state.cause, 'Audio is struggling');
    assert.equal(state.isTransitioning, false);
    sm.destroy();
  });

  test('announces state changes to aria-live DOM element', () => {
    const mockAriaElement = { textContent: '' };
    const sm = new AudioStateMachine({
      initialState: AUDIO_STATES.IDLE,
      ariaLiveElement: mockAriaElement,
    });

    assert.equal(mockAriaElement.textContent, 'Station idle. Press Tune in to begin.');

    sm.setState(AUDIO_STATES.PLAYING);
    assert.equal(mockAriaElement.textContent, 'Station playing live.');

    sm.setState(AUDIO_STATES.UNKNOWN);
    assert.equal(mockAriaElement.textContent, 'Signal unknown. Holding last telemetry.');

    sm.setState(AUDIO_STATES.ERROR, 'API connection failed');
    assert.equal(mockAriaElement.textContent, 'Station error: API connection failed. Retry available.');
    sm.destroy();
  });

  test('triggers registered retry callback when in ERROR state', () => {
    let retried = false;
    const sm = new AudioStateMachine({
      initialState: AUDIO_STATES.ERROR,
      onRetry: () => {
        retried = true;
      },
    });

    sm.retry();
    assert.equal(retried, true);
    sm.destroy();
  });
});
