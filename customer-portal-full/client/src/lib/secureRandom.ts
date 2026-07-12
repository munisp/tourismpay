/**
 * Cryptographically secure random utilities — drop-in replacements for Math.random()
 * Uses Web Crypto API (available in all modern browsers and Node 19+)
 */

/** Returns a cryptographically secure float in [0, 1) — drop-in for Math.random() */
export function secureRandom(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / 0x100000000;
}

/** Returns a cryptographically secure integer in [0, max) — drop-in for Math.floor(Math.random() * max) */
export function secureRandomInt(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

/** Generates a cryptographically secure random string of given length */
export function secureRandomString(length: number = 16): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(36)).join("").slice(0, length);
}
