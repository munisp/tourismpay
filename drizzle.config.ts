import { defineConfig } from "drizzle-kit";

// LOCAL_DATABASE_URL takes precedence — allows switching from TiDB to local PostgreSQL
const connectionString = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (or LOCAL_DATABASE_URL) is required to run drizzle commands");
}

export default defineConfig({
  // ─── Schema ──────────────────────────────────────────────────────────────
  // Include all schema files so drizzle-kit sees tables, relations, views,
  // check constraints, and indexes defined across all files.
  schema: [
    "./drizzle/schema.ts",
    "./drizzle/schema-improvements.ts",
    "./drizzle/views.ts",
  ],
  out: "./drizzle",

  // ─── Dialect ─────────────────────────────────────────────────────────────
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },

  // ─── Casing ──────────────────────────────────────────────────────────────
  // Ensures drizzle-kit generates snake_case column names in SQL migrations,
  // matching the explicit column name strings already in schema.ts.
  casing: "snake_case",

  // ─── Migration Options ────────────────────────────────────────────────────
  // Breakpoints add `---> statement-breakpoint` comments so drizzle-kit can
  // apply each statement independently, preventing partial migration failures.
  breakpoints: true,

  // ─── Safety & Diagnostics ─────────────────────────────────────────────────
  // verbose: prints every SQL statement before applying it
  verbose: true,
  // strict: prompts for confirmation before applying destructive changes
  strict: true,

  // ─── Migration Table ──────────────────────────────────────────────────────
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
    prefix: "index",
  },
});
