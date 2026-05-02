/**
 * Users Admin Router
 * Admin-only procedures for user management: list all users, set roles, view stats,
 * and admin impersonation with full audit trail.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createAuditLog } from "../db";
import { users } from "../../drizzle/schema";
import { desc, eq, sql } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { getSessionCookieOptions } from "../_core/cookies";
import { COOKIE_NAME, IMPERSONATION_COOKIE_NAME, IMPERSONATION_SESSION_MS } from "@shared/const";

export const usersAdminRouter = router({
  /**
   * List all registered users (admin only).
   */
  listAll: protectedProcedure
    .input(
      z.object({
        role: z.enum(["user", "admin", "tourist", "merchant", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"]).optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const conditions = input.role ? [eq(users.role, input.role)] : [];

      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          loginMethod: users.loginMethod,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(conditions.length > 0 ? conditions[0] : undefined);

      return { users: rows, total: count };
    }),

  /**
   * Get user stats (admin only).
   */
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [totals] = await db
        .select({
          total: sql<number>`count(*)::int`,
          admins: sql<number>`count(*) filter (where role = 'admin')::int`,
          regularUsers: sql<number>`count(*) filter (where role = 'user')::int`,
          tourists: sql<number>`count(*) filter (where role = 'tourist')::int`,
          merchants: sql<number>`count(*) filter (where role = 'merchant')::int`,
          complianceOfficers: sql<number>`count(*) filter (where role = 'compliance_officer')::int`,
          nocOperators: sql<number>`count(*) filter (where role = 'noc_operator')::int`,
          settlementOfficers: sql<number>`count(*) filter (where role = 'settlement_officer')::int`,
          bisAnalysts: sql<number>`count(*) filter (where role = 'bis_analyst')::int`,
        })
        .from(users);

      return totals;
    }),

  /**
   * Set a user's role (admin only). Cannot demote yourself.
   */
  setRole: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(["user", "admin", "tourist", "merchant", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Fetch the target user first
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target.role === input.role) {
        return { success: true, user: target, message: `User already has role: ${input.role}` };
      }

      const [updated] = await db
        .update(users)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning();

      // Write audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        actorEmail: ctx.user.email ?? "",
        action: "user.role.changed",
        entityType: "user",
        entityId: String(input.userId),
        description: `Role changed from '${target.role}' to '${input.role}' for user ${target.email ?? target.name ?? `#${target.id}`}`,
        before: { role: target.role },
        after: { role: input.role },
      });

      return {
        success: true,
        user: updated,
        message: `User role updated to ${input.role}`,
      };
    }),

  /**
   * Get a single user by ID (admin only).
   */
  getById: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      return user;
    }),

  /**
   * Start impersonating a user (admin only).
   * Saves the admin's original session in a separate cookie, then issues a
   * short-lived session token for the target user.
   */
  startImpersonation: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot impersonate yourself" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
      }
      if (target.role === "admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot impersonate another admin" });
      }

      const cookieOptions = getSessionCookieOptions(ctx.req);

      // Save the admin's current session cookie into the impersonation backup cookie
      const adminSessionCookie = ctx.req.cookies?.[COOKIE_NAME] ??
        ctx.req.headers.cookie?.split(";").find(c => c.trim().startsWith(COOKIE_NAME + "="))?.split("=").slice(1).join("=") ?? "";

      ctx.res.cookie(IMPERSONATION_COOKIE_NAME, adminSessionCookie, {
        ...cookieOptions,
        maxAge: IMPERSONATION_SESSION_MS,
      });

      // Issue a short-lived session token for the target user
      const impersonationToken = await sdk.signSession(
        { openId: target.openId, appId: "", name: target.name ?? "" },
        { expiresInMs: IMPERSONATION_SESSION_MS }
      );

      ctx.res.cookie(COOKIE_NAME, impersonationToken, {
        ...cookieOptions,
        maxAge: IMPERSONATION_SESSION_MS,
      });

      // Audit log
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name ?? "Admin",
        actorEmail: ctx.user.email ?? "",
        action: "admin.impersonation.start",
        entityType: "user",
        entityId: String(target.id),
        description: `Admin ${ctx.user.email ?? ctx.user.name ?? `#${ctx.user.id}`} started impersonating user ${target.email ?? target.name ?? `#${target.id}`}`,
        before: { adminId: ctx.user.id, adminEmail: ctx.user.email },
        after: { targetId: target.id, targetEmail: target.email },
      });

      return {
        success: true,
        targetUser: { id: target.id, name: target.name, email: target.email, role: target.role },
      };
    }),

  /**
   * End impersonation and restore the original admin session.
   */
  endImpersonation: protectedProcedure
    .mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);

      // Retrieve the saved admin session from the impersonation backup cookie
      const adminSession = ctx.req.cookies?.[IMPERSONATION_COOKIE_NAME] ??
        ctx.req.headers.cookie?.split(";").find(c => c.trim().startsWith(IMPERSONATION_COOKIE_NAME + "="))?.split("=").slice(1).join("=") ?? "";

      if (!adminSession) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active impersonation session found" });
      }

      // Restore the admin session
      ctx.res.cookie(COOKIE_NAME, adminSession, {
        ...cookieOptions,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      });

      // Clear the impersonation backup cookie
      ctx.res.clearCookie(IMPERSONATION_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });

      // Audit log (best-effort — we know who was being impersonated from ctx.user)
      try {
        await createAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name ?? "Unknown",
          actorEmail: ctx.user.email ?? "",
          action: "admin.impersonation.end",
          entityType: "user",
          entityId: String(ctx.user.id),
          description: `Impersonation session ended for user ${ctx.user.email ?? ctx.user.name ?? `#${ctx.user.id}`}`,
          before: { impersonatedId: ctx.user.id },
          after: {},
        });
      } catch { /* non-critical */ }

      return { success: true };
    }),

  /**
   * Check if the current request is an impersonation session.
   * Returns the impersonated user info if active.
   */
  impersonationStatus: protectedProcedure
    .query(async ({ ctx }) => {
      // Check if the impersonation backup cookie exists
      const impersonationCookie = ctx.req.cookies?.[IMPERSONATION_COOKIE_NAME] ??
        ctx.req.headers.cookie?.split(";").find(c => c.trim().startsWith(IMPERSONATION_COOKIE_NAME + "="))?.split("=").slice(1).join("=") ?? "";

      if (!impersonationCookie) {
        return { isImpersonating: false, impersonatedUser: null };
      }

      // Verify the backup cookie is a valid admin session
      const adminSession = await sdk.verifySession(impersonationCookie);
      if (!adminSession) {
        return { isImpersonating: false, impersonatedUser: null };
      }

      return {
        isImpersonating: true,
        impersonatedUser: {
          id: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
          role: ctx.user.role,
        },
      };
    }),
});
