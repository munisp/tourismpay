/**
 * Stripe Webhook Handler
 * Registers the /api/stripe/webhook route on the Express app.
 * Must be registered BEFORE express.json() so the raw body is available for signature verification.
 */
import express, { type Express } from "express";
import { stripe } from "./_core/stripe";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { walletBalances, bisDirectors, bisInvestigations, serviceAvailability } from "../drizzle/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { createAuditLog, createUserNotification, createBisInvestigation } from "./db";

// USD → wallet currency conversion rates (approximate, same as wallet router)
const APPROX_USD_RATES: Record<string, number> = {
  USDC: 1, USD: 1, "CBDC-NG": 0.00065, "CBDC-KE": 0.0077, "CBDC-GH": 0.067,
  "CBDC-ZA": 0.054, XLM: 0.11, NGN: 0.00065, KES: 0.0077, GHS: 0.067, ZAR: 0.054,
};

export function registerStripeWebhook(app: Express) {
  // MUST use express.raw before express.json for Stripe signature verification
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const sig = req.headers["stripe-signature"];
      let event: ReturnType<typeof stripe.webhooks.constructEvent>;

      try {
        event = stripe.webhooks.constructEvent(
          req.body as Buffer,
          sig as string,
          ENV.stripeWebhookSecret
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error("[Stripe Webhook] Signature verification failed:", msg);
        res.status(400).send(`Webhook Error: ${msg}`);
        return;
      }

      // Test events — return immediately so Stripe CLI can verify the endpoint
      if (event.id.startsWith("evt_test_")) {
        console.log("[Stripe Webhook] Test event detected, returning verification response");
        res.json({ verified: true });
        return;
      }

      console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

      try {
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as {
            id: string;
            payment_status: string;
            client_reference_id: string | null;
            metadata: Record<string, string> | null;
            amount_total: number | null;
          };

          if (session.payment_status !== "paid") {
            res.json({ received: true });
            return;
          }

          const userId = session.client_reference_id || session.metadata?.user_id;
          const walletCurrency = session.metadata?.wallet_currency ?? "USDC";
          const amountUsd = parseFloat(session.metadata?.amount_usd ?? "0");

          if (!userId || amountUsd <= 0) {
            console.warn("[Stripe Webhook] Missing userId or amount in session metadata");
            res.json({ received: true });
            return;
          }

          // Convert USD amount to wallet currency units
          const rate = APPROX_USD_RATES[walletCurrency] ?? 1;
          const walletAmount = rate === 1 ? amountUsd : amountUsd / rate;

          const db = await getDb();
          if (!db) {
            res.status(500).json({ error: "Database unavailable" });
            return;
          }

          // Find or create the wallet balance for this currency
          const [existing] = await db
            .select()
            .from(walletBalances)
            .where(
              and(
                eq(walletBalances.userId, userId),
                eq(walletBalances.currency, walletCurrency)
              )
            );

          if (existing) {
            const newBalance = parseFloat(existing.balance as unknown as string) + walletAmount;
            await db
              .update(walletBalances)
              .set({ balance: String(newBalance), updatedAt: Date.now() })
              .where(eq(walletBalances.id, existing.id));
          } else {
            // Create new balance entry
            await db.insert(walletBalances).values({
              userId,
              currency: walletCurrency,
              balance: String(walletAmount),
              lockedBalance: "0",
              walletAddress: `tp_${walletCurrency.toLowerCase().replace("-", "_")}_${userId.slice(0, 8)}`,
              network: "Stripe",
              createdAt: Math.floor(Date.now() / 1000),
              updatedAt: Math.floor(Date.now() / 1000),
            });
          }

          // Audit log
          const userIdInt = parseInt(userId, 10);
          await createAuditLog({
            actorId: isNaN(userIdInt) ? undefined : userIdInt,
            actorName: session.metadata?.customer_name || userId,
            action: "wallet.topup.stripe",
            entityType: "stripe_session",
            entityId: session.id,
            after: {
              currency: walletCurrency,
              amountUsd,
              walletAmount,
              stripeSessionId: session.id,
            },
          });

          // In-app notification
          await createUserNotification({
            userId: userIdInt,
            category: "system",
            title: "Wallet Top-Up Successful",
            content: `$${amountUsd.toFixed(2)} USD was added to your ${walletCurrency} wallet via Stripe. New balance includes ${walletAmount.toFixed(4)} ${walletCurrency}.`,
            actionUrl: "/wallet",
            actionLabel: "View Wallet",
          });

           console.log(`[Stripe Webhook] Wallet topped up: user=${userId}, currency=${walletCurrency}, amount=${walletAmount}`);

          // ── Director Bundle: create BIS investigations for each director ──
          if (session.metadata?.bundle_type === "director_bundle") {
            await handleDirectorBundle(session);
          }

          // ── Service Booking: deduct slot from serviceAvailability ──
          if (session.metadata?.booking_type === "service" && session.metadata?.product_id && session.metadata?.booking_date_str) {
            const productId = parseInt(session.metadata.product_id, 10);
            const bookingDateStr = session.metadata.booking_date_str;
            if (!isNaN(productId) && bookingDateStr) {
              await deductBookingSlot(db, productId, bookingDateStr);
              console.log(`[Stripe Webhook] Slot deducted: productId=${productId}, date=${bookingDateStr}`);
            }
          }
        }

        res.json({ received: true });
      } catch (err) {
        console.error("[Stripe Webhook] Handler error:", err);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );
}

// ─── Director Bundle Handler ──────────────────────────────────────────────────

/**
 * Handles a completed director_bundle checkout session.
 * Reads director_ids from metadata, creates a BIS investigation for each
 * uninvestigated director, and links them back via linkedInvestigationId.
 */
async function handleDirectorBundle(session: {
  id: string;
  payment_status: string;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  amount_total: number | null;
}) {
  const meta = session.metadata ?? {};
  const userId = parseInt(meta.user_id ?? session.client_reference_id ?? "0", 10);
  const investigationId = parseInt(meta.investigation_id ?? "0", 10);
  const tier = (meta.tier ?? "standard") as "basic" | "standard" | "comprehensive";
  const directorIdsRaw = meta.director_ids ?? "";

  if (!userId || !investigationId || !directorIdsRaw) {
    console.warn("[Stripe Webhook][DirectorBundle] Missing required metadata fields", meta);
    return;
  }

  const directorIds = directorIdsRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);

  if (directorIds.length === 0) {
    console.warn("[Stripe Webhook][DirectorBundle] No valid director IDs in metadata");
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[Stripe Webhook][DirectorBundle] Database unavailable");
    return;
  }

  // Fetch the directors that still have no linked investigation
  const directors = await db
    .select()
    .from(bisDirectors)
    .where(
      and(
        inArray(bisDirectors.id, directorIds),
        eq(bisDirectors.entityInvestigationId, investigationId)
      )
    );

  const tierPricing: Record<string, number> = { basic: 49, standard: 99, comprehensive: 199 };
  const DISCOUNT_PERCENT = 20;
  const basePrice = tierPricing[tier] ?? 99;
  const discountedPrice = Math.round(basePrice * (1 - DISCOUNT_PERCENT / 100) * 100) / 100;

  const createdInvestigations: { id: number; name: string; refId: string }[] = [];

  for (const director of directors) {
    // Skip if already linked (idempotency guard)
    if (director.linkedInvestigationId) {
      console.log(`[Stripe Webhook][DirectorBundle] Director ${director.id} already has investigation ${director.linkedInvestigationId}, skipping`);
      continue;
    }

    try {
      const inv = await createBisInvestigation({
        subjectType: "individual",
        subjectFullName: director.fullName,
        subjectNationality: director.nationality ?? undefined,
        subjectNin: director.nin ?? undefined,
        subjectPhone: director.phone ?? undefined,
        subjectEmail: director.email ?? undefined,
        subjectRole: director.role,
        tier,
        status: "pending",
        requestedBy: userId,
        consentObtained: true,
        pricePaid: String(discountedPrice),
        currency: "USD",
        linkedEntityInvestigationId: investigationId,
      });

      if (inv?.id) {
        // Link the director record back to the new investigation
        await db
          .update(bisDirectors)
          .set({ linkedInvestigationId: inv.id })
          .where(eq(bisDirectors.id, director.id));

        createdInvestigations.push({ id: inv.id, name: director.fullName, refId: inv.referenceId });
        console.log(`[Stripe Webhook][DirectorBundle] Created investigation ${inv.referenceId} for director ${director.fullName}`);
      }
    } catch (err) {
      console.error(`[Stripe Webhook][DirectorBundle] Failed to create investigation for director ${director.id}:`, err);
    }
  }

  if (createdInvestigations.length === 0) {
    console.warn("[Stripe Webhook][DirectorBundle] No new investigations created (all may already exist)");
    return;
  }

  // Audit log
  await createAuditLog({
    actorId: userId,
    actorName: `User #${userId}`,
    action: "bis.director_bundle.completed",
    entityType: "stripe_session",
    entityId: session.id,
    after: {
      investigationId,
      tier,
      directorCount: createdInvestigations.length,
      createdRefs: createdInvestigations.map((i) => i.refId),
      stripeSessionId: session.id,
    },
  });

  // In-app notification to the requesting user
  const nameList = createdInvestigations
    .slice(0, 3)
    .map((i) => i.name)
    .join(", ");
  const extra = createdInvestigations.length > 3 ? ` and ${createdInvestigations.length - 3} more` : "";

  await createUserNotification({
    userId,
    category: "system",
    title: `Director Bundle Queued — ${createdInvestigations.length} Investigation${createdInvestigations.length !== 1 ? "s" : ""} Created`,
    content: `Your bundle payment was confirmed. BIS investigations have been queued for: ${nameList}${extra}. Each investigation will be processed at the ${tier.toUpperCase()} tier with a 20% bundle discount applied.`,
    actionUrl: `/bis/report/${investigationId}`,
    actionLabel: "View Entity Investigation",
  });

  console.log(`[Stripe Webhook][DirectorBundle] Bundle complete: ${createdInvestigations.length} investigations created for entity investigation #${investigationId}`);
}

// ─── Service Booking Slot Deduction ──────────────────────────────────────────

/**
 * Increments bookedSlots on a serviceAvailability record when a Stripe
 * service booking checkout session completes. Idempotent — if the record
 * does not exist (no explicit availability set), the call is a no-op.
 */
async function deductBookingSlot(
  db: Awaited<ReturnType<typeof getDb>>,
  productId: number,
  bookingDateStr: string
) {
  if (!db) return;
  await db
    .update(serviceAvailability)
    .set({ bookedSlots: sql`${serviceAvailability.bookedSlots} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(serviceAvailability.productId, productId),
        eq(serviceAvailability.date, bookingDateStr)
      )
    );
}
