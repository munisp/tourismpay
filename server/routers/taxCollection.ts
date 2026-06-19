/**
 * Tax Collection Router — Multi-jurisdiction tax calculation, collection,
 * receipt generation, remittance tracking, and compliance reporting.
 */
import { z } from "zod";
import { protectedProcedure, adminProcedure, settlementProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { publishAuditEvent } from "../_core/kafka";
import { requirePermission, RESOURCES, ACTIONS } from "../_core/permify";

// ─── Jurisdiction Tax Rules ─────────────────────────────────────────────────

interface TaxRule {
  id: string;
  jurisdictionCode: string;
  taxType: string;
  name: string;
  rate: number; // Percentage
  flatAmount: number;
  currency: string;
  appliesToCategory: string;
  minAmount: number;
  maxCap: number;
  isCompound: boolean;
  priority: number;
}

interface JurisdictionInfo {
  code: string;
  name: string;
  currency: string;
  vatRate: number;
  totalEffectiveRate: number;
  taxAuthority: string;
  filingFrequency: string;
  ruleCount: number;
}

const JURISDICTION_TAX_RULES: Record<string, TaxRule[]> = {
  NG: [
    { id: "ng-vat", jurisdictionCode: "NG", taxType: "VAT", name: "Nigeria VAT", rate: 7.5, flatAmount: 0, currency: "NGN", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "ng-tourism", jurisdictionCode: "NG", taxType: "TOURISM_LEVY", name: "Tourism Development Levy", rate: 5.0, flatAmount: 0, currency: "NGN", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
    { id: "ng-service", jurisdictionCode: "NG", taxType: "SERVICE_CHARGE", name: "Service Charge", rate: 5.0, flatAmount: 0, currency: "NGN", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 3 },
    { id: "ng-withholding", jurisdictionCode: "NG", taxType: "WITHHOLDING", name: "Withholding Tax (Cross-border)", rate: 10.0, flatAmount: 0, currency: "NGN", appliesToCategory: "all", minAmount: 50000, maxCap: 0, isCompound: false, priority: 10 },
    { id: "ng-dst", jurisdictionCode: "NG", taxType: "DIGITAL_SERVICE", name: "Digital Services Tax", rate: 6.0, flatAmount: 0, currency: "NGN", appliesToCategory: "all", minAmount: 25000000, maxCap: 0, isCompound: false, priority: 5 },
  ],
  KE: [
    { id: "ke-vat", jurisdictionCode: "KE", taxType: "VAT", name: "Kenya VAT", rate: 16.0, flatAmount: 0, currency: "KES", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "ke-tourism", jurisdictionCode: "KE", taxType: "TOURISM_LEVY", name: "Tourism Fund Levy", rate: 2.0, flatAmount: 0, currency: "KES", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
    { id: "ke-catering", jurisdictionCode: "KE", taxType: "SERVICE_CHARGE", name: "Catering Training Levy", rate: 2.0, flatAmount: 0, currency: "KES", appliesToCategory: "food", minAmount: 0, maxCap: 0, isCompound: false, priority: 3 },
    { id: "ke-dst", jurisdictionCode: "KE", taxType: "DIGITAL_SERVICE", name: "Digital Service Tax", rate: 1.5, flatAmount: 0, currency: "KES", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 4 },
    { id: "ke-excise", jurisdictionCode: "KE", taxType: "EXCISE", name: "Excise Duty (Alcohol)", rate: 20.0, flatAmount: 0, currency: "KES", appliesToCategory: "food", minAmount: 500, maxCap: 0, isCompound: false, priority: 5 },
  ],
  GH: [
    { id: "gh-vat", jurisdictionCode: "GH", taxType: "VAT", name: "Ghana VAT", rate: 15.0, flatAmount: 0, currency: "GHS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "gh-nhil", jurisdictionCode: "GH", taxType: "SERVICE_CHARGE", name: "NHIL (Health Insurance)", rate: 2.5, flatAmount: 0, currency: "GHS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
    { id: "gh-getfund", jurisdictionCode: "GH", taxType: "SERVICE_CHARGE", name: "GETFund Levy", rate: 2.5, flatAmount: 0, currency: "GHS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 3 },
    { id: "gh-covid", jurisdictionCode: "GH", taxType: "SERVICE_CHARGE", name: "COVID-19 Health Levy", rate: 1.0, flatAmount: 0, currency: "GHS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 4 },
    { id: "gh-tourism", jurisdictionCode: "GH", taxType: "TOURISM_LEVY", name: "Tourism Development Levy", rate: 1.0, flatAmount: 0, currency: "GHS", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 5 },
  ],
  ZA: [
    { id: "za-vat", jurisdictionCode: "ZA", taxType: "VAT", name: "South Africa VAT", rate: 15.0, flatAmount: 0, currency: "ZAR", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "za-tourism", jurisdictionCode: "ZA", taxType: "TOURISM_LEVY", name: "Tourism Marketing Levy", rate: 1.0, flatAmount: 0, currency: "ZAR", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
    { id: "za-env", jurisdictionCode: "ZA", taxType: "ENVIRONMENTAL", name: "Environmental Levy", rate: 0.5, flatAmount: 0, currency: "ZAR", appliesToCategory: "experience", minAmount: 0, maxCap: 0, isCompound: false, priority: 3 },
  ],
  TZ: [
    { id: "tz-vat", jurisdictionCode: "TZ", taxType: "VAT", name: "Tanzania VAT", rate: 18.0, flatAmount: 0, currency: "TZS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "tz-tourism", jurisdictionCode: "TZ", taxType: "TOURISM_LEVY", name: "Tourism Development Levy", rate: 1.5, flatAmount: 0, currency: "TZS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
    { id: "tz-skills", jurisdictionCode: "TZ", taxType: "SERVICE_CHARGE", name: "Skills & Development Levy", rate: 4.5, flatAmount: 0, currency: "TZS", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 3 },
  ],
  RW: [
    { id: "rw-vat", jurisdictionCode: "RW", taxType: "VAT", name: "Rwanda VAT", rate: 18.0, flatAmount: 0, currency: "RWF", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "rw-tourism", jurisdictionCode: "RW", taxType: "TOURISM_LEVY", name: "Rwanda Tourism Revenue Share", rate: 5.0, flatAmount: 0, currency: "RWF", appliesToCategory: "experience", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
  ],
  EG: [
    { id: "eg-vat", jurisdictionCode: "EG", taxType: "VAT", name: "Egypt VAT", rate: 14.0, flatAmount: 0, currency: "EGP", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "eg-service", jurisdictionCode: "EG", taxType: "SERVICE_CHARGE", name: "Service Tax", rate: 12.0, flatAmount: 0, currency: "EGP", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
  ],
  MA: [
    { id: "ma-vat", jurisdictionCode: "MA", taxType: "VAT", name: "Morocco TVA", rate: 20.0, flatAmount: 0, currency: "MAD", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "ma-city", jurisdictionCode: "MA", taxType: "CITY_TAX", name: "City Tax (Taxe de Séjour)", rate: 0, flatAmount: 25, currency: "MAD", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
    { id: "ma-tourism", jurisdictionCode: "MA", taxType: "TOURISM_LEVY", name: "Tourism Promotion Tax", rate: 2.0, flatAmount: 0, currency: "MAD", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 3 },
  ],
  UG: [
    { id: "ug-vat", jurisdictionCode: "UG", taxType: "VAT", name: "Uganda VAT", rate: 18.0, flatAmount: 0, currency: "UGX", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "ug-tourism", jurisdictionCode: "UG", taxType: "TOURISM_LEVY", name: "Tourism Levy", rate: 1.5, flatAmount: 0, currency: "UGX", appliesToCategory: "accommodation", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
  ],
  ET: [
    { id: "et-vat", jurisdictionCode: "ET", taxType: "VAT", name: "Ethiopia VAT", rate: 15.0, flatAmount: 0, currency: "ETB", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 1 },
    { id: "et-turnover", jurisdictionCode: "ET", taxType: "SERVICE_CHARGE", name: "Turnover Tax", rate: 2.0, flatAmount: 0, currency: "ETB", appliesToCategory: "all", minAmount: 0, maxCap: 0, isCompound: false, priority: 2 },
  ],
};

const JURISDICTION_INFO: Record<string, { name: string; currency: string; taxAuthority: string; filingFrequency: string }> = {
  NG: { name: "Nigeria", currency: "NGN", taxAuthority: "Federal Inland Revenue Service (FIRS)", filingFrequency: "monthly" },
  KE: { name: "Kenya", currency: "KES", taxAuthority: "Kenya Revenue Authority (KRA)", filingFrequency: "monthly" },
  GH: { name: "Ghana", currency: "GHS", taxAuthority: "Ghana Revenue Authority (GRA)", filingFrequency: "monthly" },
  ZA: { name: "South Africa", currency: "ZAR", taxAuthority: "South African Revenue Service (SARS)", filingFrequency: "bi-monthly" },
  TZ: { name: "Tanzania", currency: "TZS", taxAuthority: "Tanzania Revenue Authority (TRA)", filingFrequency: "monthly" },
  RW: { name: "Rwanda", currency: "RWF", taxAuthority: "Rwanda Revenue Authority (RRA)", filingFrequency: "monthly" },
  EG: { name: "Egypt", currency: "EGP", taxAuthority: "Egyptian Tax Authority (ETA)", filingFrequency: "monthly" },
  MA: { name: "Morocco", currency: "MAD", taxAuthority: "Direction Générale des Impôts (DGI)", filingFrequency: "quarterly" },
  UG: { name: "Uganda", currency: "UGX", taxAuthority: "Uganda Revenue Authority (URA)", filingFrequency: "monthly" },
  ET: { name: "Ethiopia", currency: "ETB", taxAuthority: "Ethiopian Revenues and Customs Authority", filingFrequency: "monthly" },
};

// DB-backed tax rule lookup: checks tax_rules then tax_rules_custom, falls back to hardcoded
async function getTaxRulesForJurisdiction(jurisdictionCode: string): Promise<TaxRule[]> {
  const code = jurisdictionCode.toUpperCase();
  const db = await getDb();
  if (db) {
    try {
      // Check primary tax_rules table first
      const rows = await db.execute(
        sql`SELECT * FROM tax_rules WHERE jurisdiction_code = ${code} AND is_active = true ORDER BY priority ASC`
      );
      const dbRules = rows as any[];
      // Also check custom rules
      let customRows: any[] = [];
      try {
        const cr = await db.execute(
          sql`SELECT * FROM tax_rules_custom WHERE jurisdiction_code = ${code} AND is_active = true ORDER BY priority ASC`
        );
        customRows = cr as any[];
      } catch { /* custom table may not exist */ }

      const allDbRules = [...dbRules, ...customRows];
      if (allDbRules.length > 0) {
        return allDbRules.map(r => ({
          id: r.id,
          jurisdictionCode: r.jurisdiction_code,
          taxType: r.tax_type,
          name: r.name,
          rate: Number(r.rate),
          flatAmount: Number(r.flat_amount ?? 0),
          currency: r.currency ?? JURISDICTION_INFO[code]?.currency ?? "USD",
          appliesToCategory: r.applies_to_category ?? "all",
          minAmount: Number(r.min_amount ?? 0),
          maxCap: Number(r.max_cap ?? 0),
          isCompound: Boolean(r.is_compound),
          priority: Number(r.priority),
        }));
      }
    } catch {
      // tax_rules table may not exist if migration 0074 hasn't been applied
    }
  }
  return JURISDICTION_TAX_RULES[code] ?? [];
}

async function calculateTaxForTransaction(jurisdictionCode: string, category: string, subTotal: number) {
  const rules = await getTaxRulesForJurisdiction(jurisdictionCode);
  const applicableRules = rules
    .filter(r => r.appliesToCategory === "all" || r.appliesToCategory === category.toLowerCase())
    .filter(r => subTotal >= r.minAmount)
    .sort((a, b) => a.priority - b.priority);

  const breakdown: { taxType: string; name: string; rate: number; taxableBase: number; amount: number }[] = [];
  let totalTax = 0;
  let runningBase = subTotal;

  for (const rule of applicableRules) {
    const taxableBase = rule.maxCap > 0 ? Math.min(runningBase, rule.maxCap) : runningBase;
    const amount = rule.flatAmount > 0
      ? rule.flatAmount
      : Math.round(taxableBase * rule.rate) / 100;

    breakdown.push({ taxType: rule.taxType, name: rule.name, rate: rule.rate, taxableBase, amount });
    totalTax += amount;
    if (rule.isCompound) runningBase += amount;
  }

  return {
    subTotal,
    totalTax: Math.round(totalTax * 100) / 100,
    grandTotal: Math.round((subTotal + totalTax) * 100) / 100,
    breakdown,
    jurisdictionCode: jurisdictionCode.toUpperCase(),
    currency: rules[0]?.currency ?? "USD",
    receiptNumber: `TAX-${jurisdictionCode.toUpperCase()}-${Date.now()}`,
  };
}

export const taxCollectionRouter = router({
  // List all supported jurisdictions
  jurisdictions: protectedProcedure.query(() => {
    return Object.entries(JURISDICTION_TAX_RULES).map(([code, rules]) => {
      const info = JURISDICTION_INFO[code];
      const vatRule = rules.find(r => r.taxType === "VAT");
      const totalRate = rules.filter(r => r.appliesToCategory === "all").reduce((sum, r) => sum + r.rate, 0);
      return {
        code,
        name: info?.name ?? code,
        currency: info?.currency ?? "USD",
        vatRate: vatRule?.rate ?? 0,
        totalEffectiveRate: Math.round(totalRate * 10) / 10,
        taxAuthority: info?.taxAuthority ?? "Unknown",
        filingFrequency: info?.filingFrequency ?? "monthly",
        ruleCount: rules.length,
      } as JurisdictionInfo;
    });
  }),

  // Get rules for a specific jurisdiction
  getRules: protectedProcedure
    .input(z.object({ jurisdictionCode: z.string().length(2) }))
    .query(({ input }) => {
      const code = input.jurisdictionCode.toUpperCase();
      const rules = JURISDICTION_TAX_RULES[code] ?? [];
      const info = JURISDICTION_INFO[code];
      return {
        jurisdictionCode: code,
        name: info?.name ?? code,
        currency: info?.currency ?? "USD",
        taxAuthority: info?.taxAuthority ?? "Unknown",
        filingFrequency: info?.filingFrequency ?? "monthly",
        rules: rules.map(r => ({
          id: r.id,
          taxType: r.taxType,
          name: r.name,
          rate: r.rate,
          flatAmount: r.flatAmount,
          appliesToCategory: r.appliesToCategory,
          minAmount: r.minAmount,
          maxCap: r.maxCap,
          isCompound: r.isCompound,
          priority: r.priority,
        })),
      };
    }),

  // Calculate tax for a transaction (preview, not persisted)
  calculate: protectedProcedure
    .input(z.object({
      jurisdictionCode: z.string().length(2),
      category: z.string(),
      subTotal: z.number().positive(),
    }))
    .query(async ({ input }) => {
      return await calculateTaxForTransaction(input.jurisdictionCode, input.category, input.subTotal);
    }),

  // Record a tax collection event (persisted to DB)
  collect: protectedProcedure
    .input(z.object({
      transactionId: z.string(),
      jurisdictionCode: z.string().length(2),
      category: z.string(),
      subTotal: z.number().positive(),
      merchantId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await calculateTaxForTransaction(input.jurisdictionCode, input.category, input.subTotal);
      const now = Date.now();
      const taxRecordId = crypto.randomUUID();

      // Store each tax line item
      for (const item of result.breakdown) {
        await db.execute(sql`
          INSERT INTO tax_collections (id, tax_record_id, transaction_id, jurisdiction_code, tax_type, tax_name, rate, taxable_base, amount, currency, merchant_id, category, status, created_at)
          VALUES (${crypto.randomUUID()}, ${taxRecordId}, ${input.transactionId}, ${result.jurisdictionCode}, ${item.taxType}, ${item.name}, ${item.rate}, ${item.taxableBase}, ${item.amount}, ${result.currency}, ${input.merchantId}, ${input.category}, 'collected', ${now})
        `);
      }

      // Update remittance tracker
      const period = new Date().toISOString().slice(0, 7); // "2025-07"
      for (const item of result.breakdown) {
        await db.execute(sql`
          INSERT INTO tax_remittance_tracker (id, jurisdiction_code, tax_type, period, total_collected, total_remitted, currency, transaction_count, status, updated_at)
          VALUES (${crypto.randomUUID()}, ${result.jurisdictionCode}, ${item.taxType}, ${period}, ${item.amount}, 0, ${result.currency}, 1, 'pending', ${now})
          ON CONFLICT (jurisdiction_code, tax_type, period)
          DO UPDATE SET total_collected = tax_remittance_tracker.total_collected + EXCLUDED.total_collected, transaction_count = tax_remittance_tracker.transaction_count + 1, updated_at = EXCLUDED.updated_at
        `);
      }

      publishAuditEvent("tax.collected", { taxRecordId, jurisdiction: result.jurisdictionCode, totalTax: result.totalTax, currency: result.currency });

      return {
        taxRecordId,
        ...result,
        status: "collected",
      };
    }),

  // Generate tax receipt for a tourist
  receipt: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.execute(sql`
        SELECT * FROM tax_collections WHERE transaction_id = ${input.transactionId} ORDER BY created_at
      `);
      const items = rows as any[];
      if (items.length === 0) return null;
      const totalTax = items.reduce((sum, r) => sum + parseFloat(r.amount), 0);
      const totalTaxable = items.reduce((sum, r) => sum + parseFloat(r.taxable_base), 0);
      return {
        transactionId: input.transactionId,
        jurisdictionCode: items[0].jurisdiction_code,
        currency: items[0].currency,
        merchantId: items[0].merchant_id,
        category: items[0].category,
        subTotal: totalTaxable,
        totalTax: Math.round(totalTax * 100) / 100,
        grandTotal: Math.round((totalTaxable + totalTax) * 100) / 100,
        breakdown: items.map(r => ({
          taxType: r.tax_type,
          name: r.tax_name,
          rate: parseFloat(r.rate),
          amount: parseFloat(r.amount),
        })),
        receiptNumber: `TAX-${items[0].jurisdiction_code}-${items[0].tax_record_id.slice(0, 8)}`,
        issuedAt: Number(items[0].created_at),
        taxAuthority: JURISDICTION_INFO[items[0].jurisdiction_code]?.taxAuthority ?? "Unknown",
      };
    }),

  // Admin / settlement_officer: remittance tracking per jurisdiction
  remittance: settlementProcedure
    .input(z.object({ jurisdictionCode: z.string().length(2).optional(), period: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], totals: { collected: 0, remitted: 0, outstanding: 0 } };
      let query = sql`SELECT * FROM tax_remittance_tracker WHERE 1=1`;
      if (input?.jurisdictionCode) {
        query = sql`SELECT * FROM tax_remittance_tracker WHERE jurisdiction_code = ${input.jurisdictionCode.toUpperCase()}`;
      }
      const rows = await db.execute(query);
      const items = (rows as any[]).map(r => ({
        jurisdictionCode: r.jurisdiction_code,
        taxType: r.tax_type,
        period: r.period,
        totalCollected: parseFloat(r.total_collected),
        totalRemitted: parseFloat(r.total_remitted),
        outstanding: parseFloat(r.total_collected) - parseFloat(r.total_remitted),
        currency: r.currency,
        transactionCount: Number(r.transaction_count),
        status: r.status,
      }));
      const totals = items.reduce((acc, r) => ({
        collected: acc.collected + r.totalCollected,
        remitted: acc.remitted + r.totalRemitted,
        outstanding: acc.outstanding + r.outstanding,
      }), { collected: 0, remitted: 0, outstanding: 0 });
      return { items, totals };
    }),

  // Admin: mark tax as remitted
  markRemitted: adminProcedure
    .input(z.object({ jurisdictionCode: z.string().length(2), taxType: z.string(), period: z.string(), amount: z.number().positive() }))
    .mutation(async ({ input, ctx }) => {
      await requirePermission(String(ctx.user.id), ctx.user.role, RESOURCES.SETTLEMENT, ACTIONS.EXECUTE);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.execute(sql`
        UPDATE tax_remittance_tracker SET total_remitted = total_remitted + ${input.amount}, status = 'remitted', updated_at = ${Date.now()}
        WHERE jurisdiction_code = ${input.jurisdictionCode.toUpperCase()} AND tax_type = ${input.taxType} AND period = ${input.period}
      `);
      return { success: true };
    }),

  // Admin: add custom tax rule for a jurisdiction
  addRule: adminProcedure
    .input(z.object({
      jurisdictionCode: z.string().length(2),
      taxType: z.string(),
      name: z.string(),
      rate: z.number().min(0).max(100),
      flatAmount: z.number().min(0).default(0),
      appliesToCategory: z.string().default("all"),
      minAmount: z.number().min(0).default(0),
      maxCap: z.number().min(0).default(0),
      isCompound: z.boolean().default(false),
      priority: z.number().min(1).max(100).default(50),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const ruleId = `custom-${input.jurisdictionCode.toLowerCase()}-${Date.now()}`;
      await db.execute(sql`
        INSERT INTO tax_rules_custom (id, jurisdiction_code, tax_type, name, rate, flat_amount, applies_to_category, min_amount, max_cap, is_compound, priority, is_active, created_at)
        VALUES (${ruleId}, ${input.jurisdictionCode.toUpperCase()}, ${input.taxType}, ${input.name}, ${input.rate}, ${input.flatAmount}, ${input.appliesToCategory}, ${input.minAmount}, ${input.maxCap}, ${input.isCompound}, ${input.priority}, true, ${Date.now()})
      `);
      // Also add to in-memory rules
      const code = input.jurisdictionCode.toUpperCase();
      if (!JURISDICTION_TAX_RULES[code]) JURISDICTION_TAX_RULES[code] = [];
      JURISDICTION_TAX_RULES[code].push({
        id: ruleId,
        jurisdictionCode: code,
        taxType: input.taxType,
        name: input.name,
        rate: input.rate,
        flatAmount: input.flatAmount,
        currency: JURISDICTION_INFO[code]?.currency ?? "USD",
        appliesToCategory: input.appliesToCategory,
        minAmount: input.minAmount,
        maxCap: input.maxCap,
        isCompound: input.isCompound,
        priority: input.priority,
      });
      return { ruleId, success: true };
    }),
});
