/**
 * Squeektoshi Radio - Squeek NFT Card UI & Avatars
 *
 * Renders Squeek cards with official SVG metadata image or procedural
 * dot-grid avatar fallback, level, voice type, and live playing glow.
 */

const INSTRUMENT_NAMES = {
  1: 'Pluck Guitar',
  2: 'FM Chime Bell',
  3: 'Wood Marimba',
  4: 'Detuned Synth Pad',
  5: 'Vibrato Solo Lead',
};

/**
 * Generates an SVG dot-grid avatar for a Squeek token ID.
 * @param {string|number} tokenId
 * @returns {string} Inline SVG string
 */
export function generateDotGridAvatar(tokenId) {
  const idNum = Number(tokenId) || 1;
  const hue = (idNum * 137.5) % 360; // Golden ratio hue spread
  let dots = '';

  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      // Symmetrical pattern across x axis
      const symX = x > 2 ? 4 - x : x;
      const bit = ((idNum >> (symX * 5 + y)) & 1);
      if (bit || (x === 2 && y === 2)) {
        dots += `<circle cx="${x * 12 + 10}" cy="${y * 12 + 10}" r="4.5" fill="hsl(${hue}, 80%, 65%)" />`;
      }
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="100%" height="100%">
      <rect width="68" height="68" fill="#181822" rx="8" />
      ${dots}
    </svg>
  `;
}

/**
 * Renders a single Squeek NFT card element.
 * @param {object} token
 * @returns {HTMLElement}
 */
export function createSqueekCard(token) {
  const card = document.createElement('article');
  card.className = 'squeek-card';
  card.id = `squeek-card-${token.tokenId}`;
  card.setAttribute('aria-label', `Squeek #${token.tokenId}, Level ${token.level}`);

  const instrumentName = INSTRUMENT_NAMES[token.level] || INSTRUMENT_NAMES[5];
  const panValue = ((token.numericTokenId % 16) - 7.5) / 7.5;
  const panLabel = panValue < -0.2 ? 'Pan L' : panValue > 0.2 ? 'Pan R' : 'Center';

  const avatarContainer = document.createElement('div');
  avatarContainer.className = 'squeek-avatar';

  if (token.metadata?.imageDataUri) {
    const img = document.createElement('img');
    img.src = token.metadata.imageDataUri;
    img.alt = `Squeek #${token.tokenId}`;
    img.loading = 'lazy';
    avatarContainer.appendChild(img);
  } else {
    avatarContainer.innerHTML = generateDotGridAvatar(token.tokenId);
  }

  card.innerHTML = `
    <div class="squeek-id">#${token.tokenId} <span style="font-size: 0.65rem; color: var(--gold-primary);">Lvl ${token.level}</span></div>
    <div class="squeek-voice">${instrumentName}</div>
    <div class="squeek-power">⚡ ${token.numericBasePower} pwr · ${panLabel}</div>
    <div style="font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase;">${token.custody || 'wallet'}</div>
  `;
  card.prepend(avatarContainer);

  return card;
}

/**
 * Pulses the visual glow on a Squeek card when its voice plays.
 * @param {string|number} tokenId
 */
export function pulseCardGlow(tokenId) {
  const card = document.getElementById(`squeek-card-${tokenId}`);
  if (!card) return;

  card.classList.add('playing');
  setTimeout(() => {
    card.classList.remove('playing');
  }, 220);
}

