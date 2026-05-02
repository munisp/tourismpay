/**
 * Tourist Onboarding Router
 * Manages the first-time tourist setup flow: currency preference, home country, wallet activation.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  touristProfiles,
  touristOnboardingState,
  walletBalances,
  users,
} from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const touristOnboardingRouter = router({
  /** Get the current tourist's profile and onboarding state */
  getState: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const [profile] = await db
      .select()
      .from(touristProfiles)
      .where(eq(touristProfiles.userId, ctx.user.id))
      .limit(1);

    const [state] = await db
      .select()
      .from(touristOnboardingState)
      .where(eq(touristOnboardingState.userId, ctx.user.id))
      .limit(1);

    return { profile: profile ?? null, state: state ?? null };
  }),

  /** Step 1: Set currency preference and home country */
  setPreferences: protectedProcedure
    .input(
      z.object({
        homeCurrency: z.string().max(10),
        homeCountry: z.string().max(3),
        preferredLanguage: z.string().max(10).default("en"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [existing] = await db
        .select()
        .from(touristProfiles)
        .where(eq(touristProfiles.userId, ctx.user.id))
        .limit(1);

      if (existing) {
        await db
          .update(touristProfiles)
          .set({
            homeCurrency: input.homeCurrency,
            homeCountry: input.homeCountry,
            preferredLanguage: input.preferredLanguage,
            updatedAt: new Date(),
          })
          .where(eq(touristProfiles.userId, ctx.user.id));
      } else {
        await db.insert(touristProfiles).values({
          userId: ctx.user.id,
          homeCurrency: input.homeCurrency,
          homeCountry: input.homeCountry,
          preferredLanguage: input.preferredLanguage,
          onboardingCompleted: false,
        });
      }

      // Advance onboarding state to step 2
      await upsertOnboardingStep(db, ctx.user.id, 2, [1]);

      return { success: true };
    }),

  /** Step 2: Link a card (stores last4 and brand only — no real card data) */
  linkCard: protectedProcedure
    .input(
      z.object({
        last4: z.string().length(4),
        brand: z.string().max(32),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(touristProfiles)
        .set({
          linkedCardLast4: input.last4,
          linkedCardBrand: input.brand,
          updatedAt: new Date(),
        })
        .where(eq(touristProfiles.userId, ctx.user.id));

      await upsertOnboardingStep(db, ctx.user.id, 3, [1, 2]);

      return { success: true };
    }),

  /** Step 3: Activate wallet — creates a USD wallet balance row if not present */
  activateWallet: protectedProcedure
    .input(
      z.object({
        currencies: z.array(z.string().max(10)).min(1).max(5),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const userId = String(ctx.user.id);

      for (const currency of input.currencies) {
        const [existing] = await db
          .select()
          .from(walletBalances)
          .where(eq(walletBalances.userId, userId))
          .limit(1);

        if (!existing) {
          await db.insert(walletBalances).values({
            userId,
            currency,
            balance: "0",
            lockedBalance: "0",
          });
        }
      }

      // Mark onboarding complete
      await db
        .update(touristProfiles)
        .set({ onboardingCompleted: true, updatedAt: new Date() })
        .where(eq(touristProfiles.userId, ctx.user.id));

      await upsertOnboardingStep(db, ctx.user.id, 4, [1, 2, 3]);

      // Update user role to tourist if still 'user'
      const [u] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (u && u.role === "user") {
        await db
          .update(users)
          .set({ role: "tourist" })
          .where(eq(users.id, ctx.user.id));
      }

      return { success: true };
    }),

  /** Mark onboarding as complete (skip remaining steps) */
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    await db
      .update(touristProfiles)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(touristProfiles.userId, ctx.user.id));

    return { success: true };
  }),
});

async function upsertOnboardingStep(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: number,
  step: number,
  completedSteps: number[]
) {
  if (!db) return;
  const [existing] = await db
    .select()
    .from(touristOnboardingState)
    .where(eq(touristOnboardingState.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(touristOnboardingState)
      .set({ step, completedSteps, updatedAt: new Date() })
      .where(eq(touristOnboardingState.userId, userId));
  } else {
    await db.insert(touristOnboardingState).values({
      userId,
      step,
      completedSteps,
    });
  }
}
