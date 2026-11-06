/**
 * Mulberry32 Seeded Pseudo-Random Number Generator
 *
 * Provides deterministic, shared PRNG sequences for serverless shared listening.
 * Given the same (blockHeight, stepIndex), any two listeners produce the exact same
 * musical note choices at the exact same moment.
 */

/**
 * Creates a Mulberry32 PRNG instance.
 * @param {number} seed - 32-bit unsigned integer seed
 * @returns {() => number} Float in [0, 1)
 */
export function createMulberry32(seed) {
  let a = (seed >>> 0);
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes a deterministic 32-bit integer seed from blockHeight and stepIndex.
 * @param {number} blockHeight
 * @param {number} stepIndex
 * @returns {number}
 */
export function getSharedSeed(blockHeight, stepIndex) {
  const h = (blockHeight || 0) * 1000003;
  const s = (stepIndex || 0) & 0xffffffff;
  return ((h ^ s) >>> 0);
}

/**
 * Select a random element from an array using a PRNG.
 * @template T
 * @param {() => number} prng
 * @param {T[]} array
 * @returns {T}
 */
export function choose(prng, array) {
  if (!array || array.length === 0) return undefined;
  const index = Math.floor(prng() * array.length);
  return array[index];
}

/**
 * Select a random integer between min and max inclusive.
 * @param {() => number} prng
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(prng, min, max) {
  return Math.floor(prng() * (max - min + 1)) + min;
}

