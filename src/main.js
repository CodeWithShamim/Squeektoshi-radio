/**
 * Squeektoshi Radio - Main Application Entry
 */

import {
  apiFetch,
  parseStatus,
  parseSettlements,
  parseEconomy,
  getDemoStatus,
} from './api.js';
import {
  calculateBpm,
  calculateKey,
  resolveMood,
} from './music/mapping.js';
import { audioEngine } from './music/engine.js';
import { VisualizerManager } from './ui/visualizer.js';
import { ReplayPlayer, composeDayPlan } from './music/replay.js';
import { buildBandVoices } from './music/band.js';
import { createSqueekCard } from './ui/cards.js';
import { fetchAllAccountTokens, fetchSqueekMetadata, getDemoBandTokens } from './api.js';

let visualizer = null;
let replayPlayer = null;

// Application State
export const state = {
  isTunedIn: false,
  isMuted: false,
  volume: 0.75,
  isDemo: false,
  isOverlay: false,
  isChroma: false,

  // Telemetry & Music state
  status: null,
  settlements: null,
  economy: null,
  lastGoodStatus: null,
  lastSettlementCount: null,

  // Timing
  demoStartTime: Date.now(),
  pollTimer: null,
};

// DOM Elements
const elements = {
  tuneBtn: document.getElementById('tune-btn'),
  tuneText: document.getElementById('tune-text'),
  muteBtn: document.getElementById('mute-btn'),
  volumeSlider: document.getElementById('volume-slider'),

  signalBadge: document.getElementById('signal-badge'),
  signalDot: document.getElementById('signal-dot'),
  signalText: document.getElementById('signal-text'),
  demoBadge: document.getElementById('demo-badge'),
  statusBanner: document.getElementById('status-banner'),
  bannerDismiss: document.getElementById('banner-dismiss'),

  badgeMood: document.getElementById('badge-mood'),
  valRpm: document.getElementById('val-rpm'),
  valBpm: document.getElementById('val-bpm'),
  valKey: document.getElementById('val-key'),
  valBlockHeight: document.getElementById('val-block-height'),
  valSqkMinted: document.getElementById('val-sqk-minted'),
  valProgressPct: document.getElementById('val-progress-pct'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  progressTrack: document.getElementById('progress-track'),

  overlayContainer: document.getElementById('overlay-container'),
  overlayMood: document.getElementById('overlay-mood'),
  overlayBpm: document.getElementById('overlay-bpm'),
  overlayBlock: document.getElementById('overlay-block'),
  overlayProgress: document.getElementById('overlay-progress'),
};

/**
 * Update UI telemetry widgets with current data.
 */
export function updateUI(statusData) {
  if (!statusData) return;

  const mood = resolveMood(statusData);
  const bpm = calculateBpm(statusData.rpm);
  const { rootName } = calculateKey(statusData.blockHeight);

  let scaleLabel = 'Minor Pentatonic';
  if (mood === 'jog') scaleLabel = 'Dorian';
  if (mood === 'zoomies') scaleLabel = 'Mixolydian';
  const keyName = `${rootName} ${scaleLabel}`;

  const progressPct = Math.min(100, Math.max(0, Math.round((statusData.blockProgressRatio || 0) * 100)));

  // Telemetry widgets
  if (elements.badgeMood) {
    elements.badgeMood.className = `mood-badge ${mood}`;
    elements.badgeMood.textContent = mood.toUpperCase();
  }

  if (elements.valRpm) {
    elements.valRpm.textContent = `${(statusData.rpm || 0).toFixed(1)} RPM`;
  }

  if (elements.valBpm) {
    elements.valBpm.textContent = `${bpm} BPM`;
  }

  if (elements.valKey) {
    elements.valKey.textContent = keyName;
  }

  if (elements.valBlockHeight) {
    elements.valBlockHeight.textContent = `#${statusData.blockHeight ?? 0}`;
  }

  if (elements.valProgressPct) {
    elements.valProgressPct.textContent = `${progressPct}%`;
  }

  if (elements.progressBarFill) {
    elements.progressBarFill.style.width = `${progressPct}%`;
  }
  if (elements.progressTrack) {
    elements.progressTrack.setAttribute('aria-valuenow', String(progressPct));
  }

  // Signal badge & banner
  if (elements.signalDot && elements.signalText) {
    if (!statusData.isAvailable || statusData.freshness === 'stale' || statusData.freshness === 'unavailable') {
      elements.signalDot.className = 'freshness-dot stale';
      elements.signalText.textContent = statusData.freshness === 'stale' ? 'Stale' : 'Signal Lost';
      if (elements.statusBanner) elements.statusBanner.classList.add('visible');
    } else if (state.isDemo) {
      elements.signalDot.className = 'freshness-dot';
      elements.signalText.textContent = 'Simulated';
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    } else if (statusData.isAvailable && statusData.isOnline) {
      elements.signalDot.className = 'freshness-dot';
      elements.signalText.textContent = 'Live · 12-conf safe';
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    }
  }

  // Stream Overlay sync
  if (elements.overlayMood) elements.overlayMood.textContent = mood.toUpperCase();
  if (elements.overlayBpm) elements.overlayBpm.textContent = `${bpm} BPM`;
  if (elements.overlayBlock) elements.overlayBlock.textContent = `#${statusData.blockHeight ?? 0}`;
  if (elements.overlayProgress) elements.overlayProgress.textContent = `${progressPct}%`;

  // Feed to audio engine
  audioEngine.updateTelemetry(statusData);

  // Feed to visualizer
  if (visualizer) {
    visualizer.setRpm(statusData.rpm);
  }
}

/**
 * Update economy widgets with SQK minted.
 */
export function updateEconomyUI(economyData) {
  if (!economyData || !elements.valSqkMinted) return;
  if (economyData.totalMintedSQK !== undefined) {
    const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(economyData.totalMintedSQK);
    elements.valSqkMinted.textContent = `${formatted} SQK`;
  }
}

/**
 * Polls status from API or generator.
 */
async function pollStatus() {
  try {
    if (state.isDemo) {
      const elapsed = Date.now() - state.demoStartTime;
      const demoData = getDemoStatus(elapsed);
      state.status = demoData;
      state.lastGoodStatus = demoData;
      updateUI(demoData);
      return;
    }

    const raw = await apiFetch('/v1/status');
    const parsed = parseStatus(raw);

    if (parsed.isAvailable) {
      state.status = parsed;
      state.lastGoodStatus = parsed;
      updateUI(parsed);
    } else {
      // Unavailable HTTP 200: keep last good values, mark unknown
      if (state.lastGoodStatus) {
        updateUI({
          ...state.lastGoodStatus,
          isAvailable: false,
          freshness: 'unavailable',
        });
      } else {
        updateUI(parsed);
      }
    }
  } catch (err) {
    console.warn('Status poll failed:', err.message);
    if (state.lastGoodStatus) {
      updateUI({
        ...state.lastGoodStatus,
        isAvailable: false,
        freshness: 'stale',
      });
    }
  }
}

/**
 * Polls economy from API.
 */
async function pollEconomy() {
  if (state.isDemo) {
    updateEconomyUI({ totalMintedSQK: 4189010 });
    return;
  }
  try {
    const raw = await apiFetch('/v1/economy/state');
    const parsed = parseEconomy(raw);
    if (parsed.status === 'available') {
      state.economy = parsed;
      updateEconomyUI(parsed);
    }
  } catch (err) {
    console.warn('Economy poll failed:', err.message);
  }
}

/**
 * Polls settlements from API.
 */
async function pollSettlements() {
  if (state.isDemo) return;
  try {
    const raw = await apiFetch('/v1/settlements?range=24h');
    const parsed = parseSettlements(raw);
    if (parsed.status === 'available') {
      // Detect settlement count increase -> ring settlement chime!
      if (state.lastSettlementCount !== null && parsed.settlementCount > state.lastSettlementCount) {
        audioEngine.ringSettlementChime();
      }
      state.lastSettlementCount = parsed.settlementCount;
      state.settlements = parsed;
    }
  } catch (err) {
    console.warn('Settlements poll failed:', err.message);
  }
}

/**
 * Start recurring background polling, pausing when tab is hidden.
 */
function startPolling() {
  pollStatus();
  pollEconomy();
  pollSettlements();

  const statusInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      pollStatus();
    }
  }, 2000);

  const economyInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      pollEconomy();
    }
  }, 30000);

  const settlementsInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      pollSettlements();
    }
  }, 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pollStatus();
    }
  });

  state.pollTimer = { statusInterval, economyInterval, settlementsInterval };
}

/**
 * Renders the 24 hourly bucket timeline bars.
 */
export function renderTimeline(buckets) {
  const container = document.getElementById('timeline-buckets');
  if (!container) return;

  const plan = composeDayPlan(buckets);
  container.innerHTML = '';

  plan.forEach((item, idx) => {
    const bar = document.createElement('div');
    bar.className = `bucket-bar ${item.mood}`;
    bar.id = `bucket-bar-${idx}`;
    bar.title = `Hour ${idx + 1}: ${item.workAdded} work, ${item.completedBlockCount} blocks (${item.mood})`;

    bar.addEventListener('click', () => {
      if (replayPlayer) {
        replayPlayer.stop();
        replayPlayer.play(idx);
      }
    });

    container.appendChild(bar);
  });

  const startTimeEl = document.getElementById('replay-start-time');
  const endTimeEl = document.getElementById('replay-end-time');
  if (startTimeEl && plan[0]?.startAt) {
    startTimeEl.textContent = new Date(plan[0].startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (endTimeEl && plan[23]?.endAt) {
    endTimeEl.textContent = new Date(plan[23].endAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

/**
 * Loads a set of tokens into the band and updates the UI.
 * @param {Array<object>} tokens
 */
export async function loadBandTokens(tokens) {
  const container = document.getElementById('band-cards-grid');
  const msgEl = document.getElementById('band-status-msg');
  if (!container) return;

  container.innerHTML = '';

  if (!tokens || tokens.length === 0) {
    if (msgEl) {
      msgEl.style.display = 'block';
      msgEl.innerHTML = '🐹 This wallet holds no Squeeks on Sepolia. Click <strong>Demo Band</strong> to hear a full ensemble!';
    }
    audioEngine.setBandVoices([]);
    return;
  }

  // 1. Instantly render cards with dot-grid avatars and activate audio voices
  tokens.forEach((token) => {
    container.appendChild(createSqueekCard(token));
  });

  const voices = buildBandVoices(tokens);
  audioEngine.setBandVoices(voices);

  if (msgEl) {
    msgEl.style.display = 'block';
    msgEl.textContent = `Band active: ${voices.length} Squeek instrument(s) currently performing in the station!`;
  }

  // 2. Progressively fetch and upgrade SVG images from metadata in the background
  tokens.slice(0, 12).forEach(async (token) => {
    if (token.metadata?.imageDataUri) return;
    try {
      const meta = await fetchSqueekMetadata(token.tokenId);
      if (meta?.imageDataUri) {
        token.metadata = meta;
        const oldCard = document.getElementById(`squeek-card-${token.tokenId}`);
        if (oldCard) {
          const newCard = createSqueekCard(token);
          oldCard.replaceWith(newCard);
        }
      }
    } catch {
      // Retain clean dot-grid avatar on metadata error
    }
  });
}

/**
 * Setup Wallet Input and Demo Band Controls.
 */
function setupBandControls() {
  const form = document.getElementById('wallet-form');
  const input = document.getElementById('wallet-input');
  const loadBtn = document.getElementById('wallet-load-btn');
  const demoBtn = document.getElementById('demo-band-btn');
  const msgEl = document.getElementById('band-status-msg');

  if (form && input && loadBtn) {
    const handleLoad = async () => {
      const address = input.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.textContent = '⚠️ Please enter a valid Ethereum address (0x followed by 40 hex digits).';
        }
        return;
      }

      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading...';
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.textContent = `Fetching Squeeks for ${address.slice(0, 8)}...`;
      }

      try {
        const tokens = await fetchAllAccountTokens(address);
        await loadBandTokens(tokens);
      } catch (err) {
        if (msgEl) {
          msgEl.style.display = 'block';
          msgEl.textContent = `⚠️ Could not load wallet: ${err.message}`;
        }
      } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Join Band';
      }
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoad();
    });
    loadBtn.addEventListener('click', handleLoad);
  }

  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      if (input) input.value = 'Demo Band (5 Squeeks)';
      const demoTokens = getDemoBandTokens();
      await loadBandTokens(demoTokens);
    });
  }
}

/**
 * Setup Replay Controls and Mode Tabs.
 */
function setupReplayControls() {
  const tabLive = document.getElementById('tab-live');
  const tabReplay = document.getElementById('tab-replay');
  const replayPanel = document.getElementById('replay-panel');
  const replayBtn = document.getElementById('replay-play-btn');

  if (tabLive && tabReplay && replayPanel) {
    tabLive.addEventListener('click', () => {
      tabLive.classList.add('active');
      tabReplay.classList.remove('active');
      replayPanel.classList.remove('active');
      if (replayPlayer) replayPlayer.stop();
      if (replayBtn) replayBtn.textContent = '▶ Play 24h Symphony';
    });

    tabReplay.addEventListener('click', () => {
      tabReplay.classList.add('active');
      tabLive.classList.remove('active');
      replayPanel.classList.add('active');
      renderTimeline(state.settlements?.buckets || []);
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', async () => {
      if (replayPlayer?.isPlaying) {
        replayPlayer.stop();
        replayBtn.textContent = '▶ Play 24h Symphony';
        return;
      }

      const buckets = state.settlements?.buckets || [];
      if (!replayPlayer) {
        replayPlayer = new ReplayPlayer(
          audioEngine,
          (hourIndex, item) => {
            // Highlight active bar
            document.querySelectorAll('.bucket-bar').forEach((b) => b.classList.remove('active-hour'));
            const activeBar = document.getElementById(`bucket-bar-${hourIndex}`);
            if (activeBar) activeBar.classList.add('active-hour');

            const statusEl = document.getElementById('replay-current-hour');
            if (statusEl) {
              const timeStr = new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              statusEl.textContent = `Hour ${hourIndex + 1}/24 (${timeStr}) · ${item.workAdded} work · ${item.completedBlockCount} blocks`;
            }
          },
          () => {
            if (replayBtn) replayBtn.textContent = '▶ Play 24h Symphony';
            document.querySelectorAll('.bucket-bar').forEach((b) => b.classList.remove('active-hour'));
          }
        );
      }

      replayPlayer.load(buckets);
      replayBtn.textContent = '■ Stop Replay';
      await replayPlayer.play(0);
    });
  }
}

/**
 * Toggle audio playback on/off.
 */
export async function toggleAudio() {
  if (state.isTunedIn) {
    audioEngine.stop();
    state.isTunedIn = false;
    if (elements.tuneBtn) {
      elements.tuneBtn.classList.remove('playing');
      elements.tuneBtn.setAttribute('aria-pressed', 'false');
    }
    if (elements.tuneText) elements.tuneText.textContent = 'Tune In';
  } else {
    try {
      await audioEngine.start();
      state.isTunedIn = true;
      if (elements.tuneBtn) {
        elements.tuneBtn.classList.add('playing');
        elements.tuneBtn.setAttribute('aria-pressed', 'true');
      }
      if (elements.tuneText) elements.tuneText.textContent = '● On Air';
    } catch (err) {
      console.error('Audio start failed:', err);
    }
  }
}

/**
 * Initialize application.
 */
export function init() {
  const urlParams = new URLSearchParams(window.location.search);
  state.isDemo = urlParams.has('demo');
  state.isOverlay = urlParams.get('overlay') === '1';
  state.isChroma = urlParams.get('chroma') === '1';

  if (state.isOverlay) {
    document.body.classList.add('overlay-mode');
    // In OBS browser source, try auto-starting audio
    audioEngine.start().catch(() => {
      window.addEventListener('click', () => audioEngine.start(), { once: true });
    });
  }
  if (state.isChroma) {
    document.body.classList.add('chroma-mode');
  }

  if (state.isDemo && elements.demoBadge) {
    elements.demoBadge.style.display = 'inline-flex';
  }

  if (elements.tuneBtn) {
    elements.tuneBtn.addEventListener('click', toggleAudio);
  }

  if (elements.volumeSlider) {
    elements.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      state.volume = vol;
      audioEngine.setVolume(vol);
    });
  }

  if (elements.muteBtn) {
    elements.muteBtn.addEventListener('click', () => {
      state.isMuted = !state.isMuted;
      audioEngine.setMute(state.isMuted);
      elements.muteBtn.textContent = state.isMuted ? '🔇' : '🔊';
      elements.muteBtn.setAttribute('aria-label', state.isMuted ? 'Unmute Audio' : 'Mute Audio');
    });
  }

  if (elements.bannerDismiss) {
    elements.bannerDismiss.addEventListener('click', () => {
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    });
  }

  // Initialize Visualizer Manager
  const wheelCanvas = document.getElementById('wheel-canvas');
  const scopeCanvas = document.getElementById('scope-canvas');
  const overlayWheelCanvas = document.getElementById('overlay-wheel-canvas');
  visualizer = new VisualizerManager(wheelCanvas, scopeCanvas, overlayWheelCanvas);
  visualizer.start();

  // Keyboard shortcuts (Space = Toggle Tune In, M = Toggle Mute)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      toggleAudio();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      state.isMuted = !state.isMuted;
      audioEngine.setMute(state.isMuted);
      if (elements.muteBtn) {
        elements.muteBtn.textContent = state.isMuted ? '🔇' : '🔊';
        elements.muteBtn.setAttribute('aria-label', state.isMuted ? 'Unmute Audio' : 'Mute Audio');
      }
    }
  });

  setupReplayControls();
  setupBandControls();
  startPolling();
}

// Automatically initialize if running in browser window
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}
