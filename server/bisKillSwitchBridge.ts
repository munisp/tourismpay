/**
 * bisKillSwitchBridge.ts
 *
 * Bridges BIS investigation findings to PaymentSwitch kill switch activations.
 * When a BIS investigation is marked as "flagged" with riskLevel "high" or
 * "critical", this module:
 *   1. Determines the relevant PaymentSwitch corridor(s) from the subject's country.
 *   2. Activates the kill switch for those corridors via a direct DB write.
 *   3. Records the activation in the bis_kill_switch_activations audit table.
 *   4. Dispatches a webhook event: "bis.kill_switch_activated".
 *
 * All errors are caught and logged without re-throwing, so the BIS update
 * never fails due to bridge errors.
 */

import { getDb } from "./db";
import {
  psKillSwitches,
  psKillSwitchHistory,
  bisKillSwitchActivations,
} from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { dispatchWebhookEvent } from "./webhookEngine";

// ─── Country → Corridor mapping ───────────────────────────────────────────────
// Maps ISO-3166-1 alpha-2 country codes to the most relevant PaymentSwitch corridors.
const COUNTRY_TO_CORRIDORS: Record<string, string[]> = {
  NG: ["USD-NGN", "GBP-NGN", "EUR-NGN"],
  KE: ["USD-KES", "EUR-KES"],
  GH: ["USD-GHS"],
  ZA: ["USD-ZAR"],
  TZ: ["USD-TZS"],
  UG: ["USD-UGX"],
  MA: ["USD-MAD"],
  SN: ["USD-XOF"],
  CI: ["USD-XOF"],
  BF: ["USD-XOF"],
  ML: ["USD-XOF"],
  NE: ["USD-XOF"],
  BJ: ["USD-XOF"],
  TG: ["USD-XOF"],
  GW: ["USD-XOF"],
};

// Risk levels that trigger automatic kill switch activation
const AUTO_ACTIVATE_RISK_LEVELS = new Set(["critical", "high"]);

// The system actor ID used for auto-activations (0 = system)
const SYSTEM_ACTOR_ID = 0;

export interface BisKillSwitchBridgeInput {
  bisInvestigationId: number;
  bisReferenceId: string;
  subjectFullName: string;
  subjectCountry?: string | null;
  riskLevel: string;
  riskScore?: number | null;
  bisStatus: string;
}

export interface BisKillSwitchBridgeResult {
  activated: boolean;
  corridors: string[];
  skipped: boolean;
  skipReason?: string;
}

/**
 * Determine which corridors to activate based on the subject's country.
 * Falls back to "GLOBAL" if the country is unknown.
 */
function resolveCorridors(subjectCountry?: string | null): string[] {
  if (!subjectCountry) return ["GLOBAL"];
  const corridors = COUNTRY_TO_CORRIDORS[subjectCountry.toUpperCase()];
  if (!corridors || corridors.length === 0) return ["GLOBAL"];
  return corridors;
}

/**
 * Activate a single corridor's kill switch in the DB.
 * Upserts the ps_kill_switches row and appends a history record.
 */
async function activateCorridorKillSwitch(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  corridor: string,
  reason: string,
  now: number
): Promise<void> {
  const existing = await db
    .select()
    .from(psKillSwitches)
    .where(eq(psKillSwitches.corridor, corridor))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(psKillSwitches).values({
      corridor,
      isActive: true,
      activatedBy: SYSTEM_ACTOR_ID,
      activatedByName: "BIS Auto-Bridge",
      reason,
      activatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(psKillSwitches)
      .set({
        isActive: true,
        activatedBy: SYSTEM_ACTOR_ID,
        activatedByName: "BIS Auto-Bridge",
        reason,
        activatedAt: now,
        deactivatedAt: undefined,
        deactivatedBy: undefined,
        deactivatedByName: undefined,
        updatedAt: now,
      })
      .where(eq(psKillSwitches.corridor, corridor));
  }

  // Append history record
  await db.insert(psKillSwitchHistory).values({
    corridor,
    action: "activated",
    actorId: SYSTEM_ACTOR_ID,
    actorName: "BIS Auto-Bridge",
    reason,
    metadata: { source: "bis_kill_switch_bridge" },
    createdAt: now,
  });
}

/**
 * Main entry point: called from bis.ts updateStatus after a high-risk finding.
 * Returns a result object describing what was done; never throws.
 */
export async function triggerKillSwitchFromBis(
  input: BisKillSwitchBridgeInput
): Promise<BisKillSwitchBridgeResult> {
  // Only activate for high/critical risk levels
  if (!AUTO_ACTIVATE_RISK_LEVELS.has(input.riskLevel)) {
    return {
      activated: false,
      corridors: [],
      skipped: true,
      skipReason: `Risk level "${input.riskLevel}" does not meet threshold for auto-activation`,
    };
  }

  // Only activate when BIS status is "flagged" (confirmed fraud)
  if (input.bisStatus !== "flagged") {
    return {
      activated: false,
      corridors: [],
      skipped: true,
      skipReason: `BIS status "${input.bisStatus}" does not trigger kill switch (requires "flagged")`,
    };
  }

  const db = await getDb();
  if (!db) {
    return {
      activated: false,
      corridors: [],
      skipped: true,
      skipReason: "Database unavailable",
    };
  }

  const corridors = resolveCorridors(input.subjectCountry);
  const now = Date.now();
  const reason =
    `BIS investigation ${input.bisReferenceId} for subject "${input.subjectFullName}" ` +
    `flagged as ${input.riskLevel.toUpperCase()} risk (score: ${input.riskScore ?? "N/A"}/100). ` +
    `Auto-activated by BIS Kill Switch Bridge.`;

  const activatedCorridors: string[] = [];

  for (const corridor of corridors) {
    try {
      await activateCorridorKillSwitch(db, corridor, reason, now);
      activatedCorridors.push(corridor);

      // Audit record per corridor
      await db.insert(bisKillSwitchActivations).values({
        bisInvestigationId: input.bisInvestigationId,
        bisReferenceId: input.bisReferenceId,
        subjectFullName: input.subjectFullName,
        riskLevel: input.riskLevel,
        riskScore: input.riskScore ?? undefined,
        corridor,
        reason,
        activatedBy: "BIS_AUTO",
        createdAt: now,
      });
    } catch (err) {
      console.error(
        `[BisKillSwitchBridge] Failed to activate corridor ${corridor}:`,
        err
      );
    }
  }

  // Dispatch webhook event for all activated corridors (fire-and-forget)
  if (activatedCorridors.length > 0) {
    dispatchWebhookEvent("bis.kill_switch_activated", {
      bisInvestigationId: input.bisInvestigationId,
      bisReferenceId: input.bisReferenceId,
      subjectFullName: input.subjectFullName,
      riskLevel: input.riskLevel,
      riskScore: input.riskScore,
      corridors: activatedCorridors,
      reason,
      activatedAt: new Date(now).toISOString(),
    }).catch(() => {});
  }

  return {
    activated: activatedCorridors.length > 0,
    corridors: activatedCorridors,
    skipped: false,
  };
}

/**
 * List all BIS-triggered kill switch activations (for the audit/admin page).
 */
export async function listBisKillSwitchActivations(opts?: {
  bisInvestigationId?: number;
  corridor?: string;
  limit?: number;
}): Promise<(typeof bisKillSwitchActivations.$inferSelect)[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions: ReturnType<typeof eq>[] = [];
  if (opts?.bisInvestigationId !== undefined) {
    conditions.push(eq(bisKillSwitchActivations.bisInvestigationId, opts.bisInvestigationId));
  }
  if (opts?.corridor) {
    conditions.push(eq(bisKillSwitchActivations.corridor, opts.corridor));
  }
  const query = db
    .select()
    .from(bisKillSwitchActivations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(bisKillSwitchActivations.createdAt))
    .limit(opts?.limit ?? 100);
  return query;
}
