/**
 * Squeektoshi Radio - Squeek NFT Card UI & Avatars
 *
 * Renders Squeek cards safely without innerHTML for untrusted metadata:
 * - Skeleton placeholder cards during fetch
 * - Images rendered only via <img> with img.decode()
 * - Procedural dot-grid avatar fallback using encoded SVG data URI
 * - Zero emoji or banned icons
 * - Card selection callback for Squeek Spotlight
 */

const INSTRUMENT_NAMES = {
  1: 'Pluck Guitar',
  2: 'FM Chime Bell',
  3: 'Wood Marimba',
  4: 'Detuned Synth Pad',
  5: 'Vibrato Solo Lead',
};

/**
 * Generates an SVG dot-grid avatar data URI for a Squeek token ID.
 * @param {string|number} tokenId
 * @returns {string} Encoded data URI
 */
export function generateDotGridAvatarDataUri(tokenId) {
  const idNum = Number(tokenId) || 1;
  const hue = (idNum * 137.5) % 360;
  let dots = '';

  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 5; y++) {
      const symX = x > 2 ? 4 - x : x;
      const bit = (idNum >> (symX * 5 + y)) & 1;
      if (bit || (x === 2 && y === 2)) {
        dots += `<circle cx="${x * 12 + 10}" cy="${y * 12 + 10}" r="4.5" fill="hsl(${hue}, 80%, 65%)" />`;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 68 68" width="68" height="68"><rect width="68" height="68" fill="#181822" rx="4" />${dots}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Creates an empty hairline card skeleton for honest loading states.
 * @param {number} index
 * @returns {HTMLElement}
 */
export function createCardSkeleton(index) {
  const card = document.createElement('article');
  card.className = 'squeek-card skeleton-card';
  card.id = `squeek-skeleton-${index}`;
  card.setAttribute('aria-busy', 'true');

  const avatarSlot = document.createElement('div');
  avatarSlot.className = 'squeek-avatar skeleton-avatar';
  card.appendChild(avatarSlot);

  const infoSlot = document.createElement('div');
  infoSlot.className = 'skeleton-info';

  const line1 = document.createElement('div');
  line1.className = 'skeleton-line short';
  const line2 = document.createElement('div');
  line2.className = 'skeleton-line';

  infoSlot.appendChild(line1);
  infoSlot.appendChild(line2);
  card.appendChild(infoSlot);

  return card;
}

/**
 * Renders or updates a card element with full token data safely.
 * @param {object} token
 * @param {(token: object) => void} [onSpotlight]
 * @returns {HTMLElement}
 */
export function createSqueekCard(token, onSpotlight = null) {
  const card = document.createElement('article');
  card.className = 'squeek-card';
  card.id = `squeek-card-${token.tokenId}`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `Squeek #${token.tokenId}, Level ${token.level}`);

  // Avatar Container
  const avatarContainer = document.createElement('div');
  avatarContainer.className = 'squeek-avatar';

  const img = document.createElement('img');
  img.alt = `Squeek #${token.tokenId}`;
  img.loading = 'lazy';
  img.style.opacity = '0';
  img.style.transition = 'opacity 0.3s ease';

  const imgSrc =
    token.metadata?.imageUrl ||
    token.metadata?.imageDataUri ||
    token.metadata?.cardImageUrl ||
    generateDotGridAvatarDataUri(token.tokenId);

  img.onload = () => {
    img.style.opacity = '1';
  };
  img.onerror = () => {
    img.src = generateDotGridAvatarDataUri(token.tokenId);
    img.style.opacity = '1';
  };

  img.src = imgSrc;

  // Safe image decoding before reveal if supported
  if (typeof img.decode === 'function') {
    img.decode().then(() => {
      img.style.opacity = '1';
    }).catch(() => {
      // Handled by onerror or fallback
    });
  }

  avatarContainer.appendChild(img);
  card.appendChild(avatarContainer);

  // Content Container (Text Content Only - Zero innerHTML injection)
  const content = document.createElement('div');
  content.className = 'squeek-card-content';

  const header = document.createElement('div');
  header.className = 'squeek-id';
  header.textContent = `#${token.tokenId} `;

  const lvlSpan = document.createElement('span');
  lvlSpan.style.color = 'var(--color-amber)';
  lvlSpan.style.fontSize = '0.7rem';
  lvlSpan.textContent = `LVL ${token.level}`;
  header.appendChild(lvlSpan);

  const voice = document.createElement('div');
  voice.className = 'squeek-voice';
  voice.textContent = INSTRUMENT_NAMES[token.level] || INSTRUMENT_NAMES[5];

  const power = document.createElement('div');
  power.className = 'squeek-power';
  const panValue = ((token.numericTokenId % 16) - 7.5) / 7.5;
  const panLabel = panValue < -0.2 ? 'PAN L' : panValue > 0.2 ? 'PAN R' : 'CENTER';
  power.textContent = `${token.numericBasePower || 1000} PWR · ${panLabel}`;

  const custody = document.createElement('div');
  custody.className = 'squeek-custody';
  custody.style.fontSize = '0.62rem';
  custody.style.color = 'var(--color-bone-muted)';
  custody.style.textTransform = 'uppercase';
  custody.textContent = token.custody || 'wallet';

  content.appendChild(header);
  content.appendChild(voice);
  content.appendChild(power);
  content.appendChild(custody);
  card.appendChild(content);

  // Spotlight Click Handler
  const triggerSpotlight = () => {
    document.querySelectorAll('.squeek-card.spotlight').forEach((c) => c.classList.remove('spotlight'));
    card.classList.add('spotlight');
    if (onSpotlight) onSpotlight(token);
  };

  card.addEventListener('click', triggerSpotlight);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      triggerSpotlight();
    }
  });

  return card;
}

/**
 * Pulses the visual activity indicator on a Squeek card when sounding.
 * @param {string|number} tokenId
 */
export function pulseCardActivity(tokenId) {
  const card = document.getElementById(`squeek-card-${tokenId}`);
  if (!card) return;

  card.classList.add('sounding');
  setTimeout(() => {
    card.classList.remove('sounding');
  }, 220);
}

// Backwards compatibility alias
export const pulseCardGlow = pulseCardActivity;
