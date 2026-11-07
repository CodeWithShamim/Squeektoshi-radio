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
  fetchAllAccountTokens,
  fetchSqueekMetadata,
  getDemoBandTokens,
  metadataLimiter,
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
import { createSqueekCard, createCardSkeleton, pulseCardActivity } from './ui/cards.js';
import { AudioStateMachine, AUDIO_STATES } from './ui/audio-state.js';
import { BackgroundWaveform } from './ui/waveform.js';
import { CueManager } from './audio/cues.js';
import { selectBestHour, composeBestHourExcerpt, BestHourPlayer } from './replay/best-hour.js';
import { ShareCoordinator } from './share/share.js';
import { TitleManager } from './platform/title.js';
import { MediaSessionManager } from './platform/media-session.js';

let visualizer = null;
let centralDial = null;
let motionSystem = null;
let readoutsManager = null;
let bandRing = null;
let replayPlayer = null;
let bandGenerationId = 0;
let mediaRecorder = null;
let recordedAudioChunks = [];
let recordTimerInterval = null;
let audioStateMachine = null;
let bgWaveform = null;
let cueManager = null;
let bestHourPlayer = null;
let shareCoordinator = null;
let titleManager = null;
let mediaSessionManager = null;

// Application State
export const state = {
  isTunedIn: false,
  isMuted: false,
  volume: 0.75,
  isDemo: false,
  isOverlay: false,
  isChroma: false,
  overlayVariant: 'compact',
  activePalette: 'analog',
  activeMode: 'live',
  walletAddress: '',
  spotlightToken: null,

  // Feature 1 & 2 additions
  isBestHourActive: false,
  bestHourSelection: null,
  bestHourInfo: null,
  bandTokens: [],
  currentBpm: 48,
  currentKeyInfo: null,

  // Telemetry & Music state
  status: null,
  settlements: null,
  economy: null,
  lastGoodStatus: null,
  lastSettlementCount: null,
  lastBlockHeight: null,

  // Network & Diagnostics Telemetry
  totalRequests: 0,
  count429: 0,
  requestLogs: [],

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
    if (cueManager) {
      const { rootMidi } = keyInfo;
      const fifthMidi = rootMidi + 7;
      const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
      cueManager.playBlock(midiToFreq(rootMidi), midiToFreq(fifthMidi));
    }
  }
  state.lastBlockHeight = statusData.blockHeight;

  // Update background waveform
  if (bgWaveform) {
    bgWaveform.updateTelemetry(statusData, bpm, mood);
  }

  // Update audio state machine on signal changes
  if (!statusData.isAvailable || statusData.freshness === 'unavailable') {
    if (audioStateMachine) {
      audioStateMachine.setState(AUDIO_STATES.UNKNOWN, 'Signal unavailable');
    }
  } else if (state.isTunedIn && audioStateMachine?.currentState === AUDIO_STATES.UNKNOWN) {
    audioStateMachine.setState(AUDIO_STATES.PLAYING);
  }

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

  // 7. Manage Demo Try highlight button visibility
  updateDemoTryButtons(mood);

  // 8. Update Live Tab Title & Media Session Metadata
  state.currentBpm = bpm;
  state.currentKeyInfo = keyInfo;

  if (titleManager) {
    titleManager.update({
      isTunedIn: state.isTunedIn,
      mode: state.activeMode,
      isBestHour: state.isBestHourActive,
      isAvailable: Boolean(statusData.isAvailable !== false && statusData.freshness !== 'unavailable'),
      freshness: statusData.freshness,
      bpm,
      blockHeight: statusData.blockHeight,
      replayHourText: state.bestHourInfo?.utcTimeText,
    });
  }

  if (mediaSessionManager && state.isTunedIn) {
    mediaSessionManager.updateMetadata({
      blockHeight: statusData.blockHeight,
      scaleLabel,
      bpm,
      mood,
      mode: state.activeMode,
      hour: state.bestHourInfo?.hourIndex,
    });
    mediaSessionManager.setPlaybackState('playing');
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

function recordRequestLog(endpoint, status) {
  state.totalRequests++;
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  state.requestLogs.unshift({ time: t, endpoint, status });
  if (state.requestLogs.length > 20) state.requestLogs.pop();

  const logList = document.getElementById('diag-requests-log');
  if (logList) {
    logList.innerHTML = '';
    state.requestLogs.forEach((log) => {
      const li = document.createElement('li');
      li.className = 'diag-log-item';
      const timeSpan = document.createElement('span');
      timeSpan.textContent = `${log.time} · ${log.endpoint}`;
      const statusStrong = document.createElement('strong');
      statusStrong.textContent = String(log.status);
      li.appendChild(timeSpan);
      li.appendChild(statusStrong);
      logList.appendChild(li);
    });
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
    recordRequestLog('/v1/status', '200 OK');
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
    recordRequestLog('/v1/economy/state', '200 OK');
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
  if (state.isDemo) {
    if (!state.settlements) {
      const now = Date.now();
      const demoBuckets = Array.from({ length: 24 }, (_, i) => {
        const startAt = new Date(now - (24 - i) * 3600000).toISOString();
        const endAt = new Date(now - (23 - i) * 3600000).toISOString();
        const work = i === 11 ? 2198 : (i === 10 ? 2177 : (i % 2 === 0 ? 0 : 450 + (i * 35)));
        return {
          startAt,
          endAt,
          settlementCount: 6,
          workAdded: work,
          completedBlockCount: Math.floor(work / 10),
        };
      });
      state.settlements = { status: 'available', buckets: demoBuckets, settlementCount: 140 };
      state.bestHourSelection = selectBestHour(state.settlements);
      if (typeof state.updateBestHourUIElements === 'function') {
        state.updateBestHourUIElements();
      }
    }
    return;
  }
  try {
    const raw = await apiFetch('/v1/settlements?range=24h');
    const parsed = parseSettlements(raw);
    if (parsed.status === 'available') {
      // Detect settlement count increase -> chime and log row
      if (state.lastSettlementCount !== null && parsed.settlementCount > state.lastSettlementCount) {
        audioEngine.ringSettlementChime();
        if (cueManager) {
          cueManager.playSettle();
        }
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

      // Update Best Hour Selection
      state.bestHourSelection = selectBestHour(parsed);
      if (typeof state.updateBestHourUIElements === 'function') {
        state.updateBestHourUIElements();
      }

      // Populate initial settlement rows
      if (parsed.recentSettlements?.length && readoutsManager?.settlementRows.length <= 1) {
        parsed.recentSettlements.slice(0, 5).forEach((item) => {
          const t = new Date(item.settledAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          readoutsManager.addSettlementEntry(t, item.roundNumber || '120', item.workAdded || '480k');
        });
      }
    } else {
      state.bestHourSelection = selectBestHour({ status: 'unavailable' });
      if (typeof state.updateBestHourUIElements === 'function') {
        state.updateBestHourUIElements();
      }
    }
  } catch (err) {
    console.warn('Settlements poll failed:', err.message);
    state.bestHourSelection = selectBestHour({ status: 'unavailable' });
    if (typeof state.updateBestHourUIElements === 'function') {
      state.updateBestHourUIElements();
    }
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
 * Spotlight a single token in console and solo it.
 */
export function spotlightToken(token) {
  state.spotlightToken = token;
  const tokenEl = document.getElementById('spot-token-id');
  const lvlEl = document.getElementById('spot-level');
  const pwrEl = document.getElementById('spot-power');
  const custEl = document.getElementById('spot-custody');
  const mergeEl = document.getElementById('spot-merge');
  const soloBtn = document.getElementById('btn-solo-spotlight');

  if (tokenEl) tokenEl.textContent = `#${token.tokenId}`;
  if (lvlEl) lvlEl.textContent = `Level ${token.level}`;
  if (pwrEl) pwrEl.textContent = `${token.numericBasePower || 1000} PWR`;
  if (custEl) custEl.textContent = token.custody || 'wallet';
  if (mergeEl) mergeEl.textContent = token.nextMergeHeight ? `#${token.nextMergeHeight}` : 'None';
  if (soloBtn) soloBtn.disabled = false;
}

/**
 * Loads a set of tokens into the band and updates the UI.
 */
export async function loadBandTokens(tokens) {
  const container = document.getElementById('band-cards-grid');
  const msgEl = document.getElementById('band-status-msg');

  state.bandTokens = (tokens && !tokens.isUnavailable) ? tokens : [];

  if (bgWaveform) {
    bgWaveform.setBandActive(Boolean(tokens && tokens.length > 0));
  }

  if (tokens?.isUnavailable) {
    if (msgEl) {
      msgEl.textContent = 'Signal unknown. Preserving last known band.';
    }
    return;
  }

  if (tokens && tokens.length > 0) {
    const voices = buildBandVoices(tokens);
    audioEngine.setBandVoices(voices);

    if (bandRing) {
      bandRing.setTokens(tokens);
    }

    // Play seat sound cue for loaded Squeeks (CueManager rate limits to <= 8/sec)
    if (cueManager) {
      tokens.forEach((t) => {
        cueManager.playSeat(t.tokenId, t.level);
      });
    }

    if (container) {
      container.style.display = 'grid';
      container.innerHTML = '';
      tokens.forEach((t) => {
        const card = createSqueekCard(t, (selected) => spotlightToken(selected));
        container.appendChild(card);

        // Fetch full metadata safely in background
        fetchSqueekMetadata(t.tokenId).then((meta) => {
          if (meta) {
            t.metadata = meta;
            const updatedCard = createSqueekCard(t, (selected) => spotlightToken(selected));
            const existing = document.getElementById(`squeek-card-${t.tokenId}`);
            if (existing && existing.parentNode) {
              existing.parentNode.replaceChild(updatedCard, existing);
            }
          }
        }).catch(() => {});
      });
    }

    if (msgEl) {
      msgEl.textContent = `Band active: ${voices.length} Squeek instrument(s) seated on the dial.`;
      msgEl.style.color = 'var(--color-amber)';
    }
  } else {
    audioEngine.setBandVoices([]);
    if (bandRing) {
      bandRing.setTokens([]);
    }
    if (container) {
      container.innerHTML = '';
      container.style.display = 'none';
    }
    if (msgEl) {
      msgEl.textContent = 'No Squeeks at this address.';
      msgEl.style.color = 'var(--color-bone-muted)';
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

  // Drawer / Section Toggle & Navigation
  if (tabBand && bandSection) {
    tabBand.setAttribute('aria-expanded', 'true');
    tabBand.style.borderColor = 'var(--color-amber)';
    tabBand.addEventListener('click', () => {
      bandSection.classList.remove('collapsed');
      tabBand.setAttribute('aria-expanded', 'true');
      tabBand.style.borderColor = 'var(--color-amber)';
      bandSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (input) {
        input.focus();
      }
    });
  }

  if (form && input && loadBtn) {
    const handleLoad = async () => {
      const address = input.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        if (msgEl) {
          msgEl.textContent = 'Please enter a valid Ethereum address (0x + 40 hex).';
          msgEl.style.color = 'var(--color-amber)';
        }
        return;
      }

      state.walletAddress = address;
      const currentGen = ++bandGenerationId;

      if (bandSection) {
        bandSection.classList.remove('collapsed');
      }
      if (tabBand) {
        tabBand.setAttribute('aria-expanded', 'true');
        tabBand.style.borderColor = 'var(--color-amber)';
      }

      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading...';
      if (msgEl) {
        msgEl.style.color = 'var(--color-bone-muted)';
        msgEl.textContent = `Fetching Squeeks for ${address.slice(0, 8)}...`;
      }

      // Render honest card skeletons
      const container = document.getElementById('band-cards-grid');
      if (container) {
        container.style.display = 'grid';
        container.innerHTML = '';
        for (let i = 0; i < 4; i++) {
          container.appendChild(createCardSkeleton(i));
        }
      }

      try {
        const tokens = await fetchAllAccountTokens(address, {
          onProgress: (loaded, total) => {
            if (currentGen === bandGenerationId && msgEl) {
              msgEl.textContent = `Fetching Squeeks... (${loaded} of ${total})`;
              if (audioStateMachine) {
                audioStateMachine.setState(AUDIO_STATES.BUFFERING, `Loading Squeeks ${loaded} of ${total}`);
              }
            }
          },
          onRateLimit: (statusText) => {
            if (currentGen === bandGenerationId && msgEl) {
              msgEl.textContent = statusText;
              if (audioStateMachine) {
                audioStateMachine.setState(AUDIO_STATES.BUFFERING, 'Waiting for the API rate limit');
              }
            }
          },
        });

        // Ignore stale responses from earlier queries
        if (currentGen !== bandGenerationId) return;

        await loadBandTokens(tokens);
        if (state.isTunedIn && audioStateMachine) {
          audioStateMachine.setState(AUDIO_STATES.PLAYING);
        }
      } catch (err) {
        if (currentGen === bandGenerationId && msgEl) {
          msgEl.textContent = 'Could not reach Squeekchain API. Check address or try again.';
          msgEl.style.color = 'var(--color-amber)';
        }
        if (audioStateMachine && state.isTunedIn) {
          audioStateMachine.setState(AUDIO_STATES.PLAYING);
        }
      } finally {
        if (currentGen === bandGenerationId) {
          loadBtn.disabled = false;
          loadBtn.textContent = 'Load Squeeks';
        }
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
 * Updates the shareable station URL in the console.
 */
export function updateShareUrl() {
  const input = document.getElementById('share-url-input');
  if (!input) return;
  const url = new URL(window.location.href);
  url.searchParams.set('palette', state.activePalette);
  url.searchParams.set('mode', state.activeMode);
  if (state.walletAddress) {
    url.searchParams.set('wallet', state.walletAddress);
  } else {
    url.searchParams.delete('wallet');
  }
  input.value = url.toString();
}

/**
 * Manages visibility of the highlight 'Demo Try' button(s) and 'Live' button(s).
 * - When in Demo mode (state.isDemo === true):
 *   'Live' buttons are shown, 'Demo Try' buttons are hidden.
 * - When in Live mode (state.isDemo === false):
 *   'Live' buttons are hidden.
 *   'Demo Try' buttons are shown IF mood is 'sleep', otherwise hidden.
 * @param {string} mood
 */
export function updateDemoAndLiveButtons(mood) {
  const isDemo = Boolean(state.isDemo);
  const isBestHour = Boolean(state.isBestHourActive);
  const isSleep = (mood === 'sleep') && !isDemo && !isBestHour;

  const demoButtons = document.querySelectorAll('.btn-demo-try');
  demoButtons.forEach((btn) => {
    btn.style.display = isSleep ? 'inline-flex' : 'none';
  });

  const liveButtons = document.querySelectorAll('.btn-live-switch, .btn-header-live, #tab-live');
  liveButtons.forEach((btn) => {
    btn.style.display = (isDemo || isBestHour) ? 'inline-flex' : 'none';
  });
}

// Backwards compatibility alias
export const updateDemoTryButtons = updateDemoAndLiveButtons;

/**
 * Triggers interactive Demo Mode on user request.
 * Transitions from sleep to live running demo so user immediately hears audio & sees the wheel turn.
 */
export function activateDemoTry() {
  state.isDemo = true;
  // Start at 20s in the demo cycle (jogging mood) so the hamster immediately runs and generative music plays
  state.demoStartTime = Date.now() - 20000;

  if (elements.demoBadge) {
    elements.demoBadge.style.display = 'inline-flex';
  }

  // Update button visibility immediately (shows Live button, hides Demo Try)
  updateDemoAndLiveButtons('jog');

  // Update URL to include ?demo cleanly without refreshing
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('demo', '1');
    window.history.replaceState({}, '', url);
  } catch {}

  // Immediately update status and UI to Jog mode without waiting for poll interval
  const demoData = getDemoStatus(20000);
  state.status = demoData;
  state.lastGoodStatus = demoData;
  state.currentBpm = calculateBpm(demoData.rpm);
  updateUI(demoData);
  if (centralDial) {
    centralDial.setTelemetry(demoData);
  }

  // Load demo band tokens immediately so band cards populate
  loadBandTokens(getDemoBandTokens());

  // Tune in if not already active
  if (!state.isTunedIn) {
    tuneIn(true);
  } else if (state.isMuted) {
    state.isMuted = false;
    audioEngine.setMute(false);
    if (elements.muteBtn) {
      elements.muteBtn.textContent = 'MUTE';
      elements.muteBtn.style.color = 'var(--color-bone-muted)';
    }
  }

  // Poll status to keep scheduler updated
  pollStatus();
}

/**
 * Switches station from Demo mode back to live telemetry.
 */
export async function activateLiveMode() {
  if (state.isBestHourActive) {
    stopBestHour();
  }
  state.isDemo = false;

  // Remove ?demo from URL
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    window.history.replaceState({}, '', url);
  } catch {}

  // Hide DEMO badge
  if (elements.demoBadge) {
    elements.demoBadge.style.display = 'none';
  }

  // Update button visibility immediately
  const curMood = state.status ? resolveMood(state.status) : 'sleep';
  updateDemoAndLiveButtons(curMood);

  // Immediately poll status from real API
  await pollStatus();
}

/**
 * Setup Demo Try and Live mode switch listeners.
 */
function setupDemoTryControls() {
  const demoButtons = document.querySelectorAll('.btn-demo-try');
  demoButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateDemoTry();
    });
  });

  const liveButtons = document.querySelectorAll('.btn-live-switch, .btn-header-live, #tab-live');
  liveButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activateLiveMode();
    });
  });

  const initialMood = state.status ? resolveMood(state.status) : 'sleep';
  updateDemoAndLiveButtons(initialMood);
}

/**
 * Setup Professional Features Console Drawer.
 */
function setupConsoleDrawer() {
  const drawer = document.getElementById('console-drawer');
  const openBtn = document.getElementById('btn-open-console');
  const headerOpenBtn = document.getElementById('btn-header-console');
  const closeBtn = document.getElementById('console-close-btn');

  const toggleConsole = (forceOpen) => {
    if (!drawer) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !drawer.classList.contains('open');
    drawer.classList.toggle('open', shouldOpen);
    drawer.setAttribute('aria-hidden', String(!shouldOpen));
    if (openBtn) openBtn.setAttribute('aria-expanded', String(shouldOpen));
    if (headerOpenBtn) headerOpenBtn.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) updateShareUrl();
  };

  if (openBtn) openBtn.addEventListener('click', () => toggleConsole());
  if (headerOpenBtn) headerOpenBtn.addEventListener('click', () => toggleConsole());
  if (closeBtn) closeBtn.addEventListener('click', () => toggleConsole(false));

  // Mode Segmented Control
  const modeButtons = document.querySelectorAll('#mode-segmented-control .segment-btn');
  const descEl = document.getElementById('mode-desc-text');
  const descMap = {
    live: 'Live telemetry from the WHEELY9000 hamster wheel on Sepolia.',
    replay: '24-hour symphony replay composed deterministically from settlement buckets.',
    band: 'Synthesized instrument band mapped from your wallet Squeek NFTs.',
    orchestra: 'Expansive harmonic progression with foreground pad chords and counterpoint arpeggios.',
  };

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const mode = btn.dataset.mode;
      state.activeMode = mode;
      audioEngine.setMode(mode);

      if (mode === 'live' && state.isDemo) {
        activateLiveMode();
      }

      if (descEl) descEl.textContent = descMap[mode] || '';

      const replayPanel = document.getElementById('replay-panel');
      const bandSection = document.getElementById('band-section');
      if (replayPanel) replayPanel.classList.toggle('open', mode === 'replay');
      if (bandSection) bandSection.classList.toggle('open', mode === 'band');

      updateShareUrl();
    });
  });

  // Sound Palette Segmented Control (1.2s crossfade)
  const paletteButtons = document.querySelectorAll('#palette-segmented-control .segment-btn');
  const palDescEl = document.getElementById('palette-desc-text');
  const palDescMap = {
    analog: 'Analog: Warm tape-saturation vibe, lower filter base (300Hz), rich Q (1.4).',
    glass: 'Glass: Shimmering crystalline harmonics, bright filter (600Hz), sparkling FM bells.',
    chamber: 'Chamber: Expansive acoustic hall sustain, 42% wet reverb, rich dynamic expression.',
    dub: 'Dub: Deep sub-bass foundation, dark cutoff (220Hz), high resonance (2.2), heavy ducking.',
  };

  paletteButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      paletteButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');

      const pal = btn.dataset.palette;
      state.activePalette = pal;
      audioEngine.setPalette(pal);
      try {
        localStorage.setItem('sqk_palette', pal);
      } catch {}

      if (palDescEl) palDescEl.textContent = palDescMap[pal] || '';
      updateShareUrl();
    });
  });

  // Share Copy Button
  const copyBtn = document.getElementById('share-copy-btn');
  const feedback = document.getElementById('share-feedback');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const input = document.getElementById('share-url-input');
      if (input && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(input.value);
          if (feedback) {
            feedback.style.display = 'block';
            setTimeout(() => { feedback.style.display = 'none'; }, 2000);
          }
        } catch {}
      }
    });
  }

  // Squeek Spotlight Solo Voice Button
  const soloBtn = document.getElementById('btn-solo-spotlight');
  if (soloBtn) {
    soloBtn.addEventListener('click', () => {
      if (state.spotlightToken) {
        const isCurrentlySoloed = soloBtn.classList.toggle('active-solo');
        soloBtn.textContent = isCurrentlySoloed ? 'Unsolo Squeek' : 'Solo This Squeek';
        if (isCurrentlySoloed) {
          audioEngine.setBandVoices(buildBandVoices([state.spotlightToken]));
        } else {
          audioEngine.setBandVoices(buildBandVoices(state.status?.tokens || []));
        }
      }
    });
  }
}

/**
 * Setup System Diagnostics Panel (D key or button).
 */
function setupDiagnosticsPanel() {
  const panel = document.getElementById('diagnostics-panel');
  const openBtn = document.getElementById('btn-open-diag');
  const closeBtn = document.getElementById('diag-close-btn');

  const toggleDiag = (forceOpen) => {
    if (!panel) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('open');
    panel.classList.toggle('open', shouldOpen);
    panel.setAttribute('aria-hidden', String(!shouldOpen));
    if (openBtn) openBtn.setAttribute('aria-expanded', String(shouldOpen));
  };

  if (openBtn) openBtn.addEventListener('click', () => toggleDiag());
  if (closeBtn) closeBtn.addEventListener('click', () => toggleDiag(false));

  // Periodic metrics refresh
  setInterval(() => {
    if (!panel || !panel.classList.contains('open')) return;

    const stats = audioEngine.getSchedulerStats();
    const audioStateEl = document.getElementById('diag-audio-state');
    const audioLatencyEl = document.getElementById('diag-audio-latency');
    const schedLatenessEl = document.getElementById('diag-sched-lateness');
    const schedAvgEl = document.getElementById('diag-sched-avg');
    const activeVoicesEl = document.getElementById('diag-active-voices');
    const totalReqsEl = document.getElementById('diag-total-requests');
    const count429El = document.getElementById('diag-429-count');
    const concurrencyEl = document.getElementById('diag-active-concurrency');

    if (audioStateEl) audioStateEl.textContent = stats.contextState;
    if (audioLatencyEl) audioLatencyEl.textContent = `latency: ${stats.baseLatency}ms`;
    if (schedLatenessEl) schedLatenessEl.textContent = `${stats.currentLatenessMs.toFixed(2)} ms`;
    if (schedAvgEl) schedAvgEl.textContent = `avg: ${stats.avgLatenessMs.toFixed(2)}ms · max: ${stats.maxLatenessMs.toFixed(2)}ms`;
    if (activeVoicesEl) activeVoicesEl.textContent = `${stats.activeVoices} / ${stats.maxPolyphony}`;
    if (totalReqsEl) totalReqsEl.textContent = String(state.totalRequests);
    if (count429El) count429El.textContent = String(state.count429);
    if (concurrencyEl) concurrencyEl.textContent = `${metadataLimiter.running} / 4`;
  }, 500);
}

/**
 * Setup Export Audio Clip (up to 30s master output).
 */
function setupExportClip() {
  const btn = document.getElementById('btn-export-clip');
  const timer = document.getElementById('export-timer');
  const link = document.getElementById('export-download-link');
  const statusDesc = document.getElementById('export-status-desc');

  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }

    if (!audioEngine.ctx) {
      await audioEngine.start();
    }

    if (typeof MediaRecorder === 'undefined' || !audioEngine.ctx.createMediaStreamDestination) {
      if (statusDesc) statusDesc.textContent = 'Audio clip export not supported in this browser environment.';
      return;
    }

    try {
      const dest = audioEngine.ctx.createMediaStreamDestination();
      audioEngine.masterGain.connect(dest);

      recordedAudioChunks = [];
      mediaRecorder = new MediaRecorder(dest.stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedAudioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        clearInterval(recordTimerInterval);
        if (timer) timer.style.display = 'none';
        btn.textContent = '● Record Clip (30s)';

        const blob = new Blob(recordedAudioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        if (link) {
          link.href = url;
          link.style.display = 'inline-block';
        }
        if (statusDesc) statusDesc.textContent = 'Recording complete. Click Download to save clip.';
      };

      mediaRecorder.start();
      let secondsLeft = 30;
      if (timer) {
        timer.style.display = 'inline-block';
        timer.textContent = `00:${String(secondsLeft).padStart(2, '0')}`;
      }
      btn.textContent = '■ Stop Recording';
      if (statusDesc) statusDesc.textContent = 'Recording active master audio... (max 30s)';

      recordTimerInterval = setInterval(() => {
        secondsLeft--;
        if (timer) timer.textContent = `00:${String(Math.max(0, secondsLeft)).padStart(2, '0')}`;
        if (secondsLeft <= 0) {
          clearInterval(recordTimerInterval);
          if (mediaRecorder.state === 'recording') mediaRecorder.stop();
        }
      }, 1000);
    } catch (err) {
      if (statusDesc) statusDesc.textContent = 'Could not initialize recording: ' + err.message;
    }
  });
}

/**
 * Setup OBS Stream Overlay Variants.
 */
function setupOverlayVariants() {
  const variantButtons = document.querySelectorAll('#overlay-variant-control .segment-btn');
  const obsInput = document.getElementById('obs-url-input');
  const copyBtn = document.getElementById('obs-copy-btn');

  const updateObsUrl = () => {
    if (!obsInput) return;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('overlay', '1');
    if (state.overlayVariant !== 'compact') {
      url.searchParams.set('variant', state.overlayVariant);
    }
    obsInput.value = url.toString();
  };

  variantButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      variantButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.overlayVariant = btn.dataset.variant || 'compact';
      updateObsUrl();
    });
  });

  updateObsUrl();

  if (copyBtn && obsInput) {
    copyBtn.addEventListener('click', async () => {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(obsInput.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy OBS URL'; }, 1500);
      }
    });
  }
}
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
 * Setup Best Hour Controls, HUD, and first-visit prompt (Feature 2).
 */
export function setupBestHourControls() {
  const bottomBtn = document.getElementById('btn-best-hour');
  const headerBtn = document.getElementById('btn-header-best-hour');
  const consoleBtn = document.getElementById('btn-console-best-hour');
  const hudCloseBtn = document.getElementById('btn-best-hour-hud-close');
  const firstVisitHint = document.getElementById('first-visit-hint');

  // Check first visit in localStorage safely
  try {
    const hasVisited = localStorage.getItem('sqk_has_visited');
    if (!hasVisited && firstVisitHint) {
      firstVisitHint.style.display = 'block';
    }
  } catch {}

  const dismissFirstVisitHint = () => {
    try {
      localStorage.setItem('sqk_has_visited', '1');
    } catch {}
    if (firstVisitHint) firstVisitHint.style.display = 'none';
  };

  const updateBestHourUIElements = () => {
    const res = state.bestHourSelection;
    const rankEl = document.getElementById('best-hour-rank');
    const workEl = document.getElementById('best-hour-work');
    const blocksEl = document.getElementById('best-hour-blocks');
    const localTimeEl = document.getElementById('best-hour-localtime');
    const utcTimeEl = document.getElementById('best-hour-utctime');
    const reasonEl = document.getElementById('best-hour-reason-msg');

    if (!res || res.status !== 'ok') {
      const reasonText = res?.reason || 'Hour data unknown right now.';
      if (reasonEl) {
        reasonEl.textContent = reasonText;
        reasonEl.style.display = 'block';
      }
      if (rankEl) rankEl.textContent = '--';
      if (workEl) workEl.textContent = '--';
      if (blocksEl) blocksEl.textContent = '--';
      if (localTimeEl) localTimeEl.textContent = '--';
      if (utcTimeEl) utcTimeEl.textContent = '--';

      if (bottomBtn) {
        bottomBtn.disabled = true;
        bottomBtn.title = reasonText;
      }
      if (headerBtn) {
        headerBtn.disabled = true;
        headerBtn.title = reasonText;
      }
      if (consoleBtn) {
        consoleBtn.disabled = true;
        consoleBtn.title = reasonText;
      }
      return;
    }

    if (reasonEl) reasonEl.style.display = 'none';
    if (rankEl) rankEl.textContent = res.rankText;
    if (workEl) workEl.textContent = `${res.workAdded} passes`;
    if (blocksEl) blocksEl.textContent = `${res.completedBlockCount} blocks`;
    if (localTimeEl) localTimeEl.textContent = res.localTimeText;
    if (utcTimeEl) utcTimeEl.textContent = res.utcTimeText;

    if (bottomBtn) {
      bottomBtn.disabled = false;
      bottomBtn.title = `Best hour (${res.rankText}): ${res.workAdded} passes (H)`;
    }
    if (headerBtn) {
      headerBtn.disabled = false;
      headerBtn.title = `Best hour (${res.rankText}): ${res.workAdded} passes`;
    }
    if (consoleBtn) {
      consoleBtn.disabled = false;
      consoleBtn.title = `Best hour (${res.rankText}): ${res.workAdded} passes`;
    }
  };

  state.updateBestHourUIElements = updateBestHourUIElements;
  updateBestHourUIElements();

  const handleToggleBestHour = async () => {
    dismissFirstVisitHint();

    if (state.isBestHourActive) {
      stopBestHour();
      return;
    }

    if (!state.bestHourSelection || state.bestHourSelection.status !== 'ok') {
      if (state.settlements) {
        state.bestHourSelection = selectBestHour(state.settlements);
      }
      if (!state.bestHourSelection || state.bestHourSelection.status !== 'ok') {
        const hint = document.getElementById('first-visit-hint');
        if (hint) {
          hint.textContent = 'Best hour data is loading...';
          hint.style.display = 'block';
          setTimeout(() => { if (hint) hint.style.display = 'none'; }, 2500);
        }
        return;
      }
    }

    await startBestHour();
  };

  if (bottomBtn) bottomBtn.addEventListener('click', handleToggleBestHour);
  if (headerBtn) headerBtn.addEventListener('click', handleToggleBestHour);
  if (consoleBtn) consoleBtn.addEventListener('click', handleToggleBestHour);
  if (hudCloseBtn) hudCloseBtn.addEventListener('click', () => stopBestHour());
}

export async function startBestHour() {
  const selection = state.bestHourSelection;
  if (!selection || selection.status !== 'ok') return;

  // Tune in if not already active
  if (!state.isTunedIn) {
    await tuneIn(true);
  } else if (state.isMuted) {
    state.isMuted = false;
    audioEngine.setMute(false);
    if (elements.muteBtn) {
      elements.muteBtn.textContent = 'MUTE';
      elements.muteBtn.style.color = 'var(--color-bone-muted)';
    }
  }

  if (!bestHourPlayer) {
    bestHourPlayer = new BestHourPlayer(audioEngine, {
      onTick: (progress, elapsed, stage) => {
        const hudRank = document.getElementById('best-hour-hud-rank');
        const hudTime = document.getElementById('best-hour-hud-time');
        const hudUtc = document.getElementById('best-hour-hud-utc');
        const hudWork = document.getElementById('best-hour-hud-work');
        const hudBlocks = document.getElementById('best-hour-hud-blocks');

        if (hudRank) hudRank.textContent = selection.rankText;
        if (hudTime) hudTime.textContent = selection.localTimeText;
        if (hudUtc) hudUtc.textContent = selection.utcTimeText;
        if (hudWork) hudWork.textContent = `${selection.workAdded} passes`;
        if (hudBlocks) hudBlocks.textContent = `${selection.completedBlockCount} blocks`;

        if (titleManager) {
          titleManager.update({
            isTunedIn: true,
            isBestHour: true,
            replayHourText: selection.utcTimeText,
          });
        }
      },
      onComplete: () => {
        stopBestHour();
      },
    });
  }

  // Load excerpt
  const loaded = bestHourPlayer.load(selection);
  if (!loaded) return;

  state.isBestHourActive = true;
  state.bestHourInfo = selection;

  // Highlight 24-segment ring on central dial
  if (centralDial) {
    centralDial.setActiveHour(selection.hourIndex);
  }

  // Show Best Hour HUD
  const hudEl = document.getElementById('best-hour-hud');
  if (hudEl) {
    hudEl.style.display = 'flex';
  }

  // Update Live buttons
  updateDemoAndLiveButtons('jog');

  // Update button active label
  const bottomBtn = document.getElementById('btn-best-hour');
  const headerBtn = document.getElementById('btn-header-best-hour');
  const consoleBtn = document.getElementById('btn-console-best-hour');
  if (bottomBtn) {
    bottomBtn.classList.add('active');
    bottomBtn.textContent = '■ Stop Best';
  }
  if (headerBtn) {
    headerBtn.classList.add('active');
    headerBtn.textContent = '■ Stop Best';
    headerBtn.style.color = 'var(--color-amber)';
    headerBtn.style.borderColor = 'var(--color-amber)';
  }
  if (consoleBtn) {
    consoleBtn.textContent = '■ Stop Excerpt';
  }

  await bestHourPlayer.play();
}

export function stopBestHour() {
  if (bestHourPlayer) {
    bestHourPlayer.stop();
  }

  state.isBestHourActive = false;
  state.bestHourInfo = null;

  // Reset 24-segment ring
  if (centralDial) {
    centralDial.setActiveHour(-1);
  }

  // Hide HUD
  const hudEl = document.getElementById('best-hour-hud');
  if (hudEl) {
    hudEl.style.display = 'none';
  }

  // Reset button state
  const bottomBtn = document.getElementById('btn-best-hour');
  const headerBtn = document.getElementById('btn-header-best-hour');
  const consoleBtn = document.getElementById('btn-console-best-hour');
  if (bottomBtn) {
    bottomBtn.classList.remove('active');
    bottomBtn.textContent = 'Best hour';
  }
  if (headerBtn) {
    headerBtn.classList.remove('active');
    headerBtn.textContent = 'Best hour';
    headerBtn.style.color = '';
    headerBtn.style.borderColor = '';
  }
  if (consoleBtn) {
    consoleBtn.textContent = '▶ Play Best Hour Excerpt';
  }

  // Restore live telemetry cleanly without restarting audio context
  if (state.lastGoodStatus) {
    updateUI(state.lastGoodStatus);
  }

  const curMood = state.status ? resolveMood(state.status) : 'sleep';
  updateDemoAndLiveButtons(curMood);

  if (titleManager) {
    titleManager.update({
      isTunedIn: state.isTunedIn,
      mode: 'live',
      isAvailable: Boolean(state.status?.isAvailable !== false && state.status?.freshness !== 'unavailable'),
      bpm: state.currentBpm,
      blockHeight: state.status?.blockHeight,
    });
  }
}

/**
 * Setup Share Band & Dial Poster Controls (Feature 1).
 */
export function setupShareControls() {
  shareCoordinator = new ShareCoordinator({
    getState: () => ({
      status: state.status,
      bpm: state.currentBpm,
      keyInfo: state.currentKeyInfo,
      activePalette: state.activePalette,
      activeMode: state.activeMode,
      isBestHourActive: state.isBestHourActive,
      bestHourInfo: state.bestHourInfo,
      bandTokens: state.bandTokens || [],
      walletAddress: state.walletAddress || '',
      siteUrl: window.location.host || 'squeektoshi.radio',
    }),
    getWaveformSample: () => audioEngine.getTimeDomainData(),
  });

  const bottomShareBtn = document.getElementById('btn-share-band');
  const headerShareBtn = document.getElementById('btn-header-share');
  if (bottomShareBtn) bottomShareBtn.addEventListener('click', () => shareCoordinator.open());
  if (headerShareBtn) headerShareBtn.addEventListener('click', () => shareCoordinator.open());
}

let gestureAttached = false;
function setupOneShotGestureTune() {
  if (gestureAttached) return;
  gestureAttached = true;
  const onFirstInteraction = async (e) => {
    if (e?.target?.closest && e.target.closest('#tune-btn')) return;
    window.removeEventListener('pointerdown', onFirstInteraction);
    window.removeEventListener('keydown', onFirstInteraction);
    window.removeEventListener('touchstart', onFirstInteraction);
    gestureAttached = false;
    await tuneIn(true);
  };
  window.addEventListener('pointerdown', onFirstInteraction, { passive: true });
  window.addEventListener('keydown', onFirstInteraction, { passive: true });
  window.addEventListener('touchstart', onFirstInteraction, { passive: true });
}

/**
 * Start audio playback and transition to Tuned In state.
 * If browser autoplay policy suspends it, attaches a one-shot gesture handler.
 */
export async function tuneIn(fromGesture = false) {
  if (state.isTunedIn) return;
  if (audioStateMachine) {
    audioStateMachine.setState(AUDIO_STATES.PREPARING);
  }
  try {
    if (fromGesture) {
      if (!audioEngine.isInitialized) {
        audioEngine.init();
      }
      if (audioEngine.ctx && audioEngine.ctx.state === 'suspended') {
        try {
          await audioEngine.ctx.resume();
        } catch (e) {
          console.warn('Direct ctx resume:', e);
        }
      }
    }
    await audioEngine.start();
    if (audioEngine.ctx) {
      if (cueManager) {
        cueManager.unlock();
        cueManager.init(audioEngine.ctx);
        cueManager.playIgnite();
      }
      if (bgWaveform && audioEngine.analyser) {
        bgWaveform.setAnalyser(audioEngine.analyser);
      }
      if (centralDial && audioEngine.analyser) {
        centralDial.setAnalyser(audioEngine.analyser);
      }
      if (motionSystem) {
        motionSystem.runIgnition();
      }
      if (audioStateMachine) {
        audioStateMachine.setState(AUDIO_STATES.PLAYING);
      }

      state.isTunedIn = true;
      if (elements.tuneBtn) {
        elements.tuneBtn.classList.add('active-tune', 'playing');
        elements.tuneBtn.setAttribute('aria-pressed', 'true');
      }
      if (elements.tuneText) elements.tuneText.textContent = 'Mute';

      if (titleManager) {
        titleManager.update({
          isTunedIn: true,
          mode: state.activeMode,
          isBestHour: state.isBestHourActive,
          isAvailable: Boolean(state.status?.isAvailable !== false && state.status?.freshness !== 'unavailable'),
          freshness: state.status?.freshness,
          bpm: state.currentBpm,
          blockHeight: state.status?.blockHeight,
        });
      }

      if (mediaSessionManager) {
        mediaSessionManager.setPlaybackState('playing');
      }
    } else if (!fromGesture) {
      if (audioStateMachine) {
        audioStateMachine.setState(AUDIO_STATES.IDLE);
      }
      setupOneShotGestureTune();
    }
  } catch (err) {
    if (audioStateMachine) {
      audioStateMachine.setState(AUDIO_STATES.ERROR, err?.message || 'Audio playback failed');
    }
    if (!fromGesture) {
      setupOneShotGestureTune();
    }
  }
}

/**
 * Toggle audio playback on/off with ignition animation.
 */
export async function toggleAudio() {
  if (state.isTunedIn) {
    audioEngine.stop();
    state.isTunedIn = false;
    if (audioStateMachine) {
      audioStateMachine.setState(AUDIO_STATES.IDLE);
    }
    if (elements.tuneBtn) {
      elements.tuneBtn.classList.remove('active-tune', 'playing');
      elements.tuneBtn.setAttribute('aria-pressed', 'false');
    }
    if (elements.tuneText) elements.tuneText.textContent = 'Tune in';

    if (titleManager) {
      titleManager.update({
        isTunedIn: false,
        mode: state.activeMode,
      });
    }

    if (mediaSessionManager) {
      mediaSessionManager.setPlaybackState('paused');
    }
  } else {
    await tuneIn(true);
  }
}

let lastVuRms = 0;
let vuPipsCache = null;

export function updateVolumeDisplay(vol, isMuted) {
  const el = document.getElementById('val-vol-db');
  if (!el) return;
  if (isMuted || vol <= 0.01) {
    el.textContent = '-∞ dB';
  } else {
    const db = 20 * Math.log10(vol);
    el.textContent = `${db.toFixed(1)} dB`;
  }
}

export function updateVuMeter() {
  const vuTrack = document.getElementById('vu-track-l');
  const vuPeakVal = document.getElementById('vu-peak-val');
  if (!vuTrack) return;

  if (!vuPipsCache) {
    vuPipsCache = vuTrack.querySelectorAll('.vu-pip');
  }

  let rms = 0;
  if (audioEngine?.analyser && state.isTunedIn && !state.isMuted) {
    const data = audioEngine.getTimeDomainData();
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    rms = Math.sqrt(sum / data.length);
  }

  // Smooth attack / gradual decay
  if (rms > lastVuRms) {
    lastVuRms = rms;
  } else {
    lastVuRms = Math.max(0, lastVuRms - 0.015);
  }

  const numPips = vuPipsCache.length;
  const activeCount = Math.min(numPips, Math.round((lastVuRms / 0.22) * numPips));

  for (let i = 0; i < numPips; i++) {
    if (i < activeCount) {
      vuPipsCache[i].classList.add('lit');
    } else {
      vuPipsCache[i].classList.remove('lit');
    }
  }

  if (vuPeakVal) {
    if (!state.isTunedIn || state.isMuted || lastVuRms <= 0.005) {
      vuPeakVal.textContent = '-∞ dB';
    } else {
      const db = 20 * Math.log10(lastVuRms * 3.5);
      vuPeakVal.textContent = `${Math.min(0, Math.max(-48, db)).toFixed(1)} dB`;
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

  // Asynchronously prewarm audio graph (reverb impulse) before first click
  audioEngine.prewarm();

  // Load sound palette preference from URL or localStorage
  let initialPalette = urlParams.get('palette');
  if (!initialPalette) {
    try {
      initialPalette = localStorage.getItem('sqk_palette');
    } catch {}
  }
  if (initialPalette) {
    state.activePalette = initialPalette;
    audioEngine.setPalette(initialPalette);
  }

  // Load mode from URL
  const initialMode = urlParams.get('mode');
  if (initialMode) {
    state.activeMode = initialMode;
    audioEngine.setMode(initialMode);
  }

  // Buffering Warning Listener
  audioEngine.onBufferingStateChange = (struggling, lateness) => {
    const diagNote = document.getElementById('diag-buffering-note');
    if (diagNote) {
      diagNote.style.display = struggling ? 'block' : 'none';
      if (struggling) {
        diagNote.textContent = `Audio is struggling (${lateness.toFixed(0)}ms lateness) — reducing voice density`;
      }
    }
    if (struggling) {
      if (audioStateMachine) {
        audioStateMachine.setState(AUDIO_STATES.BUFFERING, 'Audio is struggling');
      }
      if (cueManager) {
        cueManager.playWarn();
      }
    } else {
      if (audioStateMachine) {
        audioStateMachine.setState(AUDIO_STATES.PLAYING);
      }
      if (cueManager) {
        cueManager.playReady();
      }
    }
  };

  // Sound-effect Cues Coordinator
  cueManager = new CueManager({
    isOverlay: state.isOverlay,
    allowOverlayCues: urlParams.get('cues') === '1',
  });

  const cueToggleBtn = document.getElementById('btn-toggle-cues');
  if (cueToggleBtn) {
    const updateCueBtn = (enabled) => {
      cueToggleBtn.setAttribute('aria-pressed', String(enabled));
      cueToggleBtn.textContent = enabled ? 'CUES ON' : 'CUES OFF';
      cueToggleBtn.style.color = enabled ? 'var(--color-amber)' : 'var(--color-bone-muted)';
      cueToggleBtn.style.borderColor = enabled ? 'var(--color-amber)' : 'var(--color-hairline)';
    };
    updateCueBtn(cueManager.isEnabled());
    cueToggleBtn.addEventListener('click', async () => {
      cueManager.unlock();
      if (!audioEngine.isInitialized) {
        audioEngine.init();
      }
      if (audioEngine.ctx && audioEngine.ctx.state === 'suspended') {
        try { await audioEngine.ctx.resume(); } catch {}
      }
      if (audioEngine.ctx) {
        cueManager.init(audioEngine.ctx);
        if (bgWaveform && audioEngine.analyser && !bgWaveform.analyser) {
          bgWaveform.setAnalyser(audioEngine.analyser);
        }
        if (centralDial && audioEngine.analyser && !centralDial.analyser) {
          centralDial.setAnalyser(audioEngine.analyser);
        }
      }
      const newState = cueManager.toggle();
      updateCueBtn(newState);
      if (newState) {
        cueManager.playReady();
      }
    });
  }

  // Audio State Machine
  const announcerEl = document.getElementById('audio-state-announcer');
  audioStateMachine = new AudioStateMachine({
    initialState: AUDIO_STATES.IDLE,
    ariaLiveElement: announcerEl,
    onRetry: () => {
      tuneIn(true);
    },
  });

  // Subscribe UI and Cues to State Machine Transitions
  audioStateMachine.addListener((sm) => {
    const currentState = sm.targetState || sm.state;
    const cause = sm.cause;
    const bufferingHud = document.getElementById('station-buffering-hud');
    const bufferingText = document.getElementById('station-buffering-text');
    const signalDot = document.getElementById('signal-dot');
    const signalText = document.getElementById('signal-text');

    if (currentState === AUDIO_STATES.BUFFERING) {
      if (bufferingHud) {
        bufferingHud.style.display = 'inline-flex';
        if (bufferingText) {
          bufferingText.textContent = cause ? `BUFFERING: ${cause.toUpperCase()}` : 'BUFFERING AUDIO GRAPH...';
        }
      }
      if (signalDot) {
        signalDot.className = 'signal-indicator-dot buffering';
      }
      if (signalText) {
        signalText.textContent = 'buffering';
        signalText.style.color = 'var(--color-amber)';
      }
      if (cueManager && cueManager.isEnabled()) {
        cueManager.playWarn();
      }
    } else {
      if (bufferingHud) {
        bufferingHud.style.display = 'none';
      }
      if (signalDot) {
        signalDot.className = 'signal-indicator-dot live';
      }
      if (signalText) {
        signalText.textContent = state.isDemoMode ? 'Simulated' : (state.isUnknownSignal ? 'unknown' : 'live');
        signalText.style.color = '';
      }
      if (sm.previousState === AUDIO_STATES.BUFFERING && currentState === AUDIO_STATES.PLAYING) {
        if (cueManager && cueManager.isEnabled()) {
          cueManager.playReady();
        }
      }
    }
  });

  // Background Oscilloscope Waveform Renderer
  const bgCanvas = document.getElementById('bg-waveform-canvas');
  if (bgCanvas) {
    bgWaveform = new BackgroundWaveform({
      canvas: bgCanvas,
      stateMachine: audioStateMachine,
      isOverlay: state.isOverlay,
    });
  }

  // Forward Voice Activity from audio engine to waveform
  audioEngine.onVoiceTriggered = (layer, intensity) => {
    if (bgWaveform) {
      bgWaveform.pulseLayer(layer, intensity);
    }
  };

  // Instantiate Presentation Layer
  motionSystem = new MotionSystem();
  readoutsManager = new ReadoutsManager(motionSystem);
  bandRing = new BandRingManager();

  // Instantiate Central Dial
  const dialSvg = document.getElementById('dial-svg');
  if (dialSvg) {
    centralDial = new CentralDial({
      onHourSelect: (h) => {
        if (audioStateMachine) {
          audioStateMachine.setState(AUDIO_STATES.BUFFERING, 'Loading replay data');
          setTimeout(() => {
            if (state.isTunedIn) audioStateMachine.setState(AUDIO_STATES.PLAYING);
          }, 350);
        }
        if (replayPlayer) {
          replayPlayer.seek(h);
        }
      },
      onRenderFrame: (delta, now) => {
        if (bgWaveform) {
          bgWaveform.render(delta, now);
        }
        updateVuMeter();
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

  // Tune in on user visit
  tuneIn();

  if (elements.volumeSlider) {
    updateVolumeDisplay(state.volume, state.isMuted);
    elements.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      state.volume = vol;
      audioEngine.setVolume(vol);
      updateVolumeDisplay(vol, state.isMuted);
    });
  }

  if (elements.muteBtn) {
    elements.muteBtn.addEventListener('click', () => {
      state.isMuted = !state.isMuted;
      audioEngine.setMute(state.isMuted);
      elements.muteBtn.textContent = state.isMuted ? 'UNMUTE' : 'MUTE';
      elements.muteBtn.style.color = state.isMuted ? 'var(--color-amber)' : 'var(--color-bone-muted)';
      updateVolumeDisplay(state.volume, state.isMuted);
    });
  }

  if (elements.bannerDismiss) {
    elements.bannerDismiss.addEventListener('click', () => {
      if (elements.statusBanner) elements.statusBanner.classList.remove('visible');
    });
  }

  // Keyboard shortcuts (Space = Tune/Mute, C = Console, D = Diag, R = Replay, B = Band)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      e.preventDefault();
      toggleAudio();
    } else if (e.code === 'KeyC') {
      e.preventDefault();
      const openBtn = document.getElementById('btn-open-console');
      if (openBtn) openBtn.click();
    } else if (e.code === 'KeyD') {
      e.preventDefault();
      const diagBtn = document.getElementById('btn-open-diag');
      if (diagBtn) diagBtn.click();
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      const tabReplay = document.getElementById('tab-replay');
      if (tabReplay) tabReplay.click();
    } else if (e.code === 'KeyB') {
      e.preventDefault();
      const tabBand = document.getElementById('tab-band');
      if (tabBand) tabBand.click();
    } else if (e.code === 'KeyH') {
      e.preventDefault();
      const bestBtn = document.getElementById('btn-best-hour');
      if (bestBtn && !bestBtn.disabled) bestBtn.click();
    } else if (e.code === 'KeyS') {
      e.preventDefault();
      if (shareCoordinator) shareCoordinator.open();
    } else if (e.code === 'KeyM') {
      e.preventDefault();
      if (elements.muteBtn) elements.muteBtn.click();
    } else if (e.code === 'Escape') {
      if (shareCoordinator && shareCoordinator.isOpen) {
        shareCoordinator.close();
      }
      const consoleDrawer = document.getElementById('console-drawer');
      const diagPanel = document.getElementById('diagnostics-panel');
      if (consoleDrawer) {
        consoleDrawer.classList.remove('open');
        consoleDrawer.setAttribute('aria-hidden', 'true');
        const openBtn = document.getElementById('btn-open-console');
        const headerOpenBtn = document.getElementById('btn-header-console');
        if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
        if (headerOpenBtn) headerOpenBtn.setAttribute('aria-expanded', 'false');
      }
      if (diagPanel) {
        diagPanel.classList.remove('open');
        diagPanel.setAttribute('aria-hidden', 'true');
      }
    }
  });

  // Platform Live Title Manager
  titleManager = new TitleManager();
  titleManager.update({
    isTunedIn: false,
    mode: state.activeMode,
  });

  // Lock-Screen Controls & Media Session Manager
  mediaSessionManager = new MediaSessionManager({
    audioEngine,
    getState: () => state,
    onPlay: () => {
      if (!state.isTunedIn || state.isMuted) toggleAudio();
    },
    onPause: () => {
      if (state.isTunedIn && !state.isMuted) toggleAudio();
    },
    onStop: () => {
      if (state.isTunedIn) toggleAudio();
    },
    onPrevHour: () => {
      if (replayPlayer && replayPlayer.isPlaying) {
        replayPlayer.seek(Math.max(0, replayPlayer.currentHour - 1));
      }
    },
    onNextHour: () => {
      if (replayPlayer && replayPlayer.isPlaying) {
        replayPlayer.seek(Math.min(23, replayPlayer.currentHour + 1));
      }
    },
  });

  // Setup Feature Modules
  setupConsoleDrawer();
  setupDemoTryControls();
  setupDiagnosticsPanel();
  setupExportClip();
  setupOverlayVariants();
  setupReplayControls();
  setupBandControls();
  setupBestHourControls();
  setupShareControls();
  startPolling();

  // If ?debug URL query present, open diagnostics immediately
  if (urlParams.has('debug')) {
    const diagBtn = document.getElementById('btn-open-diag');
    if (diagBtn) diagBtn.click();
  }

  // If ?besthour URL query present, activate best hour
  if (urlParams.get('besthour') === '1') {
    setTimeout(() => {
      const bestBtn = document.getElementById('btn-best-hour');
      if (bestBtn && !bestBtn.disabled) {
        bestBtn.click();
      }
    }, 300);
  }

  // Default wallet address to show and fetch on visit
  const DEFAULT_WALLET = '0x197BDAB29923e997672785d329fF063FF6591545';
  const urlWallet = urlParams.get('wallet');
  const targetWallet = (urlWallet && /^0x[0-9a-fA-F]{40}$/.test(urlWallet)) ? urlWallet : DEFAULT_WALLET;

  const input = document.getElementById('wallet-input');
  const bandSection = document.getElementById('band-section');
  const tabBand = document.getElementById('tab-band');

  if (input) input.value = targetWallet;
  if (bandSection) bandSection.classList.remove('collapsed');
  if (tabBand) {
    tabBand.setAttribute('aria-expanded', 'true');
    tabBand.style.borderColor = 'var(--color-amber)';
  }
  state.walletAddress = targetWallet;

  // Auto-fetch the default band tokens so Squeeks show immediately on visit
  if (!state.isDemo) {
    const msgEl = document.getElementById('band-status-msg');
    if (msgEl) {
      msgEl.textContent = `Fetching Squeeks for ${targetWallet.slice(0, 8)}...`;
      msgEl.style.color = 'var(--color-bone-muted)';
    }
    fetchAllAccountTokens(targetWallet)
      .then(async (tokens) => {
        await loadBandTokens(tokens);
      })
      .catch((err) => {
        console.warn('Default wallet band fetch:', err);
      });
  } else {
    loadBandTokens(getDemoBandTokens());
  }
}

// Automatically initialize if running in browser window
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
