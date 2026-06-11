/**
 * BIS Investigation Auto-Advance Job
 *
 * Simulates the external BIS API lifecycle:
 *   pending  → processing  (after ~30s)
 *   processing → completed / flagged  (after ~60s)
 *
 * Runs every 60 seconds when started via startBisAutoAdvanceJob().
 * Can also be triggered manually via the bisJobs.triggerAutoAdvance admin procedure.
 */

import {
  getPendingBisInvestigations,
  getProcessingBisInvestigations,
  advanceBisInvestigationToProcessing,
  completeBisInvestigation,
  createUserNotification,
  getDb,
} from "../db";
import { establishments, bisInvestigations, users } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { sendTransactionalEmail, buildBisEmailHtml } from "../_core/email";
import { eq } from "drizzle-orm";

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function generateRiskScore(tier: string): number {
  const rand = crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF;
  if (tier === "basic") return Math.floor(rand * 40); // 0–39 (mostly low risk)
  if (tier === "standard") return Math.floor(rand * 60 + 10); // 10–69
  return Math.floor(rand * 80 + 10); // 10–89 (comprehensive)
}

function riskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score < 30) return "low";
  if (score < 55) return "medium";
  if (score < 75) return "high";
  return "critical";
}

function generateModuleResults(tier: string, riskScore: number) {
  const base = {
    identity: {
      score: Math.max(60, 100 - riskScore),
      status: riskScore > 70 ? "UNVERIFIED" : "VERIFIED",
      detail: riskScore > 70 ? "NIN could not be matched" : "NIN matched successfully",
    },
    criminal: {
      score: Math.max(50, 100 - riskScore * 0.8),
      status: riskScore > 65 ? "RECORDS_FOUND" : "CLEAR",
      detail: riskScore > 65 ? "Minor offence record found (2019)" : "No criminal records found",
    },
  };

  if (tier === "standard" || tier === "comprehensive") {
    Object.assign(base, {
      employment: {
        score: Math.max(55, 100 - riskScore * 0.6),
        status: riskScore > 60 ? "DISCREPANCY" : "VERIFIED",
        detail: riskScore > 60 ? "Employment gap of 8 months detected" : "Employment history verified",
      },
      financial: {
        score: Math.max(50, 100 - riskScore * 0.7),
        status: riskScore > 72 ? "ADVERSE" : "CLEAR",
        detail: riskScore > 72 ? "County court judgment found" : "No adverse financial records",
      },
    });
  }

  if (tier === "comprehensive") {
    Object.assign(base, {
      social_media: {
        score: Math.max(60, 100 - riskScore * 0.5),
        status: riskScore > 75 ? "FLAGGED" : "CLEAR",
        detail: riskScore > 75 ? "Potentially problematic content identified" : "No adverse social media content",
      },
      sanctions: {
        score: Math.max(70, 100 - riskScore * 0.3),
        status: riskScore > 85 ? "MATCH" : "CLEAR",
        detail: riskScore > 85 ? "Partial name match on OFAC list" : "No sanctions matches",
      },
    });
  }

  return base;
}

function generateRecommendations(riskScore: number, riskLvl: string): string[] {
  const recs: string[] = [];
  if (riskScore < 30) {
    recs.push("Proceed with hiring — low risk profile");
    recs.push("Standard annual re-verification recommended");
  } else if (riskScore < 55) {
    recs.push("Proceed with caution — medium risk profile");
    recs.push("Conduct in-person interview to clarify employment gaps");
    recs.push("Semi-annual re-verification recommended");
  } else if (riskScore < 75) {
    recs.push("High risk — additional verification required before hiring");
    recs.push("Request original documents for manual review");
    recs.push("Consult legal counsel regarding criminal record findings");
    recs.push("Quarterly monitoring recommended if hired");
  } else {
    recs.push("Critical risk — do not proceed without full legal review");
    recs.push("Escalate to compliance team immediately");
    recs.push("Consider reporting to relevant regulatory authority");
    recs.push("Monthly monitoring mandatory if exception granted");
  }
  return recs;
}

// ─── Job logic ────────────────────────────────────────────────────────────────

export async function runBisAutoAdvanceCycle(): Promise<{
  advanced: number;
  completed: number;
  errors: number;
}> {
  let advanced = 0;
  let completed = 0;
  let errors = 0;

  try {
    // Step 1: Advance pending → processing
    const pending = await getPendingBisInvestigations(5);
    for (const inv of pending) {
      try {
        const row = await advanceBisInvestigationToProcessing(inv.id);
        if (row) {
          advanced++;
          console.log(`[BIS Job] Advanced investigation ${inv.referenceId} → processing`);
        }
      } catch (err) {
        errors++;
        console.error(`[BIS Job] Failed to advance investigation ${inv.id}:`, err);
      }
    }

    // Step 2: Complete processing → completed/flagged
    const processing = await getProcessingBisInvestigations(5);
    for (const inv of processing) {
      try {
        const riskScore = generateRiskScore(inv.tier);
        const level = riskLevel(riskScore);
        const moduleResults = generateModuleResults(inv.tier, riskScore);
        const recommendations = generateRecommendations(riskScore, level);
        const finalStatus = riskScore >= 70 ? "flagged" : "completed";

        const row = await completeBisInvestigation(inv.id, {
          riskScore,
          riskLevel: level,
          moduleResults,
          recommendations,
          status: finalStatus,
        });

        if (row) {
          completed++;
          console.log(`[BIS Job] Completed investigation ${inv.referenceId} → ${finalStatus} (score: ${riskScore})`);

          // Notify the requester (BIS analyst)
          if (inv.requestedBy) {
            const emoji = finalStatus === "flagged" ? "🚩" : "✅";
            await createUserNotification({
              userId: inv.requestedBy,
              category: "bis",
              title: `${emoji} Investigation ${finalStatus === "flagged" ? "Flagged" : "Completed"}: ${inv.subjectFullName}`,
              content: `Background investigation for ${inv.subjectFullName} (${inv.referenceId}) is ${finalStatus}. Risk score: ${riskScore}/100 (${level}). ${recommendations[0]}`,
              actionUrl: `/bis/report/${inv.id}`,
              actionLabel: "View Report",
            }).catch(() => null);
          }

          // Notify the establishment owner (merchant) when their own BIS investigation completes
          if (inv.establishmentId) {
            try {
              const db = await getDb();
              if (db) {
                const [est] = await db
                  .select({
                    ownerId: establishments.ownerId,
                    name: establishments.name,
                    ownerEmail: users.email,
                    ownerName: users.name,
                  })
                  .from(establishments)
                  .leftJoin(users, eq(users.id, establishments.ownerId))
                  .where(eq(establishments.id, inv.establishmentId))
                  .limit(1);
                if (est?.ownerId) {
                  const merchantEmoji = finalStatus === "flagged" ? "⚠️" : "✅";
                  const merchantTitle = finalStatus === "flagged"
                    ? `BIS Investigation Flagged — Action Required`
                    : `BIS Investigation Complete — KYB Eligible`;
                  const merchantContent = finalStatus === "flagged"
                    ? `Your Background Investigation (${inv.referenceId}) for ${est.name} has been flagged for review. Risk score: ${riskScore}/100. A compliance officer will contact you within 2 business days. You can view the status on your BIS Compliance page.`
                    : `Your Background Investigation (${inv.referenceId}) for ${est.name} is complete. Risk score: ${riskScore}/100 (${level}). Your KYB application is now eligible for admin approval — this typically takes 1–3 business days.`;
                  await createUserNotification({
                    userId: est.ownerId,
                    category: "bis",
                    title: `${merchantEmoji} ${merchantTitle}`,
                    content: merchantContent,
                    actionUrl: "/merchant/bis-status",
                    actionLabel: "View BIS Status",
                  }).catch(() => null);
                  console.log(`[BIS Job] Merchant notification sent to owner ${est.ownerId} for establishment ${est.name}`);

                  // Send transactional email to merchant owner if their email is available
                  if (est.ownerEmail) {
                    const actionUrl = `${process.env.VITE_OAUTH_PORTAL_URL ?? "https://tourismpay.com"}/merchant/bis-status`;
                    const htmlBody = buildBisEmailHtml({
                      merchantName: est.ownerName ?? "Merchant",
                      establishmentName: est.name ?? "your establishment",
                      referenceId: inv.referenceId,
                      status: finalStatus as "completed" | "flagged",
                      riskScore,
                      riskLevel: level,
                      recommendation: recommendations[0] ?? "Please review your BIS status.",
                      actionUrl,
                    });
                    await sendTransactionalEmail({
                      userId: est.ownerId,
                      to: est.ownerEmail,
                      subject: `${merchantEmoji} ${merchantTitle} — TourismPay`,
                      text: merchantContent,
                      html: htmlBody,
                      category: "bis",
                      actionUrl: "/merchant/bis-status",
                      actionLabel: "View BIS Status",
                    }).catch((emailErr) => {
                      console.error(`[BIS Job] Email send failed for owner ${est.ownerId}:`, emailErr);
                    });
                  }
                }
              }
            } catch (notifErr) {
              console.error(`[BIS Job] Failed to notify merchant owner for establishment ${inv.establishmentId}:`, notifErr);
            }
          }

          // Notify owner
          await notifyOwner({
            title: `BIS Investigation ${finalStatus === "flagged" ? "Flagged" : "Completed"}: ${inv.referenceId}`,
            content: `Subject: ${inv.subjectFullName} | Risk: ${riskScore}/100 (${level}) | Status: ${finalStatus}\n${recommendations[0]}`,
          }).catch(() => null);
        }
      } catch (err) {
        errors++;
        console.error(`[BIS Job] Failed to complete investigation ${inv.id}:`, err);
      }
    }
  } catch (err) {
    errors++;
    console.error("[BIS Job] Cycle error:", err);
  }

  // Step 3: Detect and alert on SLA breaches
  try {
    const db = await getDb();
    if (db) {
      const nowMs = Date.now();
      const processingRows = await db
        .select({
          id: bisInvestigations.id,
          referenceId: bisInvestigations.referenceId,
          subjectFullName: bisInvestigations.subjectFullName,
          riskLevel: bisInvestigations.riskLevel,
          dueAt: bisInvestigations.dueAt,
          slaHours: bisInvestigations.slaHours,
          assignedToId: bisInvestigations.assignedToId,
          assignedToName: bisInvestigations.assignedToName,
        })
        .from(bisInvestigations)
        .where(eq(bisInvestigations.status, "processing"));
      const breaches = processingRows.filter(r => r.dueAt != null && Number(r.dueAt) < nowMs);
      if (breaches.length > 0) {
        // Notify each assigned analyst (fire-and-forget)
        for (const inv of breaches) {
          if (inv.assignedToId) {
            const overdueHours = Math.floor((nowMs - Number(inv.dueAt)) / (60 * 60 * 1000));
            createUserNotification({
              userId: inv.assignedToId,
              category: "bis",
              title: `⚠️ SLA Breach: ${inv.referenceId} is ${overdueHours}h overdue`,
              content: `Investigation ${inv.referenceId} for subject "${inv.subjectFullName}" has breached its ${inv.slaHours ?? "N/A"}h SLA deadline by ${overdueHours} hour(s). Risk level: ${inv.riskLevel ?? "unknown"}. Please complete this investigation immediately.`,
              actionUrl: `/bis/report/${inv.id}`,
              actionLabel: "View Investigation",
            }).catch(() => null);
          }
        }
        // Send owner summary
        const summary = breaches
          .slice(0, 10)
          .map(inv => {
            const hrs = Math.floor((nowMs - Number(inv.dueAt)) / (60 * 60 * 1000));
            return `• ${inv.referenceId} (${inv.riskLevel ?? "unknown"}) — ${hrs}h overdue, assigned to: ${inv.assignedToName ?? "Unassigned"}`;
          })
          .join("\n");
        const moreCount = breaches.length > 10 ? breaches.length - 10 : 0;
        notifyOwner({
          title: `BIS SLA Breach Alert: ${breaches.length} investigation(s) overdue`,
          content: `${breaches.length} BIS investigation(s) have breached their SLA deadlines:\n\n${summary}${moreCount > 0 ? `\n... and ${moreCount} more` : ""}\n\nPlease review the BIS Dashboard immediately.`,
        }).catch(() => null);
        console.log(`[BIS Job] SLA breach alerts sent for ${breaches.length} investigation(s)`);
      }
    }
  } catch (err) {
    console.error("[BIS Job] SLA breach detection error:", err);
  }

  return { advanced, completed, errors };
}

// ─── Job scheduler ────────────────────────────────────────────────────────────

let jobInterval: ReturnType<typeof setInterval> | null = null;

export function startBisAutoAdvanceJob(intervalMs = 60_000): void {
  if (jobInterval) {
    console.log("[BIS Job] Already running");
    return;
  }
  console.log(`[BIS Job] Starting auto-advance job (interval: ${intervalMs / 1000}s)`);
  jobInterval = setInterval(async () => {
    const result = await runBisAutoAdvanceCycle();
    if (result.advanced > 0 || result.completed > 0) {
      console.log(`[BIS Job] Cycle complete — advanced: ${result.advanced}, completed: ${result.completed}, errors: ${result.errors}`);
    }
  }, intervalMs);
}

export function stopBisAutoAdvanceJob(): void {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    console.log("[BIS Job] Stopped");
  }
}
