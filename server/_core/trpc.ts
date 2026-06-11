import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// admin only
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (ctx.user.role !== 'admin') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// admin OR settlement_officer
export const settlementProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'settlement_officer') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// admin OR bis_analyst
export const bisProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'bis_analyst') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// admin OR noc_operator
export const nocProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'noc_operator') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// admin OR compliance_officer
export const complianceProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'compliance_officer') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// admin OR merchant
export const merchantProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'merchant') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// admin OR noc_operator OR settlement_officer (PaymentSwitch operators)
export const paymentSwitchProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    const allowed = ['admin', 'noc_operator', 'settlement_officer'] as string[];
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    if (!allowed.includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
