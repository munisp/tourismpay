import { defineConfig } from "drizzle-kit";
// LOCAL_DATABASE_URL takes precedence — allows switching from TiDB to local PostgreSQL
const connectionString = process.env.LOCAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL (or LOCAL_DATABASE_URL) is required to run drizzle commands");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
