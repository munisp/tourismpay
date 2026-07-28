import { defineConfig } from "drizzle-kit";

// LOCAL_DATABASE_URL takes precedence — allows switching from TiDB to local PostgreSQL
const connectionString = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
const isCi = process.env.CI === "true";
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
    "./drizzle/schema-additions.ts",
    "./drizzle/schema-extended.ts",
    "./drizzle/schema-platform.ts",
    "./drizzle/views.ts",
    "./drizzle/schema-gap-services.ts",
  ],
  // schema-constraints.ts is intentionally excluded: it's unused by the running
  // app (only generates ALTER TABLE ADD CONSTRAINT statements for migration
  // 0078) and its compositeIndexes block currently throws at load time
  // (references a table field that resolves to undefined under drizzle-kit's
  // CJS loader). Re-add once that's fixed separately.
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
  // CI runs against an ephemeral PostgreSQL service and cannot answer prompts.
  // Interactive local and production invocations retain the confirmation gate.
  verbose: !isCi,
  strict: !isCi,

  // ─── Migration Table ──────────────────────────────────────────────────────
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
    prefix: "index",
  },
});
