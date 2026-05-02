/**
 * TourismPay Mobile — tRPC Client
 *
 * Connects the Expo React Native app to the TourismPay PWA backend.
 * The backend URL is configured via the EXPO_PUBLIC_API_URL environment variable.
 * Default: http://localhost:3000 (for local dev with the PWA running)
 *
 * For production: set EXPO_PUBLIC_API_URL to the deployed PWA URL
 * e.g. https://tourismpay.manus.space
 */
import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../tourismpay-pwa/server/routers";

// tRPC client instance — import { trpc } from '@/lib/trpc' in screens
export const trpc = createTRPCReact<AppRouter>();

// Base URL for the backend — override with EXPO_PUBLIC_API_URL in .env
export const API_BASE_URL =
  (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Build the tRPC HTTP batch link.
 * Call this once in your root _layout.tsx provider setup.
 *
 * @param sessionCookie  Optional session cookie string to forward for auth.
 *                       In production, use expo-secure-store to persist the
 *                       cookie value after OAuth login.
 */
export function buildTRPCClient(sessionCookie?: string) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_BASE_URL}/api/trpc`,
        transformer: superjson,
        headers() {
          return sessionCookie
            ? { Cookie: sessionCookie }
            : {};
        },
      }),
    ],
  });
}
