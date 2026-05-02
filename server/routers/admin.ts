import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { users, rolePermissions } from "../../drizzle/schema";

export const adminRouter = router({
  // ─── User Management ────────────────────────────────────────────────────────

  // List all users (admin only)
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
        role: z.enum(["user", "admin", "tourist", "merchant", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"]).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return []; // DB not available — return empty list

      const rows = await db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          role: users.role,
          loginMethod: users.loginMethod,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .limit(input?.limit ?? 50)
        .offset(input?.offset ?? 0)
        .orderBy(users.createdAt);

      const filtered = input?.role
        ? rows.filter(u => u.role === input.role)
        : rows;

      return filtered;
    }),

  // Promote or demote a user's role (admin only)
  setUserRole: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        role: z.enum(["user", "admin", "tourist", "merchant", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.userId === ctx.user.id) {
        throw new Error("Cannot change your own role");
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available — cannot update roles");

      const result = await db
        .update(users)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(users.id, input.userId))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        });

      if (result.length === 0) throw new Error("User not found");
      return result[0];
    }),

  // Get platform-wide stats (admin only)
  platformStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        totalUsers: 0,
        adminUsers: 0,
        regularUsers: 0,
        recentSignups: 0,
      };
    }

    const allUsers = await db
      .select({ role: users.role, createdAt: users.createdAt })
      .from(users);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      totalUsers: allUsers.length,
      adminUsers: allUsers.filter(u => u.role === "admin").length,
      regularUsers: allUsers.filter(u => u.role === "user").length,
      recentSignups: allUsers.filter(u => u.createdAt >= thirtyDaysAgo).length,
    };
  }),

  // Get current user's own profile (any authenticated user)
  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return ctx.user;

    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    return result[0] ?? ctx.user;
  }),

  /** List role permissions (admin only) */
  listRolePermissions: adminProcedure
    .input(z.object({ role: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.select().from(rolePermissions).limit(200);
      if (input?.role) return rows.filter(r => r.role === input.role);
      return rows;
    }),

  /** Upsert a role permission (admin only) */
  upsertRolePermission: adminProcedure
    .input(z.object({
      role: z.string(),
      resource: z.string(),
      action: z.string(),
      granted: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [row] = await db.insert(rolePermissions).values({
        role: input.role as any,
        resource: input.resource,
        action: input.action,
        granted: input.granted,
      }).onConflictDoNothing().returning();
      return row ?? { success: true };
    }),
});
