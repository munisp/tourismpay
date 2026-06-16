/**
 * Stripe helper — lazily initialises the Stripe SDK on first access.
 * This prevents test suites from crashing when STRIPE_SECRET_KEY is not set.
 * Import `stripe` from here in any server-side router that needs Stripe.
 */
import Stripe from "stripe";
import { ENV } from "./env";

let _stripe: Stripe | null = null;

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    if (!_stripe) {
      if (!ENV.stripeSecretKey) {
        throw new Error(
          "STRIPE_SECRET_KEY is not configured. Set it in your environment to use payment features."
        );
      }
      _stripe = new Stripe(ENV.stripeSecretKey, {
        apiVersion: "2026-02-25.clover",
        typescript: true,
      });
    }
    return (_stripe as unknown as Record<string | symbol, unknown>)[prop];
  },
});
