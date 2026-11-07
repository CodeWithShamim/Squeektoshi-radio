/**
 * Squeektoshi Radio — Share Flow Coordinator (share/share.js)
 *
 * Implements:
 * - Live preview scaling & format switcher (Landscape, Square, Portrait)
 * - Address privacy selector (Hide, Short, Full)
 * - Safe Download PNG via canvas.toBlob & URL revocation
 * - Web Share API with file support & fallback to download
 * - Copy link (omits address unless explicitly opted in)
 * - State restoration from URL on initial load
 */

import { renderBandPoster, POSTER_FORMATS } from './poster.js';

export class ShareCoordinator {
  /**
   * @param {object} options
   * @param {() => object} options.getState
   * @param {() => Uint8Array|number[]} options.getWaveformSample
   */
  constructor(options = {}) {
    this.getState = options.getState || (() => ({}));
    this.getWaveformSample = options.getWaveformSample || (() => new Uint8Array(128));

    this.currentFormat = 'landscape';
    this.currentPrivacy = 'hide'; // 'hide' | 'short' | 'full'
    this.isOpen = false;
    this.cachedWaveform = null;

    // DOM Elements
    if (typeof document !== 'undefined') {
      this.modal = document.getElementById('share-modal');
      this.closeBtn = document.getElementById('share-modal-close');
      this.backdrop = document.getElementById('share-modal-backdrop');
      this.canvas = document.getElementById('poster-canvas');
      this.formatControl = document.getElementById('poster-format-control');
      this.privacyControl = document.getElementById('poster-privacy-control');
      this.downloadBtn = document.getElementById('btn-download-png');
      this.shareBtn = document.getElementById('btn-web-share');
      this.copyLinkBtn = document.getElementById('btn-copy-share-link');
      this.feedbackEl = document.getElementById('share-modal-feedback');
      this.announcer = document.getElementById('share-status-announcer');
    }

    this.init();
  }

  init() {
    if (typeof document === 'undefined') return;
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.backdrop) {
      this.backdrop.addEventListener('click', () => this.close());
    }

    // Format segmented buttons
    if (this.formatControl) {
      const buttons = this.formatControl.querySelectorAll('.segment-btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-checked', 'true');
          this.currentFormat = btn.dataset.format || 'landscape';
          this.renderPreview();
        });
      });
    }

    // Privacy segmented buttons
    if (this.privacyControl) {
      const buttons = this.privacyControl.querySelectorAll('.segment-btn');
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
          });
          btn.classList.add('active');
          btn.setAttribute('aria-checked', 'true');
          this.currentPrivacy = btn.dataset.privacy || 'hide';
          this.renderPreview();
        });
      });
    }

    // Download PNG
    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => this.downloadPNG());
    }

    // Web Share API
    if (this.shareBtn) {
      this.shareBtn.addEventListener('click', () => this.sharePoster());
    }

    // Copy Link
    if (this.copyLinkBtn) {
      this.copyLinkBtn.addEventListener('click', () => this.copyShareLink());
    }
  }

  /**
   * Opens the share modal and captures current waveform frame.
   */
  open() {
    if (!this.modal) return;
    this.isOpen = true;
    this.modal.classList.add('open');
    this.modal.setAttribute('aria-hidden', 'false');

    // Freeze recent waveform output at moment of opening Share
    this.cachedWaveform = this.getWaveformSample();

    this.renderPreview();
  }

  /**
   * Closes the share modal.
   */
  close() {
    if (!this.modal) return;
    this.isOpen = false;
    this.modal.classList.remove('open');
    this.modal.setAttribute('aria-hidden', 'true');
  }

  /**
   * Builds the current poster options payload from live state.
   * @param {Date|string} [fixedTimestamp]
   * @returns {object}
   */
  getPosterOptions(fixedTimestamp = null) {
    const s = this.getState();
    return {
      format: this.currentFormat,
      status: s.status,
      bpm: s.status ? s.bpm : null,
      keyInfo: s.keyInfo,
      palette: s.activePalette || 'analog',
      tokens: s.bandTokens || [],
      waveformSample: this.cachedWaveform || this.getWaveformSample(),
      privacy: this.currentPrivacy,
      walletAddress: s.walletAddress || '',
      siteUrl: s.siteUrl || window.location.host || 'squeektoshi.radio',
      fixedTimestamp: fixedTimestamp || undefined,
      isBestHour: Boolean(s.isBestHourActive),
      bestHourInfo: s.bestHourInfo || null,
    };
  }

  /**
   * Renders the live poster preview to the canvas.
   */
  async renderPreview() {
    if (!this.canvas) return;
    const opts = this.getPosterOptions();
    await renderBandPoster(this.canvas, opts);

    if (this.announcer) {
      const formatName = POSTER_FORMATS[this.currentFormat]?.name || this.currentFormat;
      this.announcer.textContent = `Poster preview updated: ${formatName}, privacy ${this.currentPrivacy}.`;
    }
  }

  /**
   * Generates a Blob from the poster canvas safely.
   * @returns {Promise<Blob>}
   */
  async getPosterBlob() {
    if (!this.canvas) return null;
    // Always re-render cleanly at target resolution before export
    await renderBandPoster(this.canvas, this.getPosterOptions());

    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }

  /**
   * Downloads the generated poster PNG.
   */
  async downloadPNG() {
    const blob = await this.getPosterBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `squeektoshi-${this.currentFormat}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Promptly revoke object URL to prevent memory leaks
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    this.showFeedback('Poster downloaded successfully.');
  }

  /**
   * Shares the poster file using Web Share API when supported, otherwise falls back to download.
   */
  async sharePoster() {
    const blob = await this.getPosterBlob();
    if (!blob) return;

    const fileName = `squeektoshi-${this.currentFormat}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: 'Squeektoshi Radio',
          text: 'Hamster-powered generative proof-of-work music station',
          files: [file],
        });
        this.showFeedback('Poster shared successfully.');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback if Web Share API with files is unsupported
    await this.downloadPNG();
  }

  /**
   * Pure static helper to construct shareable URL.
   * @param {object} s - state
   * @param {string} privacy - 'hide' | 'short' | 'full'
   * @param {string} [baseUrl]
   * @returns {string}
   */
  static buildShareUrl(s = {}, privacy = 'hide', baseUrl = 'http://localhost:3000/app.html') {
    const rawUrl = typeof window !== 'undefined' && window.location ? window.location.href : baseUrl;
    const url = new URL(rawUrl);

    // Set core state
    url.searchParams.set('palette', s.activePalette || 'analog');
    url.searchParams.set('mode', s.isBestHourActive ? 'replay' : (s.activeMode || 'live'));

    if (s.isBestHourActive && s.bestHourInfo?.hourIndex !== undefined) {
      url.searchParams.set('hour', String(s.bestHourInfo.hourIndex));
      url.searchParams.set('besthour', '1');
    } else {
      url.searchParams.delete('hour');
      url.searchParams.delete('besthour');
    }

    // Privacy rule: Only include wallet if opted in
    if (privacy !== 'hide' && s.walletAddress) {
      url.searchParams.set('wallet', s.walletAddress);
    } else {
      url.searchParams.delete('wallet');
    }

    return url.toString();
  }

  /**
   * Builds the shareable station state URL.
   * STRICT PRIVACY INVARIANT: wallet address is omitted unless privacy is 'short' or 'full'.
   * @returns {string}
   */
  buildShareUrl() {
    return ShareCoordinator.buildShareUrl(this.getState(), this.currentPrivacy);
  }

  /**
   * Copies the shareable state URL to the clipboard.
   */
  async copyShareLink() {
    const shareUrl = this.buildShareUrl();
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        this.showFeedback('Shareable station link copied to clipboard.');
        return;
      } catch {}
    }
    this.showFeedback('Link: ' + shareUrl);
  }

  showFeedback(msg) {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = msg;
    this.feedbackEl.style.display = 'block';
    setTimeout(() => {
      if (this.feedbackEl) this.feedbackEl.style.display = 'none';
    }, 2500);
  }
}
