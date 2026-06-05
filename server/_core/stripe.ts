/**
 * Stripe helper — initialises the Stripe SDK with the secret key from ENV.
 * Import `stripe` from here in any server-side router that needs Stripe.
 * When STRIPE_SECRET_KEY is not set, exports null so callers can gracefully skip.
 */
import Stripe from "stripe";
import { ENV } from "./env";

export const stripe: Stripe | null = ENV.stripeSecretKey
  ? new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    })
  : null;
