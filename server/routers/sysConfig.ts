/**
 * sysConfig.ts — System configuration router (trpc.sysConfig.*)
 * Powers the SystemSettingsPage.tsx.
 */
import { router, adminProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getDb } from '../db';
import { eq } from 'drizzle-orm';

export const sysConfigRouter = router({
  getAll: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return getDefaultSettings();
    try {
      const { platformSettings } = await import('../../drizzle/schema');
      const rows = await db.select().from(platformSettings);
      if (rows.length === 0) return getDefaultSettings();
      return rows.reduce((acc: Record<string, any>, row: any) => {
        acc[row.key] = {
          value: row.value,
          category: row.category,
          description: row.description,
          updatedBy: row.updatedBy,
          updatedAt: row.updatedAt,
        };
        return acc;
      }, {});
    } catch {
      return getDefaultSettings();
    }
  }),

  update: adminProcedure
    .input(z.object({
      key: z.string(),
      value: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      try {
        const { platformSettings } = await import('../../drizzle/schema');
        await db.update(platformSettings)
          .set({ value: input.value, updatedAt: new Date() })
          .where(eq(platformSettings.key, input.key));
        return { success: true };
      } catch {
        throw new Error('Failed to update setting');
      }
    }),

  getByCategory: adminProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      try {
        const { platformSettings } = await import('../../drizzle/schema');
        return db.select().from(platformSettings)
          .where(eq(platformSettings.category, input.category));
      } catch {
        return [];
      }
    }),
});

function getDefaultSettings() {
  return {
    max_transaction_amount_ngn: { value: '10000000', category: 'limits', description: 'Maximum single transaction amount in NGN' },
    fraud_score_threshold: { value: '0.75', category: 'fraud', description: 'Fraud score threshold for auto-flagging' },
    kyb_auto_approve_threshold: { value: '0.90', category: 'kyb', description: 'KYB auto-approval confidence threshold' },
    default_commission_rate: { value: '0.02', category: 'commission', description: 'Default agent commission rate (2%)' },
    tipping_enabled: { value: 'true', category: 'features', description: 'Enable tipping feature platform-wide' },
    stablecoin_swap_enabled: { value: 'true', category: 'features', description: 'Enable stablecoin swap feature' },
    bis_auto_flag_enabled: { value: 'true', category: 'bis', description: 'Enable automatic BIS flagging' },
    maintenance_mode: { value: 'false', category: 'system', description: 'Enable maintenance mode (blocks all transactions)' },
    max_daily_wallet_limit: { value: '5000000', category: 'limits', description: 'Maximum daily wallet transaction limit in NGN' },
    kyc_required_above: { value: '500000', category: 'compliance', description: 'Require full KYC for transactions above this amount (NGN)' },
  };
}
