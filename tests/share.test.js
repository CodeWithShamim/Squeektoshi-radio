import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatShortAddress } from '../src/share/poster.js';
import { ShareCoordinator } from '../src/share/share.js';

describe('Share Flow — Link Encode/Decode & Privacy Invariants', () => {
  it('formats short address (0x12…ab) accurately', () => {
    const full = '0x1234567890abcdef1234567890abcdef12345678';
    assert.equal(formatShortAddress(full), '0x1234…5678');
    assert.equal(formatShortAddress(''), '');
    assert.equal(formatShortAddress(null), '');
  });

  it('omits wallet address completely when privacy is hide (default)', () => {
    // Mock window.location for buildShareUrl test
    globalThis.window = {
      location: new URL('http://localhost:3000/app.html?palette=analog&mode=live'),
    };

    const coordinator = new ShareCoordinator({
      getState: () => ({
        activePalette: 'dub',
        activeMode: 'live',
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        isBestHourActive: false,
      }),
    });

    coordinator.currentPrivacy = 'hide';
    const urlStr = coordinator.buildShareUrl();
    const parsed = new URL(urlStr);

    assert.equal(parsed.searchParams.get('palette'), 'dub');
    assert.equal(parsed.searchParams.get('mode'), 'live');
    // Privacy invariant: wallet parameter MUST be absent
    assert.equal(parsed.searchParams.has('wallet'), false);
  });

  it('includes wallet address only when user explicitly opts into short or full privacy', () => {
    globalThis.window = {
      location: new URL('http://localhost:3000/app.html'),
    };

    const wallet = '0x1234567890abcdef1234567890abcdef12345678';
    const coordinator = new ShareCoordinator({
      getState: () => ({
        activePalette: 'glass',
        activeMode: 'band',
        walletAddress: wallet,
        isBestHourActive: false,
      }),
    });

    // Short privacy
    coordinator.currentPrivacy = 'short';
    const urlShort = new URL(coordinator.buildShareUrl());
    assert.equal(urlShort.searchParams.get('wallet'), wallet);

    // Full privacy
    coordinator.currentPrivacy = 'full';
    const urlFull = new URL(coordinator.buildShareUrl());
    assert.equal(urlFull.searchParams.get('wallet'), wallet);
  });

  it('encodes Best Hour parameters into share link when Best Hour is active', () => {
    globalThis.window = {
      location: new URL('http://localhost:3000/app.html'),
    };

    const coordinator = new ShareCoordinator({
      getState: () => ({
        activePalette: 'chamber',
        activeMode: 'replay',
        isBestHourActive: true,
        bestHourInfo: { hourIndex: 11, utcTimeText: '11:00 – 12:00 UTC' },
        walletAddress: '',
      }),
    });

    coordinator.currentPrivacy = 'hide';
    const url = new URL(coordinator.buildShareUrl());

    assert.equal(url.searchParams.get('mode'), 'replay');
    assert.equal(url.searchParams.get('besthour'), '1');
    assert.equal(url.searchParams.get('hour'), '11');
    assert.equal(url.searchParams.has('wallet'), false);
  });
});

