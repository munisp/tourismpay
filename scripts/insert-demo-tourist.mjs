import postgres from "/home/ubuntu/tourismpay-pwa/node_modules/.pnpm/postgres@3.4.8/node_modules/postgres/src/index.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Read DATABASE_URL from the running server's env (injected by platform)
// The server exposes it via process.env when running under tsx
const dbUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("No DATABASE_URL found in environment");
  process.exit(1);
}

const sql = postgres(dbUrl, { ssl: "require", max: 1 });

// Show columns
const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position`;
console.log("Columns:", cols.map(r => r.column_name).join(", "));

// Check if demo user already exists
const existing = await sql`SELECT id FROM users WHERE email = 'amara.diallo@demo.com' LIMIT 1`;
if (existing.length > 0) {
  console.log("Demo tourist user already exists, id:", existing[0].id);
  await sql.end();
  process.exit(0);
}

// Insert demo tourist user
const [user] = await sql`
  INSERT INTO users (open_id, name, email, login_method, role, onboarding_completed, theme, preferred_language, preferred_currency)
  VALUES ('demo_tourist_001', 'Amara Diallo', 'amara.diallo@demo.com', 'demo', 'user', false, 'dark', 'en', 'USD')
  RETURNING id
`;
console.log("Inserted demo tourist user, id:", user.id);

await sql.end();
