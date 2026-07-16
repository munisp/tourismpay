import { router, publicProcedure, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';

export const userMessageRouter = router({
  list: publicProcedure.query(async () => { return []; }),
  get: publicProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => { return null; }),
});
