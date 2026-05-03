/**
 * Database access with proper error propagation.
 *
 * Instead of the silent-failure `getDbOrNull()` pattern that masks DB errors
 * as empty data, this module throws a TRPCError so the frontend can display
 * a meaningful error state with a retry button.
 */
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";

/**
 * Returns the Drizzle database instance or throws INTERNAL_SERVER_ERROR.
 * Use this in all tRPC procedures instead of `getDbOrNull()`.
 */
export async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database connection unavailable. Please try again.",
    });
  }
  return db;
}
