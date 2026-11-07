/**
 * HUD Telemetry Client & Running Pass Counter
 * Respects rate limits: polls /v1/status at most once every 5 seconds.
 * Robust unknown-state handling: "unavailable" or network error marks "signal unknown"
 * without halting the wheel or muting the scene.
 */

import { apiFetch, parseStatus } from '../api.js';

let runningPasses = 0;
let lastTelemetry = {
  rpm: 0,
  blockHeight: 0,
  status: 'asleep',
};

const hudElements = {
  rpm: document.getElementById('hud-rpm'),
  block: document.getElementById('hud-block'),
  status: document.getElementById('hud-status'),
  passes: document.getElementById('hud-passes'),
};

/**
 * Increment the running pass counter each time a magnet clears the sensor gate.
 */
export function incrementPassCounter() {
  runningPasses++;
  if (hudElements.passes) {
    hudElements.passes.textContent = String(runningPasses).padStart(6, '0');
  }
}

/**
 * Update the on-screen HUD text.
 */
function renderHUD(data) {
  if (hudElements.rpm) {
    hudElements.rpm.textContent = (data.rpm || 0).toFixed(1);
  }
  if (hudElements.block) {
    hudElements.block.textContent = `#${data.blockHeight || 0}`;
  }
  if (hudElements.status) {
    hudElements.status.textContent = data.status;
    hudElements.status.className = `hud-val ${data.status === 'running' ? 'amber' : data.status === 'signal unknown' ? 'unknown' : ''}`;
  }
}

/**
 * Fetch status from the live API (or fallback if unavailable).
 */
export async function fetchLandingStatus(isDemo = false) {
  try {
    if (isDemo || window.location.search.includes('demo')) {
      const elapsed = Date.now() % 60000;
      let mockRpm = 45.0;
      let mockStatus = 'running';
      if (elapsed > 40000) {
        mockRpm = 0.0;
        mockStatus = 'asleep';
      }
      lastTelemetry = {
        rpm: mockRpm,
        blockHeight: 1200 + Math.floor(elapsed / 10000),
        status: mockStatus,
      };
      renderHUD(lastTelemetry);
      return lastTelemetry;
    }

    const raw = await apiFetch('/v1/status');
    const parsed = parseStatus(raw);

    if (parsed.isAvailable && parsed.isOnline) {
      const isSpinning = parsed.rpm > 0.5 || parsed.coreStatus === 'SPINNING';
      lastTelemetry = {
        rpm: parsed.rpm,
        blockHeight: parsed.blockHeight || lastTelemetry.blockHeight,
        status: isSpinning ? 'running' : 'asleep',
      };
    } else {
      // unavailable or stale: keep last good values, mark signal unknown
      lastTelemetry = {
        ...lastTelemetry,
        status: 'signal unknown',
      };
    }
  } catch {
    // network failure / timeout: keep calm, signal unknown
    lastTelemetry = {
      ...lastTelemetry,
      status: 'signal unknown',
    };
  }

  renderHUD(lastTelemetry);
  return lastTelemetry;
}

/**
 * Initialize 5-second polling loop.
 */
export function initHUD(onTelemetryUpdate) {
  // Initial fetch
  fetchLandingStatus().then((telemetry) => {
    if (onTelemetryUpdate) onTelemetryUpdate(telemetry);
  });

  // 5-second interval
  const pollInterval = setInterval(async () => {
    if (document.hidden) return; // Pause when tab hidden
    const telemetry = await fetchLandingStatus();
    if (onTelemetryUpdate) onTelemetryUpdate(telemetry);
  }, 5000);

  // Tab visibility handling
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      fetchLandingStatus().then((telemetry) => {
        if (onTelemetryUpdate) onTelemetryUpdate(telemetry);
      });
    }
  });

  return () => clearInterval(pollInterval);
}
