/**
 * GDS Platform — Standalone Express Server
 * Integrates with TourismPay via REST API for tax, tipping, loyalty, remittance.
 * Runs independently on its own port (default: 4000).
 */
import express from "express";
import cors from "cors";
import path from "path";
import jwt from "jsonwebtoken";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers/index";
import { createContext } from "./middleware/context";

const app = express();
const PORT = process.env.GDS_PORT || 4000;
const JWT_SECRET = process.env.GDS_JWT_SECRET || "gds-dev-secret-32chars-minimum!!";

app.use(cors({ origin: process.env.GDS_CORS_ORIGIN || "*", credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gds-platform", version: "1.0.0", port: PORT });
});

// Auth endpoint (standalone GDS login)
app.post("/api/v1/auth/login", (req, res) => {
  const { email, password } = req.body;

  // Dev mode: accept any credentials
  const devUsers: Record<string, { id: string; name: string; role: string }> = {
    "admin@gds.tourismpay.com": { id: "user_admin", name: "GDS Admin", role: "gds_admin" },
    "revenue@gds.tourismpay.com": { id: "user_revenue", name: "Revenue Manager", role: "revenue_manager" },
    "agent@safarilink.co.ke": { id: "user_agent", name: "Safari Agent", role: "gds_agent" },
    "manager@ekohotels.ng": { id: "user_manager", name: "Property Manager", role: "property_manager" },
  };

  const user = devUsers[email];
  if (!user || password !== "gds123") {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ sub: user.id, email, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
  res.json({ token, user: { ...user, email } });
});

// tRPC API
app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

// Serve static client in production
const clientDist = path.join(__dirname, "../dist/client");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[GDS Platform] Running on http://localhost:${PORT}`);
  console.log(`[GDS Platform] TourismPay API: ${process.env.TOURISMPAY_API_URL || "http://localhost:3000"}`);
  console.log(`[GDS Platform] Mode: standalone`);
});

export type { AppRouter } from "./routers/index";
