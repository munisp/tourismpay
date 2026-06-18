/**
 * Database Migration Runner — GDS Standalone
 * Tracks applied migrations in a `gds_migrations` table.
 * Runs pending migrations on startup.
 */
import { query, isDbAvailable } from "./database";
import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.join(__dirname, "../../migrations");

interface Migration {
  id: number;
  name: string;
  applied_at: string;
}

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS gds_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const result = await query("SELECT name FROM gds_migrations ORDER BY id");
  return result.rows.map(r => r.name as string);
}

function getPendingMigrations(applied: string[]): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
  return files.filter(f => !applied.includes(f));
}

export async function runMigrations(): Promise<{ applied: string[]; skipped: string[] }> {
  if (!isDbAvailable()) {
    console.log("[Migrations] Database unavailable, skipping migrations");
    return { applied: [], skipped: [] };
  }

  await ensureMigrationsTable();
  const appliedNames = await getAppliedMigrations();
  const pending = getPendingMigrations(appliedNames);

  if (pending.length === 0) {
    console.log(`[Migrations] All ${appliedNames.length} migrations already applied`);
    return { applied: [], skipped: appliedNames };
  }

  console.log(`[Migrations] ${pending.length} pending migrations to apply`);
  const applied: string[] = [];

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    try {
      await query(sql);
      await query("INSERT INTO gds_migrations (name) VALUES ($1)", [file]);
      console.log(`[Migrations] Applied: ${file}`);
      applied.push(file);
    } catch (err) {
      console.error(`[Migrations] FAILED: ${file}:`, (err as Error).message);
      throw err;
    }
  }

  return { applied, skipped: appliedNames };
}
