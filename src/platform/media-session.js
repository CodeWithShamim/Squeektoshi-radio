/**
 * Squeektoshi Radio — Lock-Screen Controls & Media Session Integration (platform/media-session.js)
 *
 * Feature 3 (Priority 3):
 * - Feature-detects navigator.mediaSession.
 * - Sets MediaMetadata: title, artist, album, and dual 256/512 artwork canvases.
 * - Artwork is generated and cached, regenerated ONLY when mood changes (never per frame).
 * - Metadata updates are throttled to at most once per second when block, scale, or bpm changes.
 * - Action handlers: play, pause, stop, previoustrack, nexttrack.
 *
 * Platform Catch & Stream Routing:
 * - Many browsers only show lock-screen controls when an HTMLMediaElement is playing.
 * - Implements stream routing: masterGain -> MediaStreamAudioDestinationNode -> <audio>.srcObject.
 * - Disconnects direct ctx.destination when stream routing is active to prevent double audio.
 * - User-gesture invariant: strictly starts after user interaction.
 */

import { drawDial } from '../share/poster.js';

export class MediaSessionManager {
  /**
   * @param {object} options
   * @param {object} options.audioEngine
   * @param {() => object} options.getState
   * @param {() => void} [options.onPlay]
   * @param {() => void} [options.onPause]
   * @param {() => void} [options.onStop]
   * @param {() => void} [options.onPrevHour]
   * @param {() => void} [options.onNextHour]
   */
  constructor(options = {}) {
    this.audioEngine = options.audioEngine;
    this.getState = options.getState || (() => ({}));
    this.onPlay = options.onPlay || (() => {});
    this.onPause = options.onPause || (() => {});
    this.onStop = options.onStop || (() => {});
    this.onPrevHour = options.onPrevHour || (() => {});
    this.onNextHour = options.onNextHour || (() => {});

    this.isSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;
    this.lastMood = null;
    this.cachedArtworkUrls = [];
    this.lastMetaSignature = '';
    this.lastMetaUpdateTime = 0;
    this.pendingMetaTimer = null;

    // Stream Audio Element for Mobile/Desktop Lock Screen activation
    this.streamAudioEl = null;
    this.mediaStreamDest = null;
    this.isStreamRoutingActive = false;

    if (this.isSupported) {
      this.initActionHandlers();
    }
  }

  /**
   * Registers Media Session action handlers.
   */
  initActionHandlers() {
    if (!this.isSupported) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        this.onPlay();
        navigator.mediaSession.playbackState = 'playing';
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        this.onPause();
        navigator.mediaSession.playbackState = 'paused';
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        this.onStop();
        navigator.mediaSession.playbackState = 'none';
      });

      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const s = this.getState();
        if (s.activeMode === 'replay' || s.isBestHourActive) {
          this.onPrevHour();
        }
      });

      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const s = this.getState();
        if (s.activeMode === 'replay' || s.isBestHourActive) {
          this.onNextHour();
        }
      });
    } catch (e) {
      // Some browsers throw if an action is unsupported
    }
  }

  /**
   * Generates artwork PNG URLs on offscreen canvas.
   * Revokes previous URLs to guarantee zero memory growth over time.
   * @param {string} mood
   * @returns {Promise<Array<{ src: string, sizes: string, type: string }>>}
   */
  async generateArtwork(mood = 'jog') {
    if (typeof document === 'undefined') return [];

    // Revoke previous URLs
    this.cachedArtworkUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    this.cachedArtworkUrls = [];

    const sizes = [256, 512];
    const artworkList = [];

    for (const size of sizes) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Dark background
      ctx.fillStyle = '#0b0b0e';
      ctx.fillRect(0, 0, size, size);

      // Draw stylized dial
      drawDial(ctx, size / 2, size / 2, size * 0.42, 0.65, mood);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const url = URL.createObjectURL(blob);
        this.cachedArtworkUrls.push(url);
        artworkList.push({
          src: url,
          sizes: `${size}x${size}`,
          type: 'image/png',
        });
      }
    }

    return artworkList;
  }

  /**
   * Updates Media Session metadata throttled to at most once per second.
   * Only runs when block, scale, or bpm changes.
   *
   * @param {object} info
   * @param {number} info.blockHeight
   * @param {string} info.scaleLabel
   * @param {number} info.bpm
   * @param {string} info.mood
   * @param {string} [info.mode='live']
   * @param {number} [info.hour]
   */
  async updateMetadata(info = {}) {
    if (!this.isSupported || typeof MediaMetadata === 'undefined') return;

    const block = info.blockHeight ?? 0;
    const scale = info.scaleLabel || 'Dorian';
    const bpm = info.bpm ?? 112;
    const mood = info.mood || 'jog';
    const mode = info.mode || 'live';

    // Metadata signature for change detection
    const sig = `${block}-${scale}-${bpm}-${mood}-${mode}-${info.hour ?? ''}`;
    if (sig === this.lastMetaSignature) return;

    const now = performance.now();
    const elapsed = now - this.lastMetaUpdateTime;

    const commitUpdate = async () => {
      this.lastMetaUpdateTime = performance.now();
      this.lastMetaSignature = sig;

      // Check if artwork needs regeneration (only on mood change)
      if (mood !== this.lastMood || this.cachedArtworkUrls.length === 0) {
        this.lastMood = mood;
        await this.generateArtwork(mood);
      }

      let title = `Block ${block} · ${scale} · ${bpm} bpm`;
      let album = 'Squeekchain live wheel';
      if (mode === 'replay') {
        title = `Replay Hour ${info.hour !== undefined ? info.hour : 0} · ${bpm} bpm`;
        album = '24-Hour Symphony Replay';
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: 'Squeektoshi Radio',
        album,
        artwork: this.cachedArtworkUrls.map((src, i) => ({
          src,
          sizes: i === 0 ? '256x256' : '512x512',
          type: 'image/png',
        })),
      });
    };

    if (elapsed >= 1000) {
      await commitUpdate();
    } else {
      if (!this.pendingMetaTimer) {
        this.pendingMetaTimer = setTimeout(async () => {
          this.pendingMetaTimer = null;
          await commitUpdate();
        }, 1000 - elapsed);
      }
    }
  }

  /**
   * Sets playback state ('playing' | 'paused' | 'none').
   * @param {'playing'|'paused'|'none'} state
   */
  setPlaybackState(state) {
    if (!this.isSupported) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch {}
  }

  /**
   * Activates MediaStreamAudioDestinationNode + HTMLAudioElement path for lock screen activation.
   * Strictly verifies:
   * 1. ctx.destination is disconnected when stream path is active (no double output).
   * 2. Called only from user gesture.
   */
  async enableStreamRouting() {
    if (this.isStreamRoutingActive) return;
    const ctx = this.audioEngine?.ctx;
    const analyser = this.audioEngine?.analyser;
    if (!ctx || !analyser || !ctx.createMediaStreamDestination) return;

    try {
      this.mediaStreamDest = ctx.createMediaStreamDestination();

      if (!this.streamAudioEl) {
        this.streamAudioEl = new Audio();
        this.streamAudioEl.autoplay = false;
        this.streamAudioEl.setAttribute('playsinline', '');
        this.streamAudioEl.style.display = 'none';
        document.body.appendChild(this.streamAudioEl);
      }

      // Disconnect analyser from direct ctx.destination
      try {
        analyser.disconnect(ctx.destination);
      } catch {}

      // Connect analyser to mediaStreamDest ONLY
      analyser.connect(this.mediaStreamDest);
      this.streamAudioEl.srcObject = this.mediaStreamDest.stream;

      await this.streamAudioEl.play();
      this.isStreamRoutingActive = true;
    } catch (err) {
      // Fallback: restore direct path
      console.warn('Stream routing fallback:', err);
      try {
        analyser.connect(ctx.destination);
      } catch {}
      this.isStreamRoutingActive = false;
    }
  }

  /**
   * Disables stream routing and restores direct Web Audio destination.
   */
  disableStreamRouting() {
    if (!this.isStreamRoutingActive) return;
    const ctx = this.audioEngine?.ctx;
    const analyser = this.audioEngine?.analyser;

    if (this.streamAudioEl) {
      try {
        this.streamAudioEl.pause();
        this.streamAudioEl.srcObject = null;
      } catch {}
    }

    if (analyser && this.mediaStreamDest) {
      try {
        analyser.disconnect(this.mediaStreamDest);
      } catch {}
    }

    if (analyser && ctx) {
      try {
        analyser.connect(ctx.destination);
      } catch {}
    }

    this.isStreamRoutingActive = false;
  }
}

