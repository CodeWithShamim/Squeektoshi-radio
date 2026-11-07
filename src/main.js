/**
 * Squeektoshi Radio - Main Application Entry (src/main.js)
 * Coordinates Audio Engine, Telemetry Polling, Instrument Dial, Motion System & Readouts.
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
import { CentralDial } from './ui/dial.js';
import { MotionSystem } from './ui/motion.js';
import { ReadoutsManager } from './ui/readouts.js';
import { BandRingManager } from './ui/band-ring.js';
import { ReplayPlayer, composeDayPlan } from './music/replay.js';
import { buildBandVoices } from './music/band.js';
import { createSqueekCard } from './ui/cards.js';
import { fetchAllAccountTokens, fetchSqueekMetadata, getDemoBandTokens } from './api.js';

let visualizer = null;
let centralDial = null;
let motionSystem = null;
let readoutsManager = null;
let bandRing = null;
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
  lastBlockHeight: null,

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
  valKeyRoot: document.getElementById('val-key-root'),
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
  const keyInfo = calculateKey(statusData.blockHeight);

  let scaleLabel = 'Minor Pentatonic';
  if (mood === 'jog') scaleLabel = 'Dorian';
  if (mood === 'zoomies') scaleLabel = 'Mixolydian';
  const keyName = `${keyInfo.rootName} ${scaleLabel}`;

  const progressPct = Math.min(100, Math.max(0, Math.round((statusData.blockProgressRatio || 0) * 100)));

  // Detect block height completion
  if (state.lastBlockHeight !== null && statusData.blockHeight > state.lastBlockHeight) {
    if (motionSystem) motionSystem.runBlockComplete();
  }
  state.lastBlockHeight = statusData.blockHeight;

  // 1. Update Readouts Coordinator
  if (readoutsManager) {
    readoutsManager.updateTelemetry(statusData, bpm, keyInfo, mood);
  }

  // 2. Direct DOM bindings for backward test compatibility
  if (elements.badgeMood) {
    elements.badgeMood.className = `mood-badge readout-value mood-display ${mood}`;
    elements.badgeMood.textContent = mood.toUpperCase();
  }
  if (elements.valRpm) {
    elements.valRpm.textContent = `${(statusData.rpm || 0).toFixed(1)} RPM`;
  }
  if (elements.valBpm) {
    elements.valBpm.textContent = `${bpm} BPM`;
  }
  if (elements.valKeyRoot) {
    elements.valKeyRoot.textContent = keyInfo.rootName;
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

  // Signal & banner backward compatibility
  if (elements.signalDot && elements.signalText) {
    if (!statusData.isAvailable || statusData.freshness === 'stale' || statusData.freshness === 'unavailable') {
      elements.signalDot.className = 'signal-indicator-dot freshness-dot stale';
      elements.signalText.textContent = statusData.freshness === 'stale' ? 'stale' : 'unknown';
      if (elements.statusBanner) elements.statusBanner.classList.add('visible');
    } else if (state.isDemo) {
      elements.signalDot.className = 'signal-indicator-dot freshness-dot live';
      elements.signalText.textContent = 'Simulated';
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    } else if (statusData.isAvailable && statusData.isOnline) {
      elements.signalDot.className = 'signal-indicator-dot freshness-dot live';
      elements.signalText.textContent = 'live';
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    }
  }

  // 3. Update Stream Overlay
  if (elements.overlayMood) elements.overlayMood.textContent = mood.toUpperCase();
  if (elements.overlayBpm) elements.overlayBpm.textContent = `${bpm} BPM`;
  if (elements.overlayBlock) elements.overlayBlock.textContent = `#${statusData.blockHeight ?? 0}`;
  if (elements.overlayProgress) elements.overlayProgress.textContent = `${progressPct}%`;

  // 4. Update Central Instrument Dial
  if (centralDial) {
    centralDial.setTelemetry({
      ...statusData,
      mood,
    });
  }

  // 5. Feed to audio engine
  audioEngine.updateTelemetry(statusData);

  // 6. Feed to legacy visualizer if present
  if (visualizer) {
    visualizer.setRpm(statusData.rpm);
  }
}

/**
 * Update economy widgets with SQK minted.
 */
export function updateEconomyUI(economyData) {
  if (!economyData) return;
  if (readoutsManager) {
    readoutsManager.updateEconomy(economyData);
  }
  if (economyData.totalMintedSQK !== undefined && elements.valSqkMinted) {
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
      // Detect settlement count increase -> chime and log row
      if (state.lastSettlementCount !== null && parsed.settlementCount > state.lastSettlementCount) {
        audioEngine.ringSettlementChime();
        if (centralDial) centralDial.triggerChimePulse();

        const latest = parsed.recentSettlements?.[0];
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const roundNum = latest?.roundNumber || 'Settlement';
        const workUnits = latest?.workAdded || 'PoW';
        if (readoutsManager) {
          readoutsManager.addSettlementEntry(timeStr, roundNum, workUnits);
        }
      }
      state.lastSettlementCount = parsed.settlementCount;
      state.settlements = parsed;

      // Populate initial settlement rows
      if (parsed.recentSettlements?.length && readoutsManager?.settlementRows.length <= 1) {
        parsed.recentSettlements.slice(0, 5).forEach((item) => {
          const t = new Date(item.settledAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          readoutsManager.addSettlementEntry(t, item.roundNumber || '120', item.workAdded || '480k');
        });
      }
    }
  } catch (err) {
    console.warn('Settlements poll failed:', err.message);
  }
}

/**
 * Start recurring background polling.
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
  const plan = composeDayPlan(buckets);

  if (container) {
    container.innerHTML = '';
    plan.forEach((item, idx) => {
      const bar = document.createElement('div');
      bar.className = `bucket-bar ${item.mood}`;
      bar.id = `bucket-bar-${idx}`;
      bar.title = `Hour ${idx + 1}: ${item.workAdded} work (${item.mood})`;
      bar.addEventListener('click', () => {
        if (replayPlayer) {
          replayPlayer.stop();
          replayPlayer.play(idx);
        }
      });
      container.appendChild(bar);
    });
  }

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
 */
export async function loadBandTokens(tokens) {
  const container = document.getElementById('band-cards-grid');
  const msgEl = document.getElementById('band-status-msg');

  if (tokens && tokens.length > 0) {
    const voices = buildBandVoices(tokens);
    audioEngine.setBandVoices(voices);

    if (bandRing) {
      bandRing.setTokens(tokens);
    }
    if (msgEl) {
      msgEl.textContent = `Band active: ${voices.length} Squeek instrument(s) seated on the dial.`;
    }
  } else {
    audioEngine.setBandVoices([]);
    if (bandRing) {
      bandRing.setTokens([]);
    }
    if (msgEl) {
      msgEl.textContent = 'No Squeeks at this address.';
    }
  }
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
  const tabBand = document.getElementById('tab-band');
  const bandSection = document.getElementById('band-section');

  // Drawer Toggle
  if (tabBand && bandSection) {
    tabBand.addEventListener('click', () => {
      const isOpen = bandSection.classList.toggle('open');
      tabBand.setAttribute('aria-expanded', String(isOpen));
      tabBand.style.borderColor = isOpen ? 'var(--color-amber)' : 'var(--color-hairline)';
    });
  }

  if (form && input && loadBtn) {
    const handleLoad = async () => {
      const address = input.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        if (msgEl) {
          msgEl.textContent = 'Please enter a valid Ethereum address (0x + 40 hex).';
        }
        return;
      }

      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading...';
      if (msgEl) {
        msgEl.textContent = `Fetching Squeeks for ${address.slice(0, 8)}...`;
      }

      try {
        const tokens = await fetchAllAccountTokens(address);
        await loadBandTokens(tokens);
      } catch (err) {
        if (msgEl) {
          msgEl.textContent = 'Could not reach the Squeekchain API. Retrying.';
        }
      } finally {
        loadBtn.disabled = false;
        loadBtn.textContent = 'Load Squeeks';
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
      if (input) input.value = '0xDemoBand...';
      const demoTokens = getDemoBandTokens();
      await loadBandTokens(demoTokens);
    });
  }
}

/**
 * Setup Replay Controls and Mode Tabs.
 */
function setupReplayControls() {
  const tabReplay = document.getElementById('tab-replay');
  const replayPanel = document.getElementById('replay-panel');
  const replayBtn = document.getElementById('replay-play-btn');

  // Replay Drawer Toggle
  if (tabReplay && replayPanel) {
    tabReplay.addEventListener('click', () => {
      const isOpen = replayPanel.classList.toggle('open');
      tabReplay.setAttribute('aria-expanded', String(isOpen));
      tabReplay.style.borderColor = isOpen ? 'var(--color-amber)' : 'var(--color-hairline)';
      if (isOpen) {
        renderTimeline(state.settlements?.buckets || []);
      }
    });
  }

  if (replayBtn) {
    replayBtn.addEventListener('click', async () => {
      if (replayPlayer?.isPlaying) {
        replayPlayer.stop();
        replayBtn.textContent = '▶ Play Symphony';
        return;
      }

      const buckets = state.settlements?.buckets || [];
      if (!replayPlayer) {
        replayPlayer = new ReplayPlayer(
          audioEngine,
          (hourIndex, item) => {
            if (centralDial) centralDial.setActiveHour(hourIndex);
            const statusEl = document.getElementById('replay-current-hour');
            if (statusEl) {
              const timeStr = new Date(item.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              statusEl.textContent = `Hour ${hourIndex + 1}/24 (${timeStr}) · ${item.workAdded} work`;
            }
          },
          () => {
            if (replayBtn) replayBtn.textContent = '▶ Play Symphony';
            if (centralDial) centralDial.setActiveHour(-1);
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
 * Toggle audio playback on/off with ignition animation.
 */
export async function toggleAudio() {
  if (state.isTunedIn) {
    audioEngine.stop();
    state.isTunedIn = false;
    if (elements.tuneBtn) {
      elements.tuneBtn.classList.remove('active-tune', 'playing');
      elements.tuneBtn.setAttribute('aria-pressed', 'false');
    }
    if (elements.tuneText) elements.tuneText.textContent = 'Tune in';
  } else {
    try {
      await audioEngine.start();
      if (centralDial && audioEngine.analyser) {
        centralDial.setAnalyser(audioEngine.analyser);
      }
      if (motionSystem) {
        motionSystem.runIgnition();
      }

      state.isTunedIn = true;
      if (elements.tuneBtn) {
        elements.tuneBtn.classList.add('active-tune', 'playing');
        elements.tuneBtn.setAttribute('aria-pressed', 'true');
      }
      if (elements.tuneText) elements.tuneText.textContent = 'Mute';
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

  // Instantiate Presentation Layer
  motionSystem = new MotionSystem();
  readoutsManager = new ReadoutsManager(motionSystem);
  bandRing = new BandRingManager();

  // Instantiate Central Dial
  const dialSvg = document.getElementById('dial-svg');
  if (dialSvg) {
    centralDial = new CentralDial({
      onHourSelect: (h) => {
        if (replayPlayer) {
          replayPlayer.stop();
          replayPlayer.play(h);
        }
      },
    });
  }

  // Run Entry Sequence Animation
  motionSystem.runEntrySequence();

  if (state.isOverlay) {
    document.body.classList.add('overlay-mode');
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
      elements.muteBtn.textContent = state.isMuted ? 'UNMUTE' : 'MUTE';
      elements.muteBtn.style.color = state.isMuted ? 'var(--color-amber)' : 'var(--color-bone-muted)';
    });
  }

  if (elements.bannerDismiss) {
    elements.bannerDismiss.addEventListener('click', () => {
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    });
  }

  // Keyboard shortcuts (Space = Tune/Mute, R = Replay, B = Band)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleAudio();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      const tabReplay = document.getElementById('tab-replay');
      if (tabReplay) tabReplay.click();
    } else if (e.code === 'KeyB') {
      e.preventDefault();
      const tabBand = document.getElementById('tab-band');
      if (tabBand) tabBand.click();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      if (elements.muteBtn) elements.muteBtn.click();
    } else if (e.code === 'ArrowRight' && replayPlayer?.isPlaying) {
      const nextHour = (replayPlayer.currentHourIndex + 1) % 24;
      replayPlayer.play(nextHour);
    } else if (e.code === 'ArrowLeft' && replayPlayer?.isPlaying) {
      const prevHour = (replayPlayer.currentHourIndex + 23) % 24;
      replayPlayer.play(prevHour);
    }
  });

  // Legacy Visualizer support for overlay canvas
  const overlayWheelCanvas = document.getElementById('overlay-wheel-canvas');
  if (overlayWheelCanvas) {
    visualizer = new VisualizerManager(null, null, overlayWheelCanvas);
    visualizer.start();
  }

  setupReplayControls();
  setupBandControls();
  startPolling();

  // If demo mode, pre-populate demo band
  if (state.isDemo) {
    loadBandTokens(getDemoBandTokens());
  }
}

// Automatically initialize if running in browser window
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}
