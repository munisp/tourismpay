/**
 * Decentralised Identity (DID) + Verifiable Credentials router
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { didDocuments, verifiableCredentials } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";

function generateDid(userId: string | number): string {
  return `did:tourismpay:${String(userId)}-${Date.now().toString(36)}`;
}

export const identityRouter = router({
  // Get the user's DID document (or null if not yet created)
  getDid: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(didDocuments)
      .where(eq(didDocuments.userId, String(ctx.user.id)));
    return row ?? null;
  }),

  // Create a new DID for the user
  createDid: protectedProcedure.mutation(async ({ ctx }) => {
    await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.IDENTITY, ACTIONS.CREATE);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const did = generateDid(ctx.user.id);
    const doc = {
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: "JsonWebKey2020",
          controller: did,
        },
      ],
      authentication: [`${did}#key-1`],
    };
    const [row] = await db
      .insert(didDocuments)
      .values({
        userId: String(ctx.user.id),
        did,
        didDocument: JSON.stringify(doc),
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }),

  // List verifiable credentials for the user
  listCredentials: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(verifiableCredentials)
      .where(eq(verifiableCredentials.userId, String(ctx.user.id)));
  }),

  // Issue a new verifiable credential
  issueCredential: protectedProcedure
    .input(
      z.object({
        type: z.string().min(1).max(200),
        issuer: z.string().min(1).max(200),
        subject: z.string().min(1).max(500),
        credentialData: z.record(z.string(), z.unknown()),
        expiresAt: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [row] = await db
        .insert(verifiableCredentials)
        .values({
          userId: String(ctx.user.id),
          type: input.type,
          issuer: input.issuer,
          subject: input.subject,
          credentialData: JSON.stringify(input.credentialData),
          expiresAt: input.expiresAt,
        })
        .returning();
      return row;
    }),

  // Revoke a credential
  revokeCredential: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db
        .update(verifiableCredentials)
        .set({ status: "revoked", revokedAt: Math.floor(Date.now() / 1000) })
        .where(
          and(
            eq(verifiableCredentials.id, input.id),
            eq(verifiableCredentials.userId, String(ctx.user.id))
          )
        );
      return { success: true };
    }),

  // Stats for the DIDWallet page
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { hasDid: false, totalCredentials: 0, activeCredentials: 0, revokedCredentials: 0 };
    const [didRow] = await db
      .select()
      .from(didDocuments)
      .where(eq(didDocuments.userId, String(ctx.user.id)));
    const creds = await db
      .select()
      .from(verifiableCredentials)
      .where(eq(verifiableCredentials.userId, String(ctx.user.id)));
    return {
      hasDid: !!didRow,
      did: didRow?.did,
      totalCredentials: creds.length,
      activeCredentials: creds.filter((c) => c.status === "active").length,
      revokedCredentials: creds.filter((c) => c.status === "revoked").length,
    };
  }),
});
