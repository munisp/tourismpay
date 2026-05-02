/**
 * Staff Invites Router
 * Allows merchants to invite staff (cashier/manager/supervisor) to their establishment.
 * Generates a secure token-based invite link valid for 7 days.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, createUserNotification } from "../db";
import {
  staffInvites,
  establishments,
  users,
} from "../../drizzle/schema";
import { eq, and, desc, gt } from "drizzle-orm";
import { randomBytes } from "crypto";

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(48).toString("hex");
}

function sevenDaysFromNow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const staffInvitesRouter = router({
  /**
   * Create a new staff invite for an establishment.
   * Only the establishment owner (merchant) can invite staff.
   */
  create: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
        email: z.string().email(),
        role: z.enum(["cashier", "manager", "supervisor"]).default("cashier"),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Verify the caller owns this establishment
      const est = await db
        .select({ id: establishments.id, name: establishments.name, ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Establishment not found" });
      }
      if (est[0].ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not own this establishment" });
      }

      // Check for existing pending invite for this email + establishment
      const existing = await db
        .select({ id: staffInvites.id, status: staffInvites.status })
        .from(staffInvites)
        .where(
          and(
            eq(staffInvites.establishmentId, input.establishmentId),
            eq(staffInvites.email, input.email.toLowerCase()),
            eq(staffInvites.status, "pending"),
            gt(staffInvites.expiresAt, new Date())
          )
        )
        .limit(1);

      if (existing.length) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A pending invite already exists for this email address",
        });
      }

      const token = generateToken();
      const expiresAt = sevenDaysFromNow();

      const [invite] = await db
        .insert(staffInvites)
        .values({
          token,
          establishmentId: input.establishmentId,
          inviterUserId: ctx.user.id,
          email: input.email.toLowerCase(),
          role: input.role,
          status: "pending",
          expiresAt,
        })
        .returning();

      const inviteUrl = `${input.origin}/invite/${token}`;

      // Notify the inviter
      await createUserNotification({
        userId: ctx.user.id,
        title: "Staff Invite Sent",
        content: `Invite sent to ${input.email} for ${est[0].name} as ${input.role}. Link expires in 7 days.`,
        category: "system",
        actionUrl: `/merchant/staff`,
      });

      return {
        id: invite.id,
        token: invite.token,
        inviteUrl,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
      };
    }),

  /**
   * List all invites for an establishment (paginated, newest first).
   */
  list: protectedProcedure
    .input(
      z.object({
        establishmentId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      // Verify ownership
      const est = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, input.establishmentId))
        .limit(1);

      if (!est.length || est[0].ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const invites = await db
        .select()
        .from(staffInvites)
        .where(eq(staffInvites.establishmentId, input.establishmentId))
        .orderBy(desc(staffInvites.createdAt))
        .limit(100);

      return invites;
    }),

  /**
   * Revoke a pending invite.
   */
  revoke: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const invite = await db
        .select({
          id: staffInvites.id,
          status: staffInvites.status,
          establishmentId: staffInvites.establishmentId,
        })
        .from(staffInvites)
        .where(eq(staffInvites.id, input.id))
        .limit(1);

      if (!invite.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      // Verify ownership
      const est = await db
        .select({ ownerId: establishments.ownerId })
        .from(establishments)
        .where(eq(establishments.id, invite[0].establishmentId))
        .limit(1);

      if (!est.length || est[0].ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      if (invite[0].status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending invites can be revoked",
        });
      }

      await db
        .update(staffInvites)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(staffInvites.id, input.id));

      return { success: true };
    }),

  /**
   * Get invite details by token (public — used on the accept page).
   */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const invite = await db
        .select({
          id: staffInvites.id,
          token: staffInvites.token,
          email: staffInvites.email,
          role: staffInvites.role,
          status: staffInvites.status,
          expiresAt: staffInvites.expiresAt,
          establishmentId: staffInvites.establishmentId,
        })
        .from(staffInvites)
        .where(eq(staffInvites.token, input.token))
        .limit(1);

      if (!invite.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      const inv = invite[0];

      // Fetch establishment name
      const est = await db
        .select({ name: establishments.name, country: establishments.country })
        .from(establishments)
        .where(eq(establishments.id, inv.establishmentId))
        .limit(1);

      return {
        ...inv,
        establishmentName: est[0]?.name ?? "Unknown Establishment",
        establishmentCountry: est[0]?.country ?? "",
        isExpired: inv.expiresAt < new Date(),
      };
    }),

  /**
   * Accept an invite (authenticated user claims the invite).
   */
  accept: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const invite = await db
        .select()
        .from(staffInvites)
        .where(eq(staffInvites.token, input.token))
        .limit(1);

      if (!invite.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      }

      const inv = invite[0];

      if (inv.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            inv.status === "accepted"
              ? "This invite has already been accepted"
              : inv.status === "revoked"
              ? "This invite has been revoked"
              : "This invite has expired",
        });
      }

      if (inv.expiresAt < new Date()) {
        await db
          .update(staffInvites)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(staffInvites.id, inv.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired" });
      }

      // Mark as accepted
      await db
        .update(staffInvites)
        .set({
          status: "accepted",
          acceptedByUserId: ctx.user.id,
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(staffInvites.id, inv.id));

      // Notify the inviter
      const inviterUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, inv.inviterUserId))
        .limit(1);

      if (inviterUser.length) {
        const est = await db
          .select({ name: establishments.name })
          .from(establishments)
          .where(eq(establishments.id, inv.establishmentId))
          .limit(1);

        await createUserNotification({
          userId: inv.inviterUserId,
          title: "Staff Invite Accepted",
          content: `${ctx.user.name ?? ctx.user.email} accepted the ${inv.role} invite for ${est[0]?.name ?? "your establishment"}.`,
          category: "system",
          actionUrl: `/merchant/staff`,
        });
      }

      return {
        success: true,
        role: inv.role,
        establishmentId: inv.establishmentId,
      };
    }),

  /** Returns establishments where the current user is an accepted staff member */
  myStaffEstablishments: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        id: staffInvites.id,
        role: staffInvites.role,
        establishmentId: staffInvites.establishmentId,
        establishmentName: establishments.name,
        establishmentCountry: establishments.country,
        establishmentType: establishments.type,
        acceptedAt: staffInvites.acceptedAt,
      })
      .from(staffInvites)
      .innerJoin(establishments, eq(establishments.id, staffInvites.establishmentId))
      .where(
        and(
          eq(staffInvites.acceptedByUserId, ctx.user.id),
          eq(staffInvites.status, "accepted")
        )
      );
    return rows;
  }),
});
