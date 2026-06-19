/**
 * Multi-Recipient Tipping Router
 * Enables tipping multiple individuals with custom per-recipient amounts,
 * equal splits, or percentage-based allocation. Supports direct wallet-to-wallet
 * transfers with individual receipts per recipient.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, createUserNotification, createAuditLog } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { publishAuditEvent } from "../_core/kafka";

// ─── Types ──────────────────────────────────────────────────────────────────

const recipientSchema = z.object({
  recipientId: z.string(),
  recipientName: z.string(),
  role: z.string(),
  amount: z.number().min(0).default(0),
  percentage: z.number().min(0).max(100).default(0),
  walletId: z.string().optional(),
  message: z.string().max(200).optional(),
});

const splitModeSchema = z.enum(["equal", "custom_amount", "custom_percent"]);

// ─── Service Type Templates ─────────────────────────────────────────────────

const SERVICE_ROLE_TEMPLATES: Record<string, { role: string; label: string; suggestedPct: number }[]> = {
  restaurant: [
    { role: "server", label: "Server/Waiter", suggestedPct: 50 },
    { role: "chef", label: "Chef/Cook", suggestedPct: 25 },
    { role: "bartender", label: "Bartender", suggestedPct: 15 },
    { role: "host", label: "Host/Hostess", suggestedPct: 10 },
  ],
  hotel: [
    { role: "concierge", label: "Concierge", suggestedPct: 30 },
    { role: "housekeeping", label: "Housekeeping", suggestedPct: 30 },
    { role: "bellhop", label: "Bellhop/Porter", suggestedPct: 20 },
    { role: "valet", label: "Valet", suggestedPct: 20 },
  ],
  safari: [
    { role: "guide", label: "Safari Guide", suggestedPct: 40 },
    { role: "driver", label: "Driver", suggestedPct: 25 },
    { role: "tracker", label: "Tracker", suggestedPct: 20 },
    { role: "camp_staff", label: "Camp Staff", suggestedPct: 15 },
  ],
  tour: [
    { role: "guide", label: "Tour Guide", suggestedPct: 50 },
    { role: "driver", label: "Driver", suggestedPct: 30 },
    { role: "assistant", label: "Assistant", suggestedPct: 20 },
  ],
  spa: [
    { role: "therapist", label: "Therapist", suggestedPct: 60 },
    { role: "attendant", label: "Attendant", suggestedPct: 25 },
    { role: "reception", label: "Reception", suggestedPct: 15 },
  ],
  transport: [
    { role: "driver", label: "Driver", suggestedPct: 70 },
    { role: "assistant", label: "Assistant/Mate", suggestedPct: 30 },
  ],
  nightlife: [
    { role: "bartender", label: "Bartender", suggestedPct: 40 },
    { role: "server", label: "Server", suggestedPct: 30 },
    { role: "dj", label: "DJ/Entertainment", suggestedPct: 15 },
    { role: "security", label: "Security/Doorman", suggestedPct: 15 },
  ],
};

// Jurisdiction-level tax-on-tip rules (mirrors tipping.ts config)
const JURISDICTION_TIP_TAX: Record<string, { taxOnTip: boolean; tipTaxRate: number; minTipLocal: number }> = {
  NG: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 50 },
  KE: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 10 },
  ZA: { taxOnTip: true, tipTaxRate: 15, minTipLocal: 5 },
  GH: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 5 },
  TZ: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 500 },
  EG: { taxOnTip: true, tipTaxRate: 14, minTipLocal: 20 },
  MA: { taxOnTip: true, tipTaxRate: 20, minTipLocal: 10 },
  RW: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 200 },
  UG: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 1000 },
  ET: { taxOnTip: false, tipTaxRate: 0, minTipLocal: 20 },
};

// Jurisdiction-specific cultural tip amounts (per-person/day for tourism services)
const JURISDICTION_TIP_GUIDANCE: Record<string, Record<string, string>> = {
  TZ: { safari: "$15-20/day per guide, $10-15/day per driver, $8-10/day per porter" },
  RW: { safari: "$10-20 per gorilla trek guide, $5-10 per tracker/porter" },
  EG: { tour: "EGP 100-200 per guide/day, EGP 50 per driver, EGP 20-50 for small services (baksheesh)" },
  KE: { safari: "$10-20/day per guide, $10/day per driver, $5-10/day per cook" },
  MA: { tour: "MAD 50-100 per guide/day, MAD 20-30 per driver, round up for hammam attendants" },
  ZA: { tour: "R50-100 per guide, R20-50 for car guards, 10-15% at restaurants" },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function calculateDistributions(
  splitMode: "equal" | "custom_amount" | "custom_percent",
  netTip: number,
  recipients: { recipientId: string; recipientName: string; role: string; amount: number; percentage: number; message?: string }[]
) {
  const n = recipients.length;
  if (n === 0) return [];

  switch (splitMode) {
    case "equal": {
      const perPerson = Math.round(netTip / n * 100) / 100;
      const remainder = Math.round((netTip - perPerson * n) * 100) / 100;
      return recipients.map((r, i) => ({
        recipientId: r.recipientId,
        recipientName: r.recipientName,
        role: r.role,
        amount: i === 0 ? Math.round((perPerson + remainder) * 100) / 100 : perPerson,
        percentage: Math.round(100 / n * 10) / 10,
        message: r.message,
      }));
    }
    case "custom_percent": {
      const totalPct = recipients.reduce((s, r) => s + r.percentage, 0);
      const result = recipients.map(r => {
        const normalizedPct = totalPct > 0 ? r.percentage / totalPct * 100 : 100 / n;
        return {
          recipientId: r.recipientId,
          recipientName: r.recipientName,
          role: r.role,
          amount: Math.round(netTip * normalizedPct / 100 * 100) / 100,
          percentage: Math.round(normalizedPct * 10) / 10,
          message: r.message,
        };
      });
      // Fix rounding on last
      const sumOthers = result.slice(0, -1).reduce((s, r) => s + r.amount, 0);
      result[result.length - 1].amount = Math.round((netTip - sumOthers) * 100) / 100;
      return result;
    }
    case "custom_amount": {
      const sumCustom = recipients.reduce((s, r) => s + r.amount, 0);
      const scale = sumCustom > 0 ? netTip / sumCustom : 1;
      return recipients.map(r => ({
        recipientId: r.recipientId,
        recipientName: r.recipientName,
        role: r.role,
        amount: Math.round(r.amount * scale * 100) / 100,
        percentage: netTip > 0 ? Math.round(r.amount * scale / netTip * 100 * 10) / 10 : 0,
        message: r.message,
      }));
    }
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const multiTippingRouter = router({
  // Get suggested recipients/roles for a service type
  suggestRecipients: protectedProcedure
    .input(z.object({
      jurisdictionCode: z.string().length(2),
      serviceType: z.string().default("restaurant"),
      billAmount: z.number().min(0).optional(),
    }))
    .query(({ input }) => {
      const roles = SERVICE_ROLE_TEMPLATES[input.serviceType] ?? SERVICE_ROLE_TEMPLATES.restaurant;
      const guidance = JURISDICTION_TIP_GUIDANCE[input.jurisdictionCode.toUpperCase()]?.[input.serviceType] ?? "";
      return {
        serviceType: input.serviceType,
        jurisdictionCode: input.jurisdictionCode.toUpperCase(),
        roles,
        culturalGuidance: guidance,
        supportedServiceTypes: Object.keys(SERVICE_ROLE_TEMPLATES),
      };
    }),

  // Calculate multi-tip distribution (preview before sending)
  calculate: protectedProcedure
    .input(z.object({
      jurisdictionCode: z.string().length(2),
      billAmount: z.number().min(0),
      totalTipAmount: z.number().min(0).default(0),
      tipPercentage: z.number().min(0).max(100).default(15),
      splitMode: splitModeSchema,
      recipients: z.array(recipientSchema).min(1).max(20),
      currency: z.string().max(5).optional(),
    }))
    .query(({ input }) => {
      let totalTip = input.totalTipAmount;
      if (totalTip <= 0) {
        totalTip = Math.round(input.billAmount * input.tipPercentage / 100 * 100) / 100;
      }
      if (totalTip <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Tip amount must be positive" });

      const distributions = calculateDistributions(input.splitMode, totalTip, input.recipients);
      const currency = input.currency ?? "NGN";

      return {
        totalTip,
        netTip: totalTip,
        grandTotal: Math.round((input.billAmount + totalTip) * 100) / 100,
        currency,
        splitMode: input.splitMode,
        recipientCount: input.recipients.length,
        distributions,
      };
    }),

  // Send multi-tip — executes wallet transfers to all recipients
  send: protectedProcedure
    .input(z.object({
      jurisdictionCode: z.string().length(2),
      billAmount: z.number().min(0),
      totalTipAmount: z.number().positive(),
      splitMode: splitModeSchema,
      recipients: z.array(recipientSchema).min(1).max(20),
      currency: z.string().max(5),
      establishmentId: z.number().optional(),
      transactionRef: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const totalTip = input.totalTipAmount;
      const jCode = input.jurisdictionCode.toUpperCase();
      const taxConfig = JURISDICTION_TIP_TAX[jCode] ?? { taxOnTip: false, tipTaxRate: 0, minTipLocal: 0 };

      // Validate minimum tip per recipient
      const minPerRecipient = taxConfig.minTipLocal * 0.1; // 10% of smallest suggested flat
      const distributions = calculateDistributions(input.splitMode, totalTip, input.recipients);
      for (const dist of distributions) {
        if (dist.amount < minPerRecipient && dist.amount > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Each recipient must receive at least ${minPerRecipient} ${input.currency} (recipient "${dist.recipientName}" would get ${dist.amount})` });
        }
      }

      // Tax-on-tip calculation
      const taxOnTipAmount = taxConfig.taxOnTip ? Math.round(totalTip * taxConfig.tipTaxRate) / 100 : 0;
      const totalCharge = Math.round((totalTip + taxOnTipAmount) * 100) / 100;

      // Check sender balance
      const walletRows = await db.execute(
        sql`SELECT balance FROM wallet_balances WHERE user_id = ${ctx.user.id} AND currency = ${input.currency} LIMIT 1`
      );
      const balance = parseFloat((walletRows as any[])[0]?.balance ?? "0");
      if (balance < totalCharge) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Insufficient ${input.currency} balance. Available: ${balance}, Required: ${totalCharge} (tip: ${totalTip} + tax: ${taxOnTipAmount})` });
      }

      // Create group record
      const groupId = crypto.randomUUID();
      const now = Date.now();
      await db.execute(sql`
        INSERT INTO multi_tip_groups (id, payer_id, establishment_id, bill_amount, total_tip, currency, jurisdiction_code, split_mode, recipient_count, transaction_ref, status, created_at)
        VALUES (${groupId}, ${String(ctx.user.id)}, ${input.establishmentId ?? null}, ${input.billAmount}, ${totalTip}, ${input.currency}, ${input.jurisdictionCode.toUpperCase()}, ${input.splitMode}, ${distributions.length}, ${input.transactionRef ?? null}, 'completed', ${now})
      `);

      // Create individual tip records + wallet credits
      const receipts: { recipientName: string; amount: number; receipt: string }[] = [];
      for (const dist of distributions) {
        const tipId = crypto.randomUUID();
        const receipt = `MTIP-${input.jurisdictionCode.toUpperCase()}-${Date.now()}-${tipId.slice(0, 4)}`;

        await db.execute(sql`
          INSERT INTO multi_tip_recipients (id, group_id, recipient_id, recipient_name, role, amount, percentage, message, receipt_ref, status, created_at)
          VALUES (${tipId}, ${groupId}, ${dist.recipientId}, ${dist.recipientName}, ${dist.role}, ${dist.amount}, ${dist.percentage}, ${dist.message ?? null}, ${receipt}, 'credited', ${now})
        `);

        // Credit recipient wallet
        await db.execute(sql`
          UPDATE wallet_balances SET balance = balance + ${dist.amount}, updated_at = ${now}
          WHERE user_id = ${parseInt(dist.recipientId) || 0} AND currency = ${input.currency}
        `).catch(() => {
          // Recipient might not have a wallet — create one or skip
        });

        // Notify each recipient
        createUserNotification({
          userId: parseInt(dist.recipientId) || 0,
          category: "wallet",
          title: `You received a tip of ${dist.amount} ${input.currency}!`,
          content: dist.message
            ? `${ctx.user.name ?? "A customer"} tipped you ${dist.amount} ${input.currency} (${dist.role}): "${dist.message}"`
            : `${ctx.user.name ?? "A customer"} tipped you ${dist.amount} ${input.currency} for ${dist.role} service. Thank you!`,
          actionUrl: "/wallet",
          actionLabel: "View Wallet",
        }).catch(() => {});

        receipts.push({ recipientName: dist.recipientName, amount: dist.amount, receipt });
      }

      // Debit sender wallet (tip + tax)
      await db.execute(sql`
        UPDATE wallet_balances SET balance = balance - ${totalCharge}, updated_at = ${now}
        WHERE user_id = ${ctx.user.id} AND currency = ${input.currency}
      `);

      // Audit trail
      await createAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || String(ctx.user.id),
        action: "multi_tip.send",
        entityType: "multi_tip_group",
        entityId: groupId,
        after: {
          totalTip,
          taxOnTip: taxOnTipAmount,
          totalCharge,
          currency: input.currency,
          jurisdiction: jCode,
          recipientCount: distributions.length,
          splitMode: input.splitMode,
          recipients: distributions.map(d => ({ name: d.recipientName, amount: d.amount })),
        },
      });
      publishAuditEvent("multi_tip.send", { groupId, totalTip, taxOnTip: taxOnTipAmount, recipientCount: distributions.length, jurisdiction: jCode }).catch(() => {});

      // Award loyalty points (3 pts per recipient tipped)
      const loyaltyPoints = Math.max(1, distributions.length * 3);
      await db.execute(sql`
        UPDATE loyalty_accounts SET points_balance = points_balance + ${loyaltyPoints}, lifetime_points = lifetime_points + ${loyaltyPoints}, updated_at = ${now}
        WHERE user_id = ${String(ctx.user.id)}
      `).catch(() => {});

      return {
        groupId,
        totalTip,
        taxOnTip: taxOnTipAmount,
        totalCharge,
        currency: input.currency,
        recipientCount: distributions.length,
        distributions,
        receipts,
        loyaltyPointsEarned: loyaltyPoints,
        message: taxOnTipAmount > 0
          ? `Multi-tip of ${totalTip} ${input.currency} (+ ${taxOnTipAmount} tax) distributed to ${distributions.length} recipients!`
          : `Multi-tip of ${totalTip} ${input.currency} distributed to ${distributions.length} recipients!`,
      };
    }),

  // Get multi-tip history for current user
  history: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20), offset: z.number().default(0) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { groups: [], total: 0 };
      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const groups = await db.execute(sql`
        SELECT * FROM multi_tip_groups WHERE payer_id = ${String(ctx.user.id)}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `);
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM multi_tip_groups WHERE payer_id = ${String(ctx.user.id)}
      `);

      const groupsWithRecipients = await Promise.all(
        (groups as any[]).map(async (g) => {
          const recipients = await db.execute(sql`
            SELECT * FROM multi_tip_recipients WHERE group_id = ${g.id} ORDER BY amount DESC
          `);
          return {
            id: g.id,
            billAmount: parseFloat(g.bill_amount),
            totalTip: parseFloat(g.total_tip),
            currency: g.currency,
            jurisdictionCode: g.jurisdiction_code,
            splitMode: g.split_mode,
            recipientCount: Number(g.recipient_count),
            status: g.status,
            createdAt: Number(g.created_at),
            recipients: (recipients as any[]).map(r => ({
              recipientName: r.recipient_name,
              role: r.role,
              amount: parseFloat(r.amount),
              percentage: parseFloat(r.percentage),
              receipt: r.receipt_ref,
            })),
          };
        })
      );

      return {
        groups: groupsWithRecipients,
        total: Number((countResult as any[])[0]?.cnt ?? 0),
      };
    }),

  // Get staff list for an establishment (for recipient selection)
  getEstablishmentStaff: protectedProcedure
    .input(z.object({ establishmentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { staff: [] };

      // Get staff from accepted invites
      const rows = await db.execute(sql`
        SELECT si.accepted_by_user_id, si.email, si.role, u.name
        FROM staff_invites si
        LEFT JOIN users u ON u.id = si.accepted_by_user_id
        WHERE si.establishment_id = ${input.establishmentId} AND si.status = 'accepted'
        ORDER BY si.role, u.name
      `);

      return {
        staff: (rows as any[]).map(r => ({
          userId: String(r.accepted_by_user_id ?? 0),
          name: r.name ?? r.email,
          role: r.role ?? "staff",
          email: r.email,
        })),
      };
    }),
});
