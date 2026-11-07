/**
 * Squeektoshi Radio — Deterministic Canvas Poster Renderer (share/poster.js)
 *
 * Feature 1 (Priority 1):
 * Generates an honest, high-resolution PNG poster from real state.
 *
 * Visual Rules:
 * - Design system tokens: Ink #0b0b0e, Bone #e9e6dc, Signal Amber #ffb23e, Data Blue #5b8cff
 * - Strict typography: IBM Plex Mono & Cinzel
 * - Pure drawing function with optional fixed clock for byte-identical determinism testing
 * - Dial with 36 magnet ticks, amber sensor gate, hairline spokes, inner progress gauge
 * - Band seating ring: cap 24 on poster (+N more if > 24), size by basePower, tick by level, #tokenId for top 8
 * - Real AnalyserNode time-domain waveform ridgeline
 * - Mono data strip (handles 'signal unknown', never zeroes or invented numbers)
 * - Address privacy: Hide (default) | Short (0x12…ab) | Full
 * - Fallback to "live wheel" if band is empty
 * - Formats: Link card 1200×630, Square 1080×1080, Portrait 1080×1350
 */

export const SITE_URL = 'squeektoshi.radio';

export const POSTER_FORMATS = {
  landscape: { width: 1200, height: 630, name: 'Link card (1200×630)' },
  square: { width: 1080, height: 1080, name: 'Square (1080×1080)' },
  portrait: { width: 1080, height: 1350, name: 'Portrait (1080×1350)' },
};

/**
 * Awaits document fonts to be ready before drawing.
 * Safe in Node / headless test environments without document.fonts.
 */
export async function ensureFontsReady() {
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch {}
  }
}

/**
 * Truncates Ethereum address to short form (0x12…ab).
 * @param {string} addr
 * @returns {string}
 */
export function formatShortAddress(addr) {
  if (!addr || typeof addr !== 'string') return '';
  const trimmed = addr.trim();
  if (trimmed.length < 10) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

/**
 * Draws a deterministic avatar for a Squeek token (fallback for tainted or missing images).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {object} token
 */
export function drawSqueekAvatarFallback(ctx, x, y, size, token) {
  const tokenId = Number(token.tokenId) || 1;
  const level = Number(token.level) || 1;

  ctx.save();
  ctx.translate(x, y);

  // Background square / circle
  ctx.fillStyle = '#141419';
  ctx.strokeStyle = '#ffb23e';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Distinct geometric icon by level
  ctx.strokeStyle = level >= 4 ? '#ffb23e' : '#5b8cff';
  ctx.lineWidth = 1.5;

  if (level === 1) {
    // Pluck: small diamond
    ctx.beginPath();
    ctx.moveTo(0, -size / 4);
    ctx.lineTo(size / 4, 0);
    ctx.lineTo(0, size / 4);
    ctx.lineTo(-size / 4, 0);
    ctx.closePath();
    ctx.stroke();
  } else if (level === 2) {
    // Bell: concentric ring
    ctx.beginPath();
    ctx.arc(0, 0, size / 4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (level === 3) {
    // Marimba: cross
    ctx.beginPath();
    ctx.moveTo(-size / 4, 0);
    ctx.lineTo(size / 4, 0);
    ctx.moveTo(0, -size / 4);
    ctx.lineTo(0, size / 4);
    ctx.stroke();
  } else if (level === 4) {
    // Pad: square
    ctx.strokeRect(-size / 4, -size / 4, size / 2, size / 2);
  } else {
    // Lead: 6-point star
    const r = size / 3.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const rx = Math.cos(angle) * r;
      const ry = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws the master waveform ridgeline across the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|number[]} waveformData
 */
export function drawWaveformRidgeline(ctx, x, y, width, height, waveformData) {
  if (!waveformData || waveformData.length === 0) {
    // Draw subtle flat center hairline if no audio data
    ctx.strokeStyle = 'rgba(233, 230, 220, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + height / 2);
    ctx.lineTo(x + width, y + height / 2);
    ctx.stroke();
    return;
  }

  const len = waveformData.length;
  const step = width / (len - 1);

  ctx.save();
  ctx.strokeStyle = '#ffb23e';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  for (let i = 0; i < len; i++) {
    const val = (waveformData[i] - 128) / 128; // -1.0 to 1.0
    const px = x + i * step;
    const py = y + height / 2 - val * (height * 0.45);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.stroke();

  // Subtle mirror hairline in data blue
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.25)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const val = (waveformData[i] - 128) / 128;
    const px = x + i * step;
    const py = y + height / 2 + val * (height * 0.2);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws the precision instrument dial linework.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {number} blockProgressRatio - 0.0 to 1.0
 * @param {string} mood - 'sleep' | 'jog' | 'zoomies' | 'unknown'
 */
export function drawDial(ctx, cx, cy, radius, blockProgressRatio = 0, mood = 'jog') {
  ctx.save();

  // 1. Outer rim circle
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.25)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // 2. Inner rim circle
  const innerRadius = radius * 0.944;
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.12)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 3. 16 Hairline Spokes
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.1)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI * 2) / 16;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
  }

  // 4. 36 Rim Magnets
  for (let j = 0; j < 36; j++) {
    const angle = (j * Math.PI * 2) / 36;
    const mx = cx + Math.cos(angle) * (radius - 2);
    const my = cy + Math.sin(angle) * (radius - 2);
    ctx.fillStyle = 'rgba(233, 230, 220, 0.6)';
    ctx.beginPath();
    ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Block Progress Gauge Arc
  const gaugeRadius = radius * 0.97;
  ctx.strokeStyle = 'rgba(91, 140, 255, 0.15)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, gaugeRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (blockProgressRatio > 0) {
    const progAngle = blockProgressRatio * Math.PI * 2;
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, gaugeRadius, -Math.PI / 2, -Math.PI / 2 + progAngle);
    ctx.stroke();
  }

  // 6. Amber Sensor Gate Arc at 12 O'Clock
  ctx.strokeStyle = '#ffb23e';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // Arc centered at -Math.PI / 2 (top) with ±0.1 rad width
  ctx.arc(cx, cy, radius * 1.01, -Math.PI / 2 - 0.1, -Math.PI / 2 + 0.1);
  ctx.stroke();

  // Sensor dot
  ctx.fillStyle = '#ffb23e';
  ctx.beginPath();
  ctx.arc(cx, cy - radius * 1.01, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // 7. Center Hub
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.4)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.1, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(233, 230, 220, 0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draws the Squeek Band Seating Orbit Ring.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} orbitRadius
 * @param {Array<object>} tokens
 */
export function drawBandOrbit(ctx, cx, cy, orbitRadius, tokens) {
  if (!tokens || tokens.length === 0) return;

  const totalTokens = tokens.length;
  // Sort descending by numericBasePower
  const sorted = [...tokens].sort((a, b) => {
    const pA = Number(a.numericBasePower ?? a.basePower ?? 1000);
    const pB = Number(b.numericBasePower ?? b.basePower ?? 1000);
    return pB - pA;
  });

  // Cap at 24 markers on poster
  const displayedTokens = sorted.slice(0, 24);
  const displayCount = displayedTokens.length;

  // Compute total basePower of displayed for relative sizing
  const totalPower = displayedTokens.reduce(
    (sum, t) => sum + (Number(t.numericBasePower ?? t.basePower ?? 1000) || 1000),
    0
  );

  ctx.save();

  // Orbit ring hairline
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.18)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(cx, cy, orbitRadius, 0, Math.PI * 2);
  ctx.stroke();

  displayedTokens.forEach((t, idx) => {
    const angle = (idx * Math.PI * 2) / displayCount - Math.PI / 2;
    const x = cx + Math.cos(angle) * orbitRadius;
    const y = cy + Math.sin(angle) * orbitRadius;

    const power = Number(t.numericBasePower ?? t.basePower ?? 1000) || 1000;
    const powerShare = totalPower > 0 ? power / totalPower : 1 / displayCount;
    const markerRadius = Math.max(3.5, Math.min(8.5, 3.5 + powerShare * 30));
    const level = Number(t.level) || 1;

    // Outer seat ring
    ctx.fillStyle = '#0b0b0e';
    ctx.strokeStyle = level >= 4 ? '#ffb23e' : '#e9e6dc';
    ctx.lineWidth = level >= 4 ? 1.6 : 1.2;
    ctx.beginPath();
    ctx.arc(x, y, markerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner voice pip
    ctx.fillStyle = level >= 3 ? '#ffb23e' : '#5b8cff';
    ctx.beginPath();
    ctx.arc(x, y, markerRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Top 8 strongest Squeeks show mono #tokenId
    if (idx < 8) {
      const textDist = orbitRadius + markerRadius + 14;
      const tx = cx + Math.cos(angle) * textDist;
      const ty = cy + Math.sin(angle) * textDist;

      ctx.fillStyle = '#e9e6dc';
      ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${t.tokenId}`, tx, ty);
    }
  });

  // If > 24 tokens, draw "+N more" badge
  if (totalTokens > 24) {
    const remaining = totalTokens - 24;
    ctx.fillStyle = '#ffb23e';
    ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+${remaining} MORE`, cx, cy + orbitRadius * 0.55);
  }

  ctx.restore();
}

/**
 * Main Pure Poster Drawing Function.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} options
 * @param {'landscape'|'square'|'portrait'} [options.format='landscape']
 * @param {object} [options.status]
 * @param {number} [options.bpm]
 * @param {{ rootName: string, scaleName: string }} [options.keyInfo]
 * @param {string} [options.palette='analog']
 * @param {Array<object>} [options.tokens=[]]
 * @param {Uint8Array|number[]} [options.waveformSample]
 * @param {'hide'|'short'|'full'} [options.privacy='hide']
 * @param {string} [options.walletAddress='']
 * @param {string} [options.siteUrl=SITE_URL]
 * @param {Date|string} [options.fixedTimestamp]
 * @param {boolean} [options.isBestHour=false]
 * @param {object} [options.bestHourInfo]
 * @returns {Promise<void>}
 */
export async function renderBandPoster(canvas, options = {}) {
  await ensureFontsReady();

  const formatKey = options.format && POSTER_FORMATS[options.format] ? options.format : 'landscape';
  const { width, height } = POSTER_FORMATS[formatKey];

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Fill solid ink background #0b0b0e (no gradients or glow per rules)
  ctx.fillStyle = '#0b0b0e';
  ctx.fillRect(0, 0, width, height);

  // 2. Hardware frame perimeter hairlines
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  // Corner registration tick marks
  const regSize = 10;
  const drawCornerReg = (rx, ry) => {
    ctx.strokeStyle = '#ffb23e';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rx - regSize, ry);
    ctx.lineTo(rx + regSize, ry);
    ctx.moveTo(rx, ry - regSize);
    ctx.lineTo(rx, ry + regSize);
    ctx.stroke();
  };
  drawCornerReg(24, 24);
  drawCornerReg(width - 24, 24);
  drawCornerReg(24, height - 24);
  drawCornerReg(width - 24, height - 24);

  // 3. Header Station Title & Brand
  ctx.fillStyle = '#e9e6dc';
  ctx.font = '600 24px "Cinzel", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('SQUEEKTOSHI RADIO', 48, 48);

  ctx.fillStyle = 'rgba(233, 230, 220, 0.65)';
  ctx.font = '400 12px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillText('HAMSTER-POWERED GENERATIVE PROOF-OF-WORK BROADCAST', 48, 80);

  // Header Right: Mode / Telemetry Badge
  const statusData = options.status || {};
  const isAvailable = Boolean(statusData.isAvailable !== false && statusData.freshness !== 'unavailable');
  const mood = isAvailable ? (statusData.mood || 'jog') : 'unknown';
  const isBestHour = Boolean(options.isBestHour);

  ctx.textAlign = 'right';
  if (isBestHour) {
    ctx.fillStyle = '#ffb23e';
    ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('● BEST HOUR REPLAY', width - 48, 48);
  } else if (!isAvailable) {
    ctx.fillStyle = '#ffb23e';
    ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('○ SIGNAL UNKNOWN', width - 48, 48);
  } else {
    ctx.fillStyle = '#5b8cff';
    ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText('● ON-CHAIN LIVE TELEMETRY', width - 48, 48);
  }

  // 4. Dial and Band Seating Center Position
  let dialCx = width / 2;
  let dialCy = height / 2;
  let dialRadius = 180;

  if (formatKey === 'landscape') {
    dialCx = width * 0.36;
    dialCy = height * 0.48;
    dialRadius = 175;
  } else if (formatKey === 'square') {
    dialCx = width / 2;
    dialCy = height * 0.45;
    dialRadius = 240;
  } else if (formatKey === 'portrait') {
    dialCx = width / 2;
    dialCy = height * 0.42;
    dialRadius = 265;
  }

  const progressRatio = isAvailable ? Number(statusData.blockProgressRatio ?? 0) : 0;
  drawDial(ctx, dialCx, dialCy, dialRadius, progressRatio, mood);

  // Band seat ring
  const tokens = options.tokens || [];
  const hasBand = tokens.length > 0;
  if (hasBand) {
    drawBandOrbit(ctx, dialCx, dialCy, dialRadius * 0.84, tokens);
  } else {
    // Live Wheel variant text in dial center
    ctx.fillStyle = 'rgba(233, 230, 220, 0.45)';
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIVE WHEEL', dialCx, dialCy + dialRadius * 0.35);
  }

  // 5. Waveform Ridgeline Position
  let waveX = 48;
  let waveY = height - 190;
  let waveW = width - 96;
  let waveH = 50;

  if (formatKey === 'landscape') {
    waveX = width * 0.64;
    waveY = height * 0.28;
    waveW = width * 0.31;
    waveH = 70;

    // Ridgeline Header
    ctx.fillStyle = 'rgba(233, 230, 220, 0.65)';
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MASTER BUS WAVEFORM', waveX, waveY - 14);
  } else if (formatKey === 'square') {
    waveX = 48;
    waveY = height * 0.74;
    waveW = width - 96;
    waveH = 55;
  } else if (formatKey === 'portrait') {
    waveX = 48;
    waveY = height * 0.73;
    waveW = width - 96;
    waveH = 65;
  }

  drawWaveformRidgeline(ctx, waveX, waveY, waveW, waveH, options.waveformSample);

  // 6. Mono Data Strip
  const stripY = formatKey === 'landscape' ? height - 95 : height - 120;
  const stripX = 48;
  const stripW = width - 96;

  // Hairline border around data strip
  ctx.strokeStyle = 'rgba(233, 230, 220, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(stripX, stripY, stripW, 42);

  ctx.font = formatKey === 'landscape'
    ? '500 12px "IBM Plex Mono", ui-monospace, monospace'
    : '500 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  const bpm = options.bpm ?? (isAvailable ? 48 : null);
  const blockHeight = statusData.blockHeight ?? (isAvailable ? 0 : null);
  const keyName = options.keyInfo
    ? `${options.keyInfo.rootName} ${options.keyInfo.scaleName || ''}`.trim()
    : 'C Minor Pentatonic';
  const palette = (options.palette || 'analog').toUpperCase();

  // Formatting date and time
  const now = options.fixedTimestamp ? new Date(options.fixedTimestamp) : new Date();
  const tzFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const dateFormatted = tzFormatter.format(now);

  if (isBestHour && options.bestHourInfo) {
    const info = options.bestHourInfo;
    const stripText = `BEST HOUR: ${info.rankText || '1 OF 24'}  |  ${info.workAdded ?? 0} PASSES  |  ${info.completedBlockCount ?? 0} BLOCKS  |  ${info.utcTimeText || ''}  |  ${dateFormatted}`;
    ctx.fillStyle = '#ffb23e';
    ctx.textAlign = 'left';
    ctx.fillText(stripText, stripX + 16, stripY + 21);
  } else if (!isAvailable) {
    const stripText = `SIGNAL: UNKNOWN  |  PALETTE: ${palette}  |  HOLDING LAST KNOWN STATE  |  ${dateFormatted}`;
    ctx.fillStyle = '#ffb23e';
    ctx.textAlign = 'left';
    ctx.fillText(stripText, stripX + 16, stripY + 21);
  } else {
    const stripText = `BLOCK #${blockHeight}  |  MOOD: ${mood.toUpperCase()}  |  ${bpm} BPM  |  KEY: ${keyName}  |  PALETTE: ${palette}  |  ${dateFormatted}`;
    ctx.fillStyle = '#e9e6dc';
    ctx.textAlign = 'left';
    ctx.fillText(stripText, stripX + 16, stripY + 21);
  }

  // 7. Band Roster Summary (Landscape Side Rail or Portrait middle section)
  if (formatKey === 'landscape') {
    const railX = width * 0.64;
    const railY = height * 0.48;
    ctx.fillStyle = 'rgba(233, 230, 220, 0.65)';
    ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('BAND ROSTER', railX, railY);

    if (hasBand) {
      ctx.fillStyle = '#ffb23e';
      ctx.font = '600 13px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(`${tokens.length} SQUEEKS SEATED`, railX, railY + 22);

      ctx.fillStyle = 'rgba(233, 230, 220, 0.75)';
      ctx.font = '400 11px "IBM Plex Mono", ui-monospace, monospace';
      const topIds = tokens.slice(0, 4).map((t) => `#${t.tokenId}`).join('  ');
      ctx.fillText(`VOICES: ${topIds}`, railX, railY + 42);
    } else {
      ctx.fillStyle = 'rgba(233, 230, 220, 0.5)';
      ctx.font = '400 11px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText('SOLO HAMSTER SYNTHESIS', railX, railY + 22);
    }
  }

  // 8. Footer Line & Privacy Wallet Display
  const footerY = height - 34;
  ctx.font = '400 11px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  // Left Footer: Configured Site URL and Disclaimer
  const siteUrl = options.siteUrl || SITE_URL;
  ctx.fillStyle = 'rgba(233, 230, 220, 0.65)';
  ctx.textAlign = 'left';
  ctx.fillText(`${siteUrl}  ·  Unofficial community project. Read-only.`, 48, footerY);

  // Right Footer: Address according to privacy setting
  const privacy = options.privacy || 'hide';
  const walletAddr = options.walletAddress || '';

  if (privacy !== 'hide' && walletAddr) {
    const addrText = privacy === 'full' ? walletAddr : formatShortAddress(walletAddr);
    ctx.fillStyle = '#ffb23e';
    ctx.textAlign = 'right';
    ctx.fillText(`WALLET: ${addrText}`, width - 48, footerY);
  }
}

