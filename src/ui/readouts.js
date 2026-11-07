/**
 * Squeektoshi Radio — Readouts & Settlement Log Coordinator (readouts.js)
 * Manages typographic stacks, rolling digits, signal indicators, and the settlement log.
 */

export class ReadoutsManager {
  constructor(motionSystem) {
    this.motion = motionSystem;
    this.elements = {
      badgeMood: document.getElementById('badge-mood'),
      valBpm: document.getElementById('val-bpm'),
      valRpm: document.getElementById('val-rpm'),
      valKeyRoot: document.getElementById('val-key-root'),
      valKey: document.getElementById('val-key'),
      valBlockHeight: document.getElementById('val-block-height'),
      valProgressPct: document.getElementById('val-progress-pct'),
      progressBarFill: document.getElementById('progress-bar-fill'),
      progressTrack: document.getElementById('progress-track'),
      valSqkMinted: document.getElementById('val-sqk-minted'),
      signalText: document.getElementById('signal-text'),
      signalDot: document.getElementById('signal-dot'),
      statusBanner: document.getElementById('status-banner'),
      bannerMessage: document.getElementById('banner-message'),
      settlementList: document.getElementById('settlement-log-list'),
    };

    this.settlementRows = [];
  }

  updateTelemetry(statusData, bpm, keyInfo, mood) {
    if (!statusData) return;

    // 1. Mood
    if (this.elements.badgeMood) {
      this.elements.badgeMood.className = `readout-value mood-display ${mood}`;
      this.elements.badgeMood.textContent = mood.toUpperCase();
    }

    // 2. Rolling BPM & RPM
    if (this.elements.valBpm) {
      this.motion.rollNumber(this.elements.valBpm, String(bpm));
    }
    if (this.elements.valRpm) {
      const rpmStr = (statusData.rpm || 0).toFixed(1);
      this.motion.rollNumber(this.elements.valRpm, rpmStr);
    }

    // 3. Key & Scale
    if (this.elements.valKeyRoot && keyInfo) {
      this.elements.valKeyRoot.textContent = keyInfo.rootName;
    }
    if (this.elements.valKey) {
      let scaleLabel = 'Minor Pentatonic';
      if (mood === 'jog') scaleLabel = 'Dorian';
      if (mood === 'zoomies') scaleLabel = 'Mixolydian';
      this.elements.valKey.textContent = scaleLabel;
    }

    // 4. Block Height
    if (this.elements.valBlockHeight) {
      const blockStr = `#${statusData.blockHeight ?? 0}`;
      this.motion.rollNumber(this.elements.valBlockHeight, blockStr);
    }

    // 5. Block Progress
    const progressPct = Math.min(100, Math.max(0, Math.round((statusData.blockProgressRatio || 0) * 100)));
    if (this.elements.valProgressPct) {
      this.elements.valProgressPct.textContent = `${progressPct}%`;
    }
    if (this.elements.progressBarFill) {
      this.elements.progressBarFill.style.width = `${progressPct}%`;
    }
    if (this.elements.progressTrack) {
      this.elements.progressTrack.setAttribute('aria-valuenow', String(progressPct));
    }

    // 6. Signal & Status Banner
    this.updateSignalStatus(statusData);
  }

  updateSignalStatus(statusData) {
    if (!this.elements.signalText || !this.elements.signalDot) return;

    if (!statusData.isAvailable || statusData.freshness === 'stale' || statusData.freshness === 'unavailable') {
      this.elements.signalDot.className = 'signal-indicator-dot unknown';
      this.elements.signalText.textContent = statusData.freshness === 'stale' ? 'stale' : 'unknown';
      if (this.elements.statusBanner) {
        this.elements.statusBanner.classList.add('visible');
        if (this.elements.bannerMessage) {
          this.elements.bannerMessage.textContent = 'Signal unknown. Holding the last known values.';
        }
      }
    } else {
      this.elements.signalDot.className = 'signal-indicator-dot live';
      this.elements.signalText.textContent = 'live';
      if (this.elements.statusBanner) {
        this.elements.statusBanner.classList.remove('visible');
      }
    }
  }

  updateEconomy(economyData) {
    if (!economyData || !this.elements.valSqkMinted) return;
    if (economyData.totalMintedSQK !== undefined) {
      const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(economyData.totalMintedSQK);
      this.elements.valSqkMinted.textContent = `${formatted} SQK`;
    }
  }

  addSettlementEntry(timeStr, roundNum, workUnits) {
    if (!this.elements.settlementList) return;

    const row = document.createElement('li');
    row.className = 'settlement-log-row new-entry';
    row.innerHTML = `<span>${timeStr}</span> <span>Round ${roundNum}</span> <span>+${workUnits} work</span>`;

    this.settlementRows.unshift(row);
    if (this.settlementRows.length > 6) {
      this.settlementRows.pop();
    }

    this.elements.settlementList.innerHTML = '';
    this.settlementRows.forEach((r) => this.elements.settlementList.appendChild(r));
  }
}

