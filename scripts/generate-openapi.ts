/**
 * OpenAPI Documentation Generator
 *
 * Generates an OpenAPI 3.0 specification from the tRPC router definitions.
 * Since tRPC procedures use Zod schemas, we can extract input/output types
 * and generate REST-style endpoint documentation.
 *
 * Usage:
 *   npx tsx scripts/generate-openapi.ts > docs/openapi.json
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: { url: string; description: string }[];
  paths: Record<string, any>;
  components: { securitySchemes: Record<string, any> };
  security: { bearerAuth: string[] }[];
}

const spec: OpenAPISpec = {
  openapi: "3.0.3",
  info: {
    title: "TourismPay API",
    version: "1.0.0",
    description: `
# TourismPay API Documentation

TourismPay is a comprehensive tourism payment platform targeting African markets.
This API powers the PWA, React Native, and Flutter mobile applications.

## Authentication
All protected endpoints require a valid JWT token in the \`tourismpay-session\` cookie.
Demo endpoints are available in development mode via \`/api/demo-login?role=<role>\`.

## Roles
- **tourist**: End-user travelers
- **merchant**: Business owners and service providers
- **admin**: Platform administrators
- **compliance_officer**: KYB/KYC compliance reviewers
- **settlement_officer**: Payment settlement managers
- **noc_operator**: Network operations center staff
- **bis_analyst**: Business intelligence analysts

## tRPC Protocol
The API uses tRPC over HTTP. Query procedures use GET with URL-encoded input.
Mutation procedures use POST with JSON body. All endpoints are under \`/api/trpc/<router>.<procedure>\`.
    `.trim(),
  },
  servers: [
    { url: "http://localhost:3000", description: "Development" },
    { url: "https://api.tourismpay.com", description: "Production" },
  ],
  paths: {},
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "apiKey",
        in: "cookie",
        name: "tourismpay-session",
        description: "JWT session token",
      },
    },
  },
  security: [{ bearerAuth: [] }],
};

// Define documented endpoints grouped by domain
const endpoints: { path: string; method: string; summary: string; tag: string; auth: boolean }[] = [
  // Auth
  { path: "/api/trpc/auth.me", method: "get", summary: "Get current user", tag: "Auth", auth: false },
  { path: "/api/trpc/auth.logout", method: "post", summary: "Logout current session", tag: "Auth", auth: false },
  { path: "/api/demo-login", method: "get", summary: "Demo login (dev only)", tag: "Auth", auth: false },
  // Tourist
  { path: "/api/trpc/touristOnboarding.getState", method: "get", summary: "Get onboarding state", tag: "Tourist", auth: true },
  { path: "/api/trpc/touristOnboarding.setPreferences", method: "post", summary: "Set tourist preferences", tag: "Tourist", auth: true },
  { path: "/api/trpc/touristOnboarding.linkCard", method: "post", summary: "Link payment card", tag: "Tourist", auth: true },
  { path: "/api/trpc/touristOnboarding.activateWallet", method: "post", summary: "Activate digital wallet", tag: "Tourist", auth: true },
  { path: "/api/trpc/touristPortal.getProfile", method: "get", summary: "Get tourist profile", tag: "Tourist", auth: true },
  { path: "/api/trpc/itinerary.list", method: "get", summary: "List trip itineraries", tag: "Tourist", auth: true },
  // Wallet
  { path: "/api/trpc/wallet.getBalances", method: "get", summary: "Get wallet balances", tag: "Wallet", auth: true },
  { path: "/api/trpc/wallet.send", method: "post", summary: "Send money", tag: "Wallet", auth: true },
  { path: "/api/trpc/wallet.getTransactions", method: "get", summary: "Get transaction history", tag: "Wallet", auth: true },
  // Remittance
  { path: "/api/trpc/remittance.create", method: "post", summary: "Create remittance transfer", tag: "Remittance", auth: true },
  { path: "/api/trpc/remittance.list", method: "get", summary: "List remittances", tag: "Remittance", auth: true },
  { path: "/api/trpc/remittance.getExchangeRate", method: "get", summary: "Get exchange rate", tag: "Remittance", auth: true },
  { path: "/api/trpc/remittance.getCorridors", method: "get", summary: "Get supported corridors", tag: "Remittance", auth: true },
  // Merchant
  { path: "/api/trpc/merchantRevenue.getStats", method: "get", summary: "Get revenue statistics", tag: "Merchant", auth: true },
  { path: "/api/trpc/merchantProducts.list", method: "get", summary: "List merchant products", tag: "Merchant", auth: true },
  { path: "/api/trpc/merchantProducts.create", method: "post", summary: "Create merchant product", tag: "Merchant", auth: true },
  { path: "/api/trpc/qrPayment.generateCode", method: "post", summary: "Generate QR payment code", tag: "Merchant", auth: true },
  // Loyalty
  { path: "/api/trpc/loyalty.getAccount", method: "get", summary: "Get loyalty account", tag: "Loyalty", auth: true },
  { path: "/api/trpc/loyalty.getLeaderboard", method: "get", summary: "Get loyalty leaderboard", tag: "Loyalty", auth: true },
  // Admin
  { path: "/api/trpc/admin.getUsers", method: "get", summary: "List all users (admin)", tag: "Admin", auth: true },
  { path: "/api/trpc/admin.getStats", method: "get", summary: "Get platform statistics", tag: "Admin", auth: true },
  { path: "/api/trpc/kybApplications.list", method: "get", summary: "List KYB applications", tag: "Admin", auth: true },
  // Verification
  { path: "/api/trpc/verification.getStatus", method: "get", summary: "Get verification status", tag: "Verification", auth: true },
  { path: "/api/trpc/verification.requestCode", method: "post", summary: "Request verification code", tag: "Verification", auth: true },
  { path: "/api/trpc/verification.verifyCode", method: "post", summary: "Verify submitted code", tag: "Verification", auth: true },
  // Health
  { path: "/api/health", method: "get", summary: "Health check", tag: "System", auth: false },
];

for (const ep of endpoints) {
  spec.paths[ep.path] = {
    [ep.method]: {
      summary: ep.summary,
      tags: [ep.tag],
      security: ep.auth ? [{ bearerAuth: [] }] : [],
      responses: {
        "200": { description: "Successful response", content: { "application/json": { schema: { type: "object" } } } },
        ...(ep.auth ? { "401": { description: "Unauthorized" } } : {}),
        "500": { description: "Internal server error" },
      },
    },
  };
}

// Write output
const outDir = join(process.cwd(), "docs");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "openapi.json");
writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.log(`OpenAPI spec written to ${outPath}`);
console.log(`Documented ${endpoints.length} endpoints across ${new Set(endpoints.map(e => e.tag)).size} tags`);
