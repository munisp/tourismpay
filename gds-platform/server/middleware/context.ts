/**
 * tRPC context — extracts authenticated GDS user from JWT.
 */
import { inferAsyncReturnType } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";
import type { GDSUser } from "../../shared/types";

const JWT_SECRET = process.env.GDS_JWT_SECRET || "gds-dev-secret-32chars-minimum!!";

export async function createContext({ req }: CreateExpressContextOptions) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  let user: GDSUser | null = null;

  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET) as GDSUser;
    } catch {
      // Invalid token — proceed unauthenticated
    }
  }

  return { user, req };
}

export type Context = inferAsyncReturnType<typeof createContext>;
