import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TitleManager } from '../src/platform/title.js';

describe('Live Tab Title — Pure String Builder & Invariants', () => {
  it('returns base title when idle / not tuned in', () => {
    const title = TitleManager.buildTitle({ isTunedIn: false });
    assert.equal(title, 'Squeektoshi Radio');
  });

  it('formats playing live station string with bpm and block height', () => {
    const title = TitleManager.buildTitle({
      isTunedIn: true,
      mode: 'live',
      isAvailable: true,
      bpm: 112,
      blockHeight: 2366,
    });
    assert.equal(title, 'Squeektoshi Radio · 112 bpm · Block 2366');
  });

  it('formats unknown signal string honestly without zeroes or made-up numbers', () => {
    const title1 = TitleManager.buildTitle({
      isTunedIn: true,
      isAvailable: false,
    });
    assert.equal(title1, 'Squeektoshi Radio · signal unknown');

    const title2 = TitleManager.buildTitle({
      isTunedIn: true,
      freshness: 'unavailable',
    });
    assert.equal(title2, 'Squeektoshi Radio · signal unknown');
  });

  it('formats replay and best hour mode with hour timestamp', () => {
    const title1 = TitleManager.buildTitle({
      isTunedIn: true,
      mode: 'replay',
      replayHourText: 'hour 14:00',
    });
    assert.equal(title1, 'Replay · hour 14:00 · Squeektoshi Radio');

    const title2 = TitleManager.buildTitle({
      isTunedIn: true,
      mode: 'replay',
      replayHour: 18,
    });
    assert.equal(title2, 'Replay · hour 18:00 · Squeektoshi Radio');

    const title3 = TitleManager.buildTitle({
      isTunedIn: true,
      isBestHour: true,
      replayHourText: '14:00 – 15:00 UTC',
    });
    assert.equal(title3, 'Replay · 14:00 – 15:00 UTC · Squeektoshi Radio');
  });

  it('contains zero emoji or banned Unicode characters across all states', () => {
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
    const states = [
      { isTunedIn: false },
      { isTunedIn: true, mode: 'live', bpm: 120, blockHeight: 500 },
      { isTunedIn: true, isAvailable: false },
      { isTunedIn: true, mode: 'replay', replayHour: 4 },
      { isTunedIn: true, isBestHour: true, replayHourText: '06:00 UTC' },
    ];

    for (const s of states) {
      const title = TitleManager.buildTitle(s);
      assert.equal(emojiRegex.test(title), false, `Title contains emoji: ${title}`);
    }
  });
});

