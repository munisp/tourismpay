/**
 * Generates a signed HS256 JWT session cookie for the demo tourist user.
 * Uses Node.js built-in crypto — no external deps needed.
 */
import { createHmac } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const APP_ID = process.env.VITE_APP_ID;

if (!JWT_SECRET || !APP_ID) {
  console.error("JWT_SECRET or VITE_APP_ID not set in environment");
  process.exit(1);
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const exp = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);

const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
const payload = Buffer.from(JSON.stringify({
  openId: "demo_tourist_001",
  appId: APP_ID,
  name: "Amara Diallo",
  exp,
})).toString("base64url");

const signingInput = `${header}.${payload}`;
const sig = createHmac("sha256", JWT_SECRET).update(signingInput).digest("base64url");
const token = `${signingInput}.${sig}`;

console.log("TOKEN:" + token);
