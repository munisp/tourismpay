import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

export const travelInsuranceRouter = router({
  // Get insurance products
  getProducts: protectedProcedure.query(async () => {
    return [
      { id: "basic", name: "Basic Trip Protection", coverageUsd: 5000, premiumPct: 3.5, features: ["Trip cancellation", "Medical emergency", "Lost baggage"] },
      { id: "standard", name: "Standard Coverage", coverageUsd: 15000, premiumPct: 5.0, features: ["Trip cancellation", "Medical emergency", "Lost baggage", "Flight delay", "Personal liability"] },
      { id: "premium", name: "Premium Protection", coverageUsd: 50000, premiumPct: 7.5, features: ["All Standard features", "Adventure sports", "Pre-existing conditions", "Cancel for any reason", "Concierge service"] },
    ];
  }),

  // Get a quote
  getQuote: protectedProcedure
    .input(z.object({
      productId: z.enum(["basic", "standard", "premium"]),
      tripCostUsd: z.number().positive(),
      travelDays: z.number().int().min(1).max(365),
      travellers: z.number().int().min(1).max(20),
    }))
    .query(async ({ input }) => {
      const premiumPcts: Record<string, number> = { basic: 3.5, standard: 5.0, premium: 7.5 };
      const premiumPct = premiumPcts[input.productId];
      const basePremium = input.tripCostUsd * (premiumPct / 100);
      const durationMultiplier = input.travelDays > 30 ? 1.2 : 1.0;
      const totalPremiumUsd = Math.round(basePremium * durationMultiplier * input.travellers * 100) / 100;
      return { productId: input.productId, tripCostUsd: input.tripCostUsd, travelDays: input.travelDays, travellers: input.travellers, premiumPct, totalPremiumUsd, currency: "USD" };
    }),

  // Purchase insurance policy
  purchasePolicy: protectedProcedure
    .input(z.object({
      productId: z.string(),
      tripCostUsd: z.number().positive(),
      travelDays: z.number().int().min(1),
      travellers: z.number().int().min(1),
      totalPremiumUsd: z.number().positive(),
      travelStartDate: z.string(),
      destination: z.string(),
      walletTransactionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const policyId = `INS-${Date.now()}`;
      const policyNumber = `TP-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const startDate = new Date(input.travelStartDate);
      const endDate = new Date(startDate.getTime() + input.travelDays * 24 * 60 * 60 * 1000);
      await db.execute(sql`
        INSERT INTO insurance_policies (id, user_id, policy_number, product_id, trip_cost_usd,
          travel_days, travellers, premium_usd, travel_start_date, travel_end_date, destination,
          status, wallet_transaction_id, created_at)
        VALUES (${policyId}, ${String(ctx.user.id)}, ${policyNumber}, ${input.productId},
          ${input.tripCostUsd}, ${input.travelDays}, ${input.travellers}, ${input.totalPremiumUsd},
          ${startDate.toISOString()}, ${endDate.toISOString()}, ${input.destination},
          'active', ${input.walletTransactionId ?? null}, NOW())
      `);
      return { policyId, policyNumber, message: `Insurance policy ${policyNumber} issued. Coverage: USD ${input.tripCostUsd.toLocaleString()}` };
    }),

  // My policies
  myPolicies: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.execute(sql`SELECT * FROM insurance_policies WHERE user_id = ${String(ctx.user.id)} ORDER BY created_at DESC LIMIT 20`);
    return rows as any[];
  }),

  // File a claim
  fileClaim: protectedProcedure
    .input(z.object({
      policyId: z.string(),
      claimType: z.enum(["cancellation", "medical", "baggage", "delay", "liability"]),
      incidentDate: z.string(),
      description: z.string().min(20),
      claimAmountUsd: z.number().positive(),
      evidenceUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const claimId = `CLM-${Date.now()}`;
      const claimRef = `TP-CLM-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await db.execute(sql`
        INSERT INTO insurance_claims (id, policy_id, user_id, claim_ref, claim_type, incident_date,
          description, claim_amount_usd, evidence_urls, status, created_at)
        VALUES (${claimId}, ${input.policyId}, ${String(ctx.user.id)}, ${claimRef},
          ${input.claimType}, ${input.incidentDate}::timestamp, ${input.description},
          ${input.claimAmountUsd}, ${JSON.stringify(input.evidenceUrls ?? [])}::jsonb,
          'submitted', NOW())
      `);
      return { claimId, claimRef, message: `Claim ${claimRef} submitted. Expected review within 5 business days.` };
    }),

  // Admin: claims dashboard
  claimsDashboard: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalClaims: 0, pendingClaims: 0, totalClaimValueUsd: 0 };
    const rows = await db.execute(sql`
      SELECT COUNT(*) as total, SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) as pending,
        SUM(claim_amount_usd) as total_value FROM insurance_claims
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const r = (rows as any[])[0] ?? {};
    return { totalClaims: Number(r.total ?? 0), pendingClaims: Number(r.pending ?? 0), totalClaimValueUsd: Number(r.total_value ?? 0) };
  }),
});
