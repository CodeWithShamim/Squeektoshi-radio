/**
 * Squeek Band Orbit Ring
 * Places Squeek token seats around the central dial.
 * When a voice sounds, its marker scales and brightens.
 * Displays mono #tokenId tooltip on hover/focus.
 */

export class BandRingManager {
  constructor() {
    this.container = document.getElementById('dial-band-seats');
    this.tooltip = document.getElementById('seat-tooltip');
    this.statusMsg = document.getElementById('band-status-msg');
    this.tokens = [];
  }

  setTokens(tokens) {
    this.tokens = tokens || [];
    if (!this.container) return;

    this.container.innerHTML = '';

    if (this.tokens.length === 0) {
      if (this.statusMsg) {
        this.statusMsg.textContent = 'No Squeeks at this address.';
      }
      return;
    }

    if (this.statusMsg) {
      this.statusMsg.textContent = `Band active: ${this.tokens.length} Squeek voice(s) seated on the dial.`;
    }

    const count = this.tokens.length;
    const center = 300;
    const orbitRadius = 208;

    this.tokens.forEach((token, idx) => {
      const angle = (idx * Math.PI * 2) / count - Math.PI / 2;
      const x = center + Math.cos(angle) * orbitRadius;
      const y = center + Math.sin(angle) * orbitRadius;

      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.setAttribute('id', `seat-group-${token.tokenId}`);
      group.setAttribute('class', 'band-seat-marker');
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `Squeek #${token.tokenId} (Level ${token.level || 1})`);

      // Seat outer marker ring
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '5.5');
      circle.setAttribute('fill', '#0b0b0e');
      circle.setAttribute('stroke', '#e9e6dc');
      circle.setAttribute('stroke-opacity', '0.5');
      circle.setAttribute('stroke-width', '1.2');
      circle.setAttribute('id', `seat-dot-${token.tokenId}`);

      // Inner voice pip
      const pip = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      pip.setAttribute('cx', x);
      pip.setAttribute('cy', y);
      pip.setAttribute('r', '2.2');
      pip.setAttribute('fill', '#5b8cff');

      group.appendChild(circle);
      group.appendChild(pip);

      // Tooltip events
      const showTip = () => {
        if (!this.tooltip) return;
        const voiceNames = ['', 'Pluck', 'Bell Chime', 'Marimba', 'Pad', 'Vibrato Lead'];
        const voiceName = voiceNames[token.level] || 'Lead';
        this.tooltip.textContent = `#${token.tokenId} · Level ${token.level || 1} ${voiceName}`;
        this.tooltip.classList.add('visible');
      };

      const hideTip = () => {
        if (!this.tooltip) return;
        this.tooltip.classList.remove('visible');
      };

      group.addEventListener('mouseenter', showTip);
      group.addEventListener('focus', showTip);
      group.addEventListener('mouseleave', hideTip);
      group.addEventListener('blur', hideTip);

      this.container.appendChild(group);
    });
  }

  highlightVoice(tokenId) {
    const dot = document.getElementById(`seat-dot-${tokenId}`);
    if (!dot) return;

    dot.setAttribute('stroke', '#ffb23e');
    dot.setAttribute('stroke-opacity', '1.0');
    dot.setAttribute('r', '7.5');

    setTimeout(() => {
      dot.setAttribute('stroke', '#e9e6dc');
      dot.setAttribute('stroke-opacity', '0.5');
      dot.setAttribute('r', '5.5');
    }, 280);
  }
}

