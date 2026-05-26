/**
 * Decentralised Identity (DID) + Verifiable Credentials router.
 *
 * Uses W3C DID Core compliant resolution and Ed25519 key pairs.
 * Supports: did:tourismpay, did:web, did:key methods.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { didDocuments, verifiableCredentials } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  createDidTourismPay,
  resolveDid,
  issueCredential,
  verifyCredential,
  type DIDDocument,
} from "../integrations/didResolver";

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

  // Create a new DID with real Ed25519 key pair (W3C DID Core compliant)
  createDid: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const { didDocument, keyPair } = createDidTourismPay(String(ctx.user.id));
    const [row] = await db
      .insert(didDocuments)
      .values({
        userId: String(ctx.user.id),
        did: didDocument.id,
        didDocument: JSON.stringify(didDocument),
      })
      .onConflictDoNothing()
      .returning();
    return row;
  }),

  // Resolve any DID (did:web, did:key, did:tourismpay)
  resolve: protectedProcedure
    .input(z.object({ did: z.string().startsWith("did:") }))
    .query(async ({ input }) => {
      const doc = await resolveDid(input.did);
      return doc;
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
