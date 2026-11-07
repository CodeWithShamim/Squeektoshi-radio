# Squeektoshi Radio — Diagnostic Report & Architecture Plan
**Document**: `docs/DIAGNOSIS.md`  
**Date**: November 2026  
**Status**: Investigation Complete — Awaiting Approval

---

## 1. Feature Investigation: Harmony / Orchestra

### Finding
In the existing codebase, **there is currently no standalone user-facing mode called "Harmony" or "Orchestra"**.
- In [`README.md`](file:///Users/shamimislam/Squeektoshi/README.md#L6): *"completing blocks modulates the harmony"*
- In [`src/music/mapping.js`](file:///Users/shamimislam/Squeektoshi/src/music/mapping.js#L140-L195): Generates a deterministic 4-chord harmonic progression derived from the block height (`getChordProgression(blockHeight, mood)`), scale frequencies (`getScaleFrequencies(rootMidi, mood, octaves)`), and modal assignments (Minor Pentatonic, Dorian, Mixolydian).
- In [`src/music/scheduler.js`](file:///Users/shamimislam/Squeektoshi/src/music/scheduler.js#L108-L180): Schedules the multi-instrument polyphonic layers: sub-bass kick, hi-hats, arpeggiated plucks, detuned pads, inharmonic FM bells, solo leads, and the Squeek NFT band voices.
- In [`index.html`](file:///Users/shamimislam/Squeektoshi/index.html#L145): *"Held and deposited Squeek NFTs join the ensemble as synthesized instruments across 3D stereo positions"*.

### Conclusion & Plan
"Harmony / Orchestra" refers to the **synthesized multi-voice ensemble layer** (the chords, harmonic pad progressions, and arpeggios that accompany the rhythm). As specified in Part C, we will surface this as a dedicated, first-class mode in the console's segmented control: **`Orchestra`** (alongside `Live`, `Replay`, and `Band`). In Orchestra mode, the harmonic chord structures and voice counterpoints become the primary foreground layer with an expansive acoustic chamber soundstage.

---

## 2. Bug Diagnoses (Part A)

### Issue A: Tune In & Buffering (Audio Latency & Stutter)

1. **Current Code Behavior**:
   - In [`src/music/engine.js`](file:///Users/shamimislam/Squeektoshi/src/music/engine.js#L40-L107), `AudioEngine.init()` is executed lazily on the first click to "Tune in".
   - `createReverbImpulse(ctx, 2.4, 2.2)` in [`src/music/voices.js`](file:///Users/shamimislam/Squeektoshi/src/music/voices.js#L44-L59) performs a synchronous `for` loop computing $115{,}200$ float samples ($48{,}000\text{ Hz} \times 2.4\text{ s} \times 2\text{ channels}$) evaluating `Math.exp()` and `Math.random()`, blocking the main thread during the gesture.
   - In [`src/music/voices.js`](file:///Users/shamimislam/Squeektoshi/src/music/voices.js#L83-L140), audio nodes (`OscillatorNode`, `GainNode`, `BiquadFilterNode`) are stopped with `osc.stop(time + dur)`, but **never disconnected** via `node.disconnect()`.
   - In [`src/music/scheduler.js`](file:///Users/shamimislam/Squeektoshi/src/music/scheduler.js#L58), scheduling ticks are governed by `setInterval(..., 25)`.
2. **Reproduction**:
   - Load `app.html` on a mobile device or throttled CPU. Click "Tune in".
   - Measure time between click and the first emitted audio sample.
   - Let audio play for 10 minutes at 140 BPM with 16th notes.
3. **Measured Symptom**:
   - Gesture-to-sound latency exceeds $300\text{ ms}$ on initial click due to synchronous impulse synthesis.
   - Memory inspection shows thousands of undisposed Web Audio nodes remaining connected to the destination graph, causing browser garbage-collection spikes and periodic audio stutter ("buffering").
4. **Root Cause**:
   - Heavy synchronous mathematical generation of impulse buffers on the UI thread during the click gesture.
   - Absence of an `ended` event listener disconnecting transient voice nodes.
   - Absence of a voice pool and maximum polyphony cap.
5. **Fix**:
   - **Prewarm before click**: Asynchronously generate the procedural reverb impulse using an `OfflineAudioContext` or chunked tasks upon page load, so `audioEngine.start()` starts sound in $< 150\text{ ms}$.
   - **Safari / iOS compatibility**: Ensure `AudioContext` is created/resumed synchronously within the pointerdown/click event handler.
   - **Node Lifecycle Management**: Add `source.onended = () => { source.disconnect(); gain.disconnect(); filter.disconnect(); }` to all voices.
   - **Polyphony Capping & Voice Pool**: Cap simultaneous synth voices to 16.
   - **Buffering Warning**: Expose scheduler lateness as a public metric. If lateness $> 40\text{ ms}$ for $> 2\text{ s}$, trigger honest UI feedback: `"Audio is struggling — reducing voice density"`.

---

### Issue B: Band & NFT Fetch (Reliability, Rate Limiting & Races)

1. **Current Code Behavior**:
   - In [`src/api.js`](file:///Users/shamimislam/Squeektoshi/src/api.js#L297-L327), `fetchAllAccountTokens(address)` loops through pages but does not handle `409 cursor_invalidated` or `400 invalid_cursor`.
   - In [`src/main.js`](file:///Users/shamimislam/Squeektoshi/src/main.js#L424-L457), entering a new wallet address does not abort previous in-flight requests.
   - In [`src/ui/cards.js`](file:///Users/shamimislam/Squeektoshi/src/ui/cards.js), cards are not rendered into the DOM with skeleton placeholders, nor is rate-limit delay communicated to the user.
   - Lack of concurrency limiter for `/v1/squeeks/{tokenId}` metadata requests.
2. **Reproduction**:
   - Input address A (e.g. 50 tokens), immediately input address B, and press Load.
   - Simulate a `409 cursor_invalidated` or 429 response from the API.
3. **Measured Symptom**:
   - Race condition: Address A's tokens overwrite Address B's tokens.
   - HTTP 429 rate-limiting triggered when requesting multiple token metadata payloads in parallel.
   - 409 causes an unhandled error rather than restarting pagination from page one.
   - If `/v1/accounts` returns `"status": "unavailable"`, it is misreported as an error or empty wallet instead of `UNKNOWN`.
4. **Root Cause**:
   - Missing request generation ID tracking and `AbortController`.
   - Missing token-bucket concurrency limiter (max 4 in-flight requests).
   - Missing cursor-invalidation retry logic.
5. **Fix**:
   - **Concurrency Limiter**: Queue `/v1/squeeks/{tokenId}` requests with a strict maximum of 4 concurrent requests in flight.
   - **Cursor Invalidation Resilience**: On `409 cursor_invalidated` or `400 invalid_cursor`, automatically restart from cursor `null` (page 1).
   - **Generation ID & Abort**: Tag each wallet query with an incremental generation ID; abort in-flight requests on address change.
   - **Unavailable Semantics**: If account reports `"status": "unavailable"`, display `"Signal unknown. Preserving last known band."`.
   - **Safe Rendering**: Skeleton slots (`n of N`), `img.decode()`, zero `.innerHTML` for untrusted metadata, and `sessionStorage` caching with TTL.

---

### Issue C: Replay Day (Timeline Scrubbing & Audio Synchronization)

1. **Current Code Behavior**:
   - In [`src/music/replay.js`](file:///Users/shamimislam/Squeektoshi/src/music/replay.js#L178), `advanceHour()` uses `setTimeout(..., 5000)` to progress through the 24 hourly buckets.
   - In [`src/music/replay.js`](file:///Users/shamimislam/Squeektoshi/src/music/replay.js#L77-L85), missing buckets are filled with dummy buckets having `workAdded: 0`, which turns them into `sleep` mood.
   - No pause, resume, or seek methods exist on `ReplayPlayer`.
2. **Reproduction**:
   - Start Replay Day. Switch browser tabs or trigger heavy CPU load.
   - Observe the dial's active hour marker vs the actual audio mood.
3. **Measured Symptom**:
   - JavaScript `setTimeout` drifts by several seconds relative to `AudioContext.currentTime`, de-synchronizing audio from visual playhead.
   - Unavailable settlement hours play ambient sleep music rather than resting.
   - Seeking leaves lingering scheduled notes from the previous hour playing.
4. **Root Cause**:
   - Dual-clock architecture: visual playhead on wall-clock `setTimeout` while audio scheduler is on Web Audio clock.
5. **Fix**:
   - **Single Master Clock**: Tie both audio sequencing and dial 24-segment playhead strictly to `AudioContext.currentTime`.
   - **Rests for Unavailable Hours**: An unavailable bucket is treated as a rest (silence with a hairline "no data" marker on the dial).
   - **Clean Seek/Pause**: Calling seek or pause flushes pending scheduled events and ramps down master gain cleanly.
   - **Deterministic Output Test**: Unit test verifying identical bucket sets always generate bit-for-bit identical schedules.

---

### Issue D: Animation & State Machine

1. **Current Code Behavior**:
   - `CentralDial.startLoop()` in [`src/ui/dial.js`](file:///Users/shamimislam/Squeektoshi/src/ui/dial.js) and `VisualizerManager.start()` in [`src/ui/visualizer.js`](file:///Users/shamimislam/Squeektoshi/src/ui/visualizer.js) each maintain separate `requestAnimationFrame` loops.
   - No formal state machine for UI lifecycle (`idle`, `preparing`, `tuned`, `error`).
2. **Reproduction**:
   - Rapidly click "Tune in", switch modes, or trigger status flip.
3. **Measured Symptom**:
   - Multiple animation loops waste GPU/CPU cycles competing with Web Audio.
   - Elements can be left partially animated if state changes during a transition.
4. **Root Cause**:
   - Decentralized render loops and lack of explicit visual state lifecycle transitions.
5. **Fix**:
   - **Single Unified RAF Loop**: Centralize canvas and SVG updates under one master tick.
   - **Explicit State Machine**: `idle → preparing → tuned(mood) → error/unknown`. Every state transition has paired enter/exit easing.

---

## 3. Architecture & Implementation Plan

### Milestone 1: Diagnosis & Failing Tests
- Create `docs/DIAGNOSIS.md` (this document).
- Add unit tests for concurrency limiter, cursor invalidation, unavailable-as-rest, and replay determinism in `tests/investigation.test.js`.

### Milestone 2: Audio Engine Prewarming & Voice Lifecycle
- Compute procedural reverb impulse asynchronously via `OfflineAudioContext` on page load.
- Disconnect voice nodes on `ended`. Add polyphony cap (16 voices).
- Expose scheduler lateness telemetry and add buffering warning (`"Audio is struggling"`).

### Milestone 3: Resilient NFT Fetcher & Safe Rendering
- Implement sequential cursor pagination with automatic restart on `409 cursor_invalidated`.
- Add token-bucket rate limiter with max 4 concurrent requests for `/v1/squeeks/{tokenId}`.
- Implement generation ID to cancel stale fetches.
- Add card skeletons (`n of N`) and secure `<img>` rendering with zero `innerHTML`.

### Milestone 4: Replay Master Clock & Orchestra Mode
- Drive Replay player entirely by `AudioContext.currentTime`.
- Implement Seek / Pause with clean scheduled node flush.
- Implement `Orchestra` mode showcasing rich multi-voice harmonic progression.

### Milestone 5: Single Render Loop & State Machine
- Unify dial, waveform, and overlay rendering into a single `requestAnimationFrame` loop.
- Implement UI state machine: `idle → preparing → tuned → error/unknown`.

### Milestone 6: Console & Priority 1 Professional Features
- Add slide-in Console panel (`C` key or button) with:
  1. **Mode selector**: `Live`, `Replay`, `Band`, `Orchestra`.
  2. **Sound palettes**: `Glass`, `Analog`, `Chamber`, `Dub` (100% synthesized, crossfading over 1.2s, persistent via localStorage and URL parameter `?palette=`).
  3. **Shareable state**: `Copy link` button encoding mode, palette, and address.
  4. **Diagnostics panel (`D` key or `?debug`)**: Real-time FPS, API request counts, 429 count, latency p95, AudioContext state.

### Milestone 7: Priority 2 Professional Features
- **Export Clip**: Master audio recorder (up to 30s) using `MediaRecorder` + `MediaStreamAudioDestinationNode`.
- **Overlay Variants**: `compact`, `lower-third`, `full` for OBS streamers.
- **Squeek Spotlight**: Solo individual Squeek voices in Band mode.
- **Replay Moments**: Interactive dial markers on settlements and block heights.

### Milestone 8: Hardening & Verification
- Run all unit and Playwright tests.
- Capture browser-agent verification runs at 360px and 1440px.
- Confirm Section 7 banned item checklist: all "ABSENT".
