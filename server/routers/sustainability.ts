/**
 * Sustainability / Carbon Offsets router
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { carbonOffsets } from "../../drizzle/schema";
import { eq, desc, sum } from "drizzle-orm";

// Carbon offset projects catalogue (static reference data)
export const OFFSET_PROJECTS = [
  { id: "proj-001", name: "Kariba REDD+ Forest Protection", country: "ZW", pricePerTon: 12.5, category: "forestry" },
  { id: "proj-002", name: "Kenya Wind Energy", country: "KE", pricePerTon: 9.0, category: "renewable" },
  { id: "proj-003", name: "Nigeria Clean Cookstoves", country: "NG", pricePerTon: 7.5, category: "clean_energy" },
  { id: "proj-004", name: "Tanzania Mangrove Restoration", country: "TZ", pricePerTon: 15.0, category: "blue_carbon" },
  { id: "proj-005", name: "Ghana Solar Mini-Grids", country: "GH", pricePerTon: 8.0, category: "renewable" },
];

export const sustainabilityRouter = router({
  // List available offset projects
  listProjects: protectedProcedure.query(() => {
    return OFFSET_PROJECTS;
  }),

  // Get user's purchased offsets
  myOffsets: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(carbonOffsets)
      .where(eq(carbonOffsets.userId, String(ctx.user.id)))
      .orderBy(desc(carbonOffsets.createdAt));
  }),

  // Purchase a carbon offset
  purchaseOffset: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        amountTons: z.number().positive().max(1000),
        vintageYear: z.number().int().min(2020).max(2030).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const project = OFFSET_PROJECTS.find((p) => p.id === input.projectId);
      if (!project) throw new Error("Project not found");
      const costUsd = (input.amountTons * project.pricePerTon).toFixed(2);
      const [row] = await db
        .insert(carbonOffsets)
        .values({
          userId: String(ctx.user.id),
          amount: String(input.amountTons),
          projectName: project.name,
          projectCountry: project.country,
          costUsd,
          vintageYear: input.vintageYear ?? new Date().getFullYear(),
        })
        .returning();
      return row;
    }),

  // Stats for the Sustainability page
  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { totalOffsetTons: 0, totalSpentUsd: 0, purchaseCount: 0 };
    const rows = await db
      .select()
      .from(carbonOffsets)
      .where(eq(carbonOffsets.userId, String(ctx.user.id)));
    const totalOffsetTons = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
    const totalSpentUsd = rows.reduce((s, r) => s + parseFloat(r.costUsd), 0);
    return {
      totalOffsetTons: Math.round(totalOffsetTons * 100) / 100,
      totalSpentUsd: Math.round(totalSpentUsd * 100) / 100,
      purchaseCount: rows.length,
    };
  }),
});
