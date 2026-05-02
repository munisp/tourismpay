/**
 * itinerary.ts — Tourist itinerary builder router
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  touristItineraries,
  touristItineraryItems,
  establishments,
  itineraryCollaborators,
  itineraryChangelog,
  users,
} from "../../drizzle/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { storagePut } from "../storage";
import crypto from "crypto";

function generateShareToken(): string {
  return crypto.randomBytes(20).toString("base64url").slice(0, 28);
}

function randomSuffix(): string {
  return crypto.randomBytes(4).toString("hex");
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function assertOwner(itineraryId: number, userId: number) {
  const db = await requireDb();
  const [it] = await db
    .select({ id: touristItineraries.id, userId: touristItineraries.userId })
    .from(touristItineraries)
    .where(eq(touristItineraries.id, itineraryId))
    .limit(1);
  if (!it) throw new TRPCError({ code: "NOT_FOUND", message: "Itinerary not found" });
  if (it.userId !== userId) throw new TRPCError({ code: "FORBIDDEN", message: "Not your itinerary" });
  return it;
}

export const itineraryRouter = router({
  /** List all itineraries for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(touristItineraries)
      .where(eq(touristItineraries.userId, ctx.user.id))
      .orderBy(desc(touristItineraries.updatedAt));

    const counts = await db
      .select({
        itineraryId: touristItineraryItems.itineraryId,
        count: sql<number>`count(*)::int`,
      })
      .from(touristItineraryItems)
      .groupBy(touristItineraryItems.itineraryId);

    const countMap = Object.fromEntries(counts.map((c) => [c.itineraryId, c.count]));
    return rows.map((it) => ({ ...it, itemCount: countMap[it.id] ?? 0 }));
  }),

  /** Get a single itinerary with all items and establishment details */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [it] = await db
        .select()
        .from(touristItineraries)
        .where(
          and(
            eq(touristItineraries.id, input.id),
            eq(touristItineraries.userId, ctx.user.id)
          )
        )
        .limit(1);
      if (!it) throw new TRPCError({ code: "NOT_FOUND", message: "Itinerary not found" });

      const items = await db
        .select({
          item: touristItineraryItems,
          establishment: {
            id: establishments.id,
            name: establishments.name,
            type: establishments.type,
            city: establishments.city,
            country: establishments.country,
          },
        })
        .from(touristItineraryItems)
        .leftJoin(establishments, eq(touristItineraryItems.establishmentId, establishments.id))
        .where(eq(touristItineraryItems.itineraryId, input.id))
        .orderBy(
          asc(touristItineraryItems.dayNumber),
          asc(touristItineraryItems.orderInDay)
        );

      const dayMap: Record<number, typeof items> = {};
      for (const row of items) {
        const day = row.item.dayNumber;
        if (!dayMap[day]) dayMap[day] = [];
        dayMap[day].push(row);
      }

      const totalCost = items.reduce(
        (sum, r) => sum + parseFloat(r.item.estimatedCostUsd ?? "0"),
        0
      );

      return {
        ...it,
        days: Object.entries(dayMap)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([day, dayItems]) => ({
            dayNumber: parseInt(day),
            items: dayItems,
            dayCost: dayItems.reduce(
              (s, r) => s + parseFloat(r.item.estimatedCostUsd ?? "0"),
              0
            ),
          })),
        totalCost: Math.round(totalCost * 100) / 100,
        itemCount: items.length,
      };
    }),

  /** Create a new itinerary */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        currency: z.string().max(10).default("USD"),
        isPublic: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [created] = await db
        .insert(touristItineraries)
        .values({
          userId: ctx.user.id,
          title: input.title,
          description: input.description,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          currency: input.currency,
          isPublic: input.isPublic,
          status: "draft",
        })
        .returning();
      return created;
    }),

  /** Update itinerary metadata */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        currency: z.string().max(10).optional(),
        status: z.enum(["draft", "confirmed", "completed", "cancelled"]).optional(),
        isPublic: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.id, ctx.user.id);
      const { id, ...fields } = input;
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (fields.title !== undefined) update.title = fields.title;
      if (fields.description !== undefined) update.description = fields.description;
      if (fields.startDate !== undefined) update.startDate = new Date(fields.startDate);
      if (fields.endDate !== undefined) update.endDate = new Date(fields.endDate);
      if (fields.currency !== undefined) update.currency = fields.currency;
      if (fields.status !== undefined) update.status = fields.status;
      if (fields.isPublic !== undefined) update.isPublic = fields.isPublic;

      const [updated] = await db
        .update(touristItineraries)
        .set(update)
        .where(eq(touristItineraries.id, id))
        .returning();
      return updated;
    }),

  /** Delete an itinerary (cascades to items) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.id, ctx.user.id);
      await db.delete(touristItineraries).where(eq(touristItineraries.id, input.id));
      return { success: true };
    }),

  /** Add an item to an itinerary day */
  addItem: protectedProcedure
    .input(
      z.object({
        itineraryId: z.number(),
        dayNumber: z.number().min(1).max(30),
        title: z.string().min(1).max(255),
        notes: z.string().optional(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        estimatedCostUsd: z.number().min(0).default(0),
        itemType: z
          .enum(["activity", "accommodation", "transport", "meal", "free_time"])
          .default("activity"),
        establishmentId: z.number().optional(),
        bookingId: z.number().optional(),
        dealId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);

      const existing = await db
        .select({ orderInDay: touristItineraryItems.orderInDay })
        .from(touristItineraryItems)
        .where(
          and(
            eq(touristItineraryItems.itineraryId, input.itineraryId),
            eq(touristItineraryItems.dayNumber, input.dayNumber)
          )
        )
        .orderBy(desc(touristItineraryItems.orderInDay))
        .limit(1);

      const nextOrder = existing.length > 0 ? existing[0].orderInDay + 1 : 1;

      const [item] = await db
        .insert(touristItineraryItems)
        .values({
          itineraryId: input.itineraryId,
          dayNumber: input.dayNumber,
          orderInDay: nextOrder,
          title: input.title,
          notes: input.notes,
          startTime: input.startTime,
          endTime: input.endTime,
          estimatedCostUsd: input.estimatedCostUsd.toString(),
          itemType: input.itemType,
          establishmentId: input.establishmentId ?? null,
          bookingId: input.bookingId ?? null,
          dealId: input.dealId ?? null,
          status: "planned",
        })
        .returning();

      await db
        .update(touristItineraries)
        .set({ updatedAt: new Date() })
        .where(eq(touristItineraries.id, input.itineraryId));

      return item;
    }),

  /** Update an itinerary item */
  updateItem: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        itineraryId: z.number(),
        title: z.string().min(1).max(255).optional(),
        notes: z.string().optional(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        estimatedCostUsd: z.number().min(0).optional(),
        itemType: z
          .enum(["activity", "accommodation", "transport", "meal", "free_time"])
          .optional(),
        status: z
          .enum(["planned", "confirmed", "completed", "cancelled"])
          .optional(),
        dayNumber: z.number().min(1).max(30).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);
      const { id, itineraryId, estimatedCostUsd, ...rest } = input;
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (rest.title !== undefined) update.title = rest.title;
      if (rest.notes !== undefined) update.notes = rest.notes;
      if (rest.startTime !== undefined) update.startTime = rest.startTime;
      if (rest.endTime !== undefined) update.endTime = rest.endTime;
      if (estimatedCostUsd !== undefined) update.estimatedCostUsd = estimatedCostUsd.toString();
      if (rest.itemType !== undefined) update.itemType = rest.itemType;
      if (rest.status !== undefined) update.status = rest.status;
      if (rest.dayNumber !== undefined) update.dayNumber = rest.dayNumber;

      const [updated] = await db
        .update(touristItineraryItems)
        .set(update)
        .where(
          and(
            eq(touristItineraryItems.id, id),
            eq(touristItineraryItems.itineraryId, itineraryId)
          )
        )
        .returning();
      return updated;
    }),

  /** Remove an item from an itinerary */
  removeItem: protectedProcedure
    .input(z.object({ id: z.number(), itineraryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);
      await db
        .delete(touristItineraryItems)
        .where(
          and(
            eq(touristItineraryItems.id, input.id),
            eq(touristItineraryItems.itineraryId, input.itineraryId)
          )
        );
      return { success: true };
    }),

  /** Generate a share token and return the public URL */
  share: protectedProcedure
    .input(z.object({ itineraryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const it = await assertOwner(input.itineraryId, ctx.user.id);
      // Reuse existing token or generate a new one
      const [existing] = await db
        .select({ shareToken: touristItineraries.shareToken })
        .from(touristItineraries)
        .where(eq(touristItineraries.id, input.itineraryId))
        .limit(1);
      const token = existing?.shareToken ?? generateShareToken();
      await db
        .update(touristItineraries)
        .set({ shareToken: token, isPublic: true, updatedAt: new Date() })
        .where(eq(touristItineraries.id, input.itineraryId));
      return { shareToken: token };
    }),

  /** Revoke share token (make private again) */
  unshare: protectedProcedure
    .input(z.object({ itineraryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);
      await db
        .update(touristItineraries)
        .set({ shareToken: null, isPublic: false, updatedAt: new Date() })
        .where(eq(touristItineraries.id, input.itineraryId));
      return { success: true };
    }),

  /** Public read-only view by share token */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [it] = await db
        .select()
        .from(touristItineraries)
        .where(and(
          eq(touristItineraries.shareToken, input.token),
          eq(touristItineraries.isPublic, true)
        ))
        .limit(1);
      if (!it) throw new TRPCError({ code: "NOT_FOUND", message: "Itinerary not found or no longer shared" });
      // Load items with establishment info
      const items = await db
        .select({
          item: touristItineraryItems,
          establishment: {
            id: establishments.id,
            name: establishments.name,
            type: establishments.type,
            city: establishments.city,
            country: establishments.country,
          },
        })
        .from(touristItineraryItems)
        .leftJoin(establishments, eq(touristItineraryItems.establishmentId, establishments.id))
        .where(eq(touristItineraryItems.itineraryId, it.id))
        .orderBy(asc(touristItineraryItems.dayNumber), asc(touristItineraryItems.startTime));
      const totalCost = items.reduce((s, r) => s + (Number(r.item.estimatedCostUsd) || 0), 0);
      const dayMap: Record<number, typeof items> = {};
      for (const r of items) {
        if (!dayMap[r.item.dayNumber]) dayMap[r.item.dayNumber] = [];
        dayMap[r.item.dayNumber].push(r);
      }
      return {
        ...it,
        days: Object.entries(dayMap)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([day, dayItems]) => ({
            dayNumber: parseInt(day),
            items: dayItems,
            dayCost: dayItems.reduce((s, r) => s + (Number(r.item.estimatedCostUsd) || 0), 0),
          })),
        totalCost: Math.round(totalCost * 100) / 100,
        itemCount: items.length,
      };
    }),

  /** Invite a co-planner by email */
  inviteCollaborator: protectedProcedure
    .input(
      z.object({
        itineraryId: z.number(),
        email: z.string().email(),
        role: z.enum(["editor", "viewer"]).default("editor"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);
      const inviteToken = crypto.randomBytes(24).toString("base64url").slice(0, 32);
      const [collab] = await db
        .insert(itineraryCollaborators)
        .values({
          itineraryId: input.itineraryId,
          role: input.role,
          inviteToken,
          inviteEmail: input.email,
          acceptedAt: null,
        })
        .returning();
      // Log the action
      await db.insert(itineraryChangelog).values({
        itineraryId: input.itineraryId,
        userId: ctx.user.id,
        action: "invite_collaborator",
        diff: { inviteEmail: input.email, role: input.role },
      });
      return { inviteToken, collaboratorId: collab.id };
    }),

  /** Accept a collaboration invite by token */
  acceptInvite: protectedProcedure
    .input(z.object({ inviteToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [collab] = await db
        .select()
        .from(itineraryCollaborators)
        .where(eq(itineraryCollaborators.inviteToken, input.inviteToken))
        .limit(1);
      if (!collab) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or already used" });
      if (collab.acceptedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invite already accepted" });
      const [updated] = await db
        .update(itineraryCollaborators)
        .set({ userId: ctx.user.id, acceptedAt: new Date(), inviteToken: null })
        .where(eq(itineraryCollaborators.id, collab.id))
        .returning();
      await db.insert(itineraryChangelog).values({
        itineraryId: collab.itineraryId,
        userId: ctx.user.id,
        action: "accept_invite",
        diff: { role: collab.role },
      });
      return { itineraryId: collab.itineraryId, role: updated.role };
    }),

  /** List collaborators for an itinerary */
  getCollaborators: protectedProcedure
    .input(z.object({ itineraryId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      // Must be owner or collaborator
      const [it] = await db
        .select({ userId: touristItineraries.userId })
        .from(touristItineraries)
        .where(eq(touristItineraries.id, input.itineraryId))
        .limit(1);
      if (!it) throw new TRPCError({ code: "NOT_FOUND" });
      const isOwner = it.userId === ctx.user.id;
      if (!isOwner) {
        const [myCollab] = await db
          .select({ id: itineraryCollaborators.id })
          .from(itineraryCollaborators)
          .where(
            and(
              eq(itineraryCollaborators.itineraryId, input.itineraryId),
              eq(itineraryCollaborators.userId, ctx.user.id)
            )
          )
          .limit(1);
        if (!myCollab) throw new TRPCError({ code: "FORBIDDEN" });
      }
      const collabs = await db
        .select({
          id: itineraryCollaborators.id,
          role: itineraryCollaborators.role,
          inviteEmail: itineraryCollaborators.inviteEmail,
          acceptedAt: itineraryCollaborators.acceptedAt,
          userId: itineraryCollaborators.userId,
          userName: users.name,
          userEmail: users.email,
        })
        .from(itineraryCollaborators)
        .leftJoin(users, eq(itineraryCollaborators.userId, users.id))
        .where(eq(itineraryCollaborators.itineraryId, input.itineraryId))
        .orderBy(asc(itineraryCollaborators.createdAt));
      return collabs;
    }),

  /** Remove a collaborator */
  removeCollaborator: protectedProcedure
    .input(z.object({ itineraryId: z.number(), collaboratorId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);
      await db
        .delete(itineraryCollaborators)
        .where(
          and(
            eq(itineraryCollaborators.id, input.collaboratorId),
            eq(itineraryCollaborators.itineraryId, input.itineraryId)
          )
        );
      return { success: true };
    }),

  /** Get the change log for an itinerary */
  getChangelog: protectedProcedure
    .input(z.object({ itineraryId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      // Must be owner or collaborator
      const [it] = await db
        .select({ userId: touristItineraries.userId })
        .from(touristItineraries)
        .where(eq(touristItineraries.id, input.itineraryId))
        .limit(1);
      if (!it) throw new TRPCError({ code: "NOT_FOUND" });
      const isOwner = it.userId === ctx.user.id;
      if (!isOwner) {
        const [myCollab] = await db
          .select({ id: itineraryCollaborators.id })
          .from(itineraryCollaborators)
          .where(
            and(
              eq(itineraryCollaborators.itineraryId, input.itineraryId),
              eq(itineraryCollaborators.userId, ctx.user.id)
            )
          )
          .limit(1);
        if (!myCollab) throw new TRPCError({ code: "FORBIDDEN" });
      }
      const entries = await db
        .select({
          id: itineraryChangelog.id,
          action: itineraryChangelog.action,
          itemId: itineraryChangelog.itemId,
          diff: itineraryChangelog.diff,
          createdAt: itineraryChangelog.createdAt,
          userId: itineraryChangelog.userId,
          userName: users.name,
        })
        .from(itineraryChangelog)
        .leftJoin(users, eq(itineraryChangelog.userId, users.id))
        .where(eq(itineraryChangelog.itineraryId, input.itineraryId))
        .orderBy(desc(itineraryChangelog.createdAt))
        .limit(100);
      return entries;
    }),

  /** Export itinerary as a printable HTML report uploaded to S3 */
  exportPdf: protectedProcedure
    .input(z.object({ itineraryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await assertOwner(input.itineraryId, ctx.user.id);
      const [it] = await db
        .select()
        .from(touristItineraries)
        .where(eq(touristItineraries.id, input.itineraryId))
        .limit(1);
      if (!it) throw new TRPCError({ code: "NOT_FOUND", message: "Itinerary not found" });
      const items = await db
        .select({
          item: touristItineraryItems,
          establishment: {
            id: establishments.id,
            name: establishments.name,
            type: establishments.type,
            city: establishments.city,
            country: establishments.country,
          },
        })
        .from(touristItineraryItems)
        .leftJoin(establishments, eq(touristItineraryItems.establishmentId, establishments.id))
        .where(eq(touristItineraryItems.itineraryId, it.id))
        .orderBy(asc(touristItineraryItems.dayNumber), asc(touristItineraryItems.startTime));

      // Group by day
      const dayMap: Record<number, typeof items> = {};
      for (const r of items) {
        if (!dayMap[r.item.dayNumber]) dayMap[r.item.dayNumber] = [];
        dayMap[r.item.dayNumber].push(r);
      }
      const totalCost = items.reduce((s, r) => s + (Number(r.item.estimatedCostUsd) || 0), 0);

      // Build HTML
      const esc = (s: string | null | undefined) =>
        String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      const dayRows = Object.entries(dayMap)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([day, dayItems]) => {
          const dayCost = dayItems.reduce((s, r) => s + (Number(r.item.estimatedCostUsd) || 0), 0);
          const itemRows = dayItems
            .map(
              (r) => `<tr>
                <td>${esc(r.item.startTime)}${r.item.endTime ? ` – ${esc(r.item.endTime)}` : ""}</td>
                <td><strong>${esc(r.item.title)}</strong>${r.establishment?.name ? `<br/><small>${esc(r.establishment.name)} — ${esc(r.establishment.city ?? "")} ${esc(r.establishment.country ?? "")}</small>` : ""}</td>
                <td>${r.item.estimatedCostUsd != null ? `${esc(it.currency)} ${Number(r.item.estimatedCostUsd).toFixed(2)}` : "—"}</td>
                <td>${esc(r.item.notes)}</td>
              </tr>`
            )
            .join("");
          return `<div class="day-section">
            <div class="day-header">Day ${esc(day)}</div>
            <table><thead><tr><th>Time</th><th>Activity</th><th>Est. Cost</th><th>Notes</th></tr></thead>
            <tbody>${itemRows}</tbody>
            <tfoot><tr><td colspan="2"><strong>Day Total</strong></td><td><strong>${esc(it.currency)} ${dayCost.toFixed(2)}</strong></td><td></td></tr></tfoot>
            </table></div>`;
        })
        .join("");

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
        <title>${esc(it.title)} — TourismPay Itinerary</title>
        <style>
          body{font-family:"Segoe UI",sans-serif;margin:0;padding:32px;color:#1a1a1a;background:#fff;}
          h1{font-size:28px;margin-bottom:4px;color:#0f172a;}
          .meta{font-size:13px;color:#64748b;margin-bottom:24px;}
          .day-section{margin-bottom:32px;}
          .day-header{background:#0f172a;color:#fff;padding:8px 16px;font-weight:700;font-size:15px;border-radius:6px 6px 0 0;}
          table{width:100%;border-collapse:collapse;font-size:13px;}
          th{background:#f1f5f9;padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;}
          td{padding:8px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;}
          tfoot td{background:#f8fafc;font-weight:600;}
          .total-box{margin-top:24px;padding:16px 24px;background:#0f172a;color:#fff;border-radius:8px;display:flex;justify-content:space-between;align-items:center;}
          .footer{margin-top:40px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px;}
          @media print{body{padding:16px;} .day-header{-webkit-print-color-adjust:exact;print-color-adjust:exact;} .total-box{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
        </style></head><body>
        <h1>✈️ ${esc(it.title)}</h1>
        <div class="meta">${it.destination ? `📍 ${esc(it.destination)} &nbsp;•&nbsp; ` : ""}${it.startDate ? `📅 ${new Date(it.startDate).toLocaleDateString()} – ${it.endDate ? new Date(it.endDate).toLocaleDateString() : "TBD"} &nbsp;•&nbsp; ` : ""}${it.description ? `${esc(it.description)}` : ""}</div>
        ${dayRows}
        <div class="total-box"><span>Total Estimated Cost</span><span style="font-size:22px;font-weight:700;">${esc(it.currency)} ${totalCost.toFixed(2)}</span></div>
        <div class="footer">Generated by TourismPay &nbsp;•&nbsp; ${new Date().toLocaleString()} &nbsp;•&nbsp; Ref: itinerary-${it.id}</div>
        </body></html>`;

      const fileKey = `itinerary-exports/${it.id}/trip-${randomSuffix()}.html`;
      const { url } = await storagePut(fileKey, html, "text/html");
      // Persist the export URL
      await db
        .update(touristItineraries)
        .set({ shareExportUrl: url, updatedAt: new Date() })
        .where(eq(touristItineraries.id, input.itineraryId));
      return { exportUrl: url };
    }),
});
