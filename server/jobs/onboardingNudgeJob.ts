/**
 * Onboarding Score Nudge Job
 *
 * Runs every 24 hours.
 * For every merchant whose onboarding score has been below 60% for 7+ days
 * (i.e. the establishment was created at least 7 days ago and score < 60),
 * sends an in-app notification listing the incomplete steps and linking to each.
 *
 * To avoid spam, a nudge is sent at most once every 7 days per establishment.
 * The last nudge timestamp is stored in establishments.metadata.lastNudgeSentAt.
 */
import { getDb } from "../db";
import {
  establishments,
  kybDocuments,
  merchantProducts,
  touristDeals,
  users,
} from "../../drizzle/schema";
import { eq, and, lt } from "drizzle-orm";
import { createUserNotification } from "../db";

const JOB_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SCORE_THRESHOLD = 60;
const NUDGE_COOLDOWN_DAYS = 7;
const MIN_AGE_DAYS = 7; // only nudge establishments older than 7 days

interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  completed: boolean;
  weight: number;
}

async function computeOnboardingScore(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  est: {
    id: number;
    name: string | null;
    country: string;
    city: string | null;
    address: string | null;
    contactEmail: string | null;
    kybStatus: string;
    stripePayoutsEnabled: boolean | null;
  }
): Promise<{ score: number; steps: OnboardingStep[] }> {
  const detailsComplete = !!(
    est.name && est.country && est.city && est.address && est.contactEmail
  );

  const docs = await db
    .select({ id: kybDocuments.id })
    .from(kybDocuments)
    .where(eq(kybDocuments.establishmentId, est.id))
    .limit(1);
  const docsUploaded = docs.length > 0;

  const kybApproved = est.kybStatus === "approved";

  const products = await db
    .select({ id: merchantProducts.id })
    .from(merchantProducts)
    .where(eq(merchantProducts.establishmentId, est.id))
    .limit(1);
  const hasProduct = products.length > 0;

  const stripeActive = est.stripePayoutsEnabled === true;

  const deals = await db
    .select({ id: touristDeals.id })
    .from(touristDeals)
    .where(
      and(
        eq(touristDeals.establishmentId, est.id),
        eq(touristDeals.isActive, true)
      )
    )
    .limit(1);
  const hasDeal = deals.length > 0;

  const steps: OnboardingStep[] = [
    { key: "details", label: "Complete establishment details", href: "/restaurant-onboarding", completed: detailsComplete, weight: 15 },
    { key: "docs", label: "Upload KYB compliance documents", href: "/africa/kyb", completed: docsUploaded, weight: 20 },
    { key: "kyb_approved", label: "KYB application approved", href: "/africa/kyb", completed: kybApproved, weight: 25 },
    { key: "product", label: "Add first service or product", href: "/merchant/products", completed: hasProduct, weight: 15 },
    { key: "stripe", label: "Connect Stripe for payouts", href: "/merchant/stripe-connect", completed: stripeActive, weight: 15 },
    { key: "deal", label: "Publish first deal for tourists", href: "/merchant/revenue", completed: hasDeal, weight: 10 },
  ];

  const totalWeight = steps.reduce((s, st) => s + st.weight, 0);
  const earnedWeight = steps.filter((st) => st.completed).reduce((s, st) => s + st.weight, 0);
  const score = Math.round((earnedWeight / totalWeight) * 100);

  return { score, steps };
}

async function runNudgeJob() {
  const db = await getDb();
  if (!db) {
    console.warn("[OnboardingNudge] Database unavailable, skipping");
    return;
  }

  const now = Date.now();
  const sevenDaysAgo = new Date(now - MIN_AGE_DAYS * 24 * 60 * 60 * 1000);

  // Fetch all establishments older than 7 days that have an owner
  const allEstablishments = await db
    .select({
      id: establishments.id,
      name: establishments.name,
      ownerId: establishments.ownerId,
      country: establishments.country,
      city: establishments.city,
      address: establishments.address,
      contactEmail: establishments.contactEmail,
      kybStatus: establishments.kybStatus,
      stripePayoutsEnabled: establishments.stripePayoutsEnabled,
      metadata: establishments.metadata,
      createdAt: establishments.createdAt,
    })
    .from(establishments)
    .where(lt(establishments.createdAt, sevenDaysAgo));

  let nudged = 0;
  let skipped = 0;

  for (const est of allEstablishments) {
    if (!est.ownerId) { skipped++; continue; }

    // Check nudge cooldown from metadata
    const meta = (est.metadata as Record<string, unknown> | null) ?? {};
    const lastNudge = meta.lastNudgeSentAt as number | undefined;
    if (lastNudge && now - lastNudge < NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
      skipped++;
      continue;
    }

    try {
      const { score, steps } = await computeOnboardingScore(db, est);

      if (score >= SCORE_THRESHOLD) { skipped++; continue; }

      const incompleteSteps = steps.filter((s) => !s.completed);
      if (incompleteSteps.length === 0) { skipped++; continue; }

      // Build notification content
      const stepList = incompleteSteps
        .map((s) => `• ${s.label}`)
        .join("\n");

      const content = [
        `Your onboarding score for **${est.name ?? "your establishment"}** is **${score}%** — below the recommended 60%.`,
        "",
        "Complete these steps to start receiving bookings and payments:",
        stepList,
        "",
        "Log in to your dashboard to continue.",
      ].join("\n");

      await createUserNotification({
        userId: est.ownerId,
        category: "system",
        title: `Complete your setup — ${score}% done`,
        content,
        actionUrl: incompleteSteps[0]?.href ?? "/merchant/revenue",
        actionLabel: "Continue Setup",
        isRead: false,
        createdAt: new Date(),
      });

      // Update lastNudgeSentAt in metadata
      await db
        .update(establishments)
        .set({
          metadata: { ...meta, lastNudgeSentAt: now },
          updatedAt: new Date(),
        })
        .where(eq(establishments.id, est.id));

      nudged++;
      console.log(
        `[OnboardingNudge] Nudge sent to owner ${est.ownerId} for establishment ${est.id} (${est.name}) — score: ${score}%`
      );
    } catch (err) {
      console.error(
        `[OnboardingNudge] Failed for establishment ${est.id} (${est.name}):`,
        err
      );
    }
  }

  console.log(
    `[OnboardingNudge] Run complete: ${nudged} nudges sent, ${skipped} skipped`
  );
}

export function startOnboardingNudgeJob() {
  console.log("[OnboardingNudge] Starting daily onboarding nudge job (interval: 24h)");
  // Run after a short delay on startup to avoid blocking server init
  setTimeout(() => {
    runNudgeJob().catch((err) =>
      console.error("[OnboardingNudge] Initial run failed:", err)
    );
  }, 30_000); // 30s delay on startup

  setInterval(() => {
    runNudgeJob().catch((err) =>
      console.error("[OnboardingNudge] Scheduled run failed:", err)
    );
  }, JOB_INTERVAL_MS);
}
