/**
 * Cryptographically secure random utilities for server-side use
 */
import { randomBytes } from "crypto";

/** Returns a cryptographically secure float in [0, 1) — drop-in for Math.random() */
export function secureRandom(): number {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) / 0x100000000;
}

/** Returns a cryptographically secure integer in [0, max) */
export function secureRandomInt(max: number): number {
  const buf = randomBytes(4);
  return buf.readUInt32BE(0) % max;
}
