import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { CaddyClient } from '../_core/caddy-integration';
import { TRPCError } from '@trpc/server';

export const caddyRouter = router({
  getConfig: protectedProcedure
    .query(async () => {
      try {
        return await CaddyClient.getConfig();
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
    }),

  updateConfig: protectedProcedure
    .input(z.any()) // Adjust schema as needed
    .mutation(async ({ input }: { input: unknown }) => {
      try {
        await CaddyClient.updateConfig(input as import('../_core/caddy-integration').CaddyConfig);
        return { success: true };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
    }),

  reload: protectedProcedure
    .mutation(async () => {
      try {
        await CaddyClient.reload();
        return { success: true };
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
    }),

  getMetrics: protectedProcedure
    .query(async () => {
      try {
        return await CaddyClient.getMetrics();
      } catch (error: any) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }
    }),
});
