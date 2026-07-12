import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    env: {
      GDS_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/tourismpay",
      NODE_ENV: "development",
    },
  },
});
