/**
 * drizzle/drizzle.config.ts
 *
 * Drizzle ORM configuration for TourismPay.
 *
 * Features enabled:
 *   - Strict mode: warns on missing relations and type mismatches
 *   - Schema introspection for drizzle-kit studio (visual schema browser)
 *   - Verbose migration output
 *   - Custom migrations directory
 *   - Breakpoints enabled for safe production migrations
 */

import type { Config } from "drizzle-kit";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/tourismpay";

export default {
  // ─── Schema ──────────────────────────────────────────────────────────────
  schema: "./drizzle/schema.ts",
  out: "./drizzle",

  // ─── Driver ──────────────────────────────────────────────────────────────
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },

  // ─── Migration Options ────────────────────────────────────────────────────
  // Breakpoints add `---> statement-breakpoint` comments so drizzle-kit can
  // apply each statement independently, preventing partial migration failures.
  breakpoints: true,

  // ─── Studio (Schema Visualiser) ───────────────────────────────────────────
  // Run: npx drizzle-kit studio
  // Opens a visual schema browser at http://localhost:4983
  // Shows all tables, columns, types, relations, and indexes.
  verbose: true,
  strict: true,
} satisfies Config;
