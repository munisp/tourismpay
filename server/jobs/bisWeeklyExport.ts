/**
 * BIS Weekly Export Scheduler Job
 *
 * Runs every 30 minutes:
 * 1. Finds all enabled export schedules where nextRunAt <= now.
 * 2. For each schedule, generates a bulk notes export for all investigations
 *    matching the user's saved filters.
 * 3. Sends the export as an in-app notification to the user.
 * 4. If the scheduled user is the platform owner, also sends the full export
 *    text via the notifyOwner channel (owner email / platform notification).
 * 5. Updates nextRunAt to the next scheduled run time.
 * 6. Updates lastRunAt to now.
 */
import { getDb, createUserNotification } from "../db";
import { bisExportSchedules, bisInvestigations, bisInvestigationNotes, users } from "../../drizzle/schema";
import { eq, lte, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { ENV } from "../_core/env";

const JOB_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function computeNextRun(frequency: string): number {
  const now = new Date();
  const d = new Date(now);
  if (frequency === "weekly") {
    const daysUntilMonday = (8 - d.getUTCDay()) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  } else if (frequency === "biweekly") {
    d.setUTCDate(d.getUTCDate() + 14);
  } else {
    // monthly: first day of next month
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
  }
  d.setUTCHours(8, 0, 0, 0);
  return d.getTime();
}

/**
 * Determines if a given userId belongs to the platform owner.
 * The owner's openId is stored in ENV.ownerOpenId.
 */
async function isOwnerUser(userId: number): Promise<{ isOwner: boolean; email: string | null; name: string | null }> {
  const db = await getDb();
  if (!db) return { isOwner: false, email: null, name: null };
  try {
    const [user] = await db
      .select({ openId: users.openId, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return { isOwner: false, email: null, name: null };
    const ownerOpenId = ENV.ownerOpenId ?? "";
    return {
      isOwner: ownerOpenId.length > 0 && user.openId === ownerOpenId,
      email: user.email ?? null,
      name: user.name ?? null,
    };
  } catch {
    return { isOwner: false, email: null, name: null };
  }
}

async function runCycle() {
  const db = await getDb();
  if (!db) return;

  const nowMs = Date.now();

  // Find all enabled schedules that are due
  const dueSchedules = await db
    .select()
    .from(bisExportSchedules)
    .where(and(eq(bisExportSchedules.enabled, true), lte(bisExportSchedules.nextRunAt, nowMs)));

  if (!dueSchedules || dueSchedules.length === 0) return;

  console.log(`[BISWeeklyExport] Processing ${dueSchedules.length} due schedule(s)`);

  for (const schedule of dueSchedules) {
    try {
      // Fetch investigations for this user (apply saved filters if any)
      const filters = (schedule.filters ?? {}) as Record<string, unknown>;
      let query = db
        .select({
          id: bisInvestigations.id,
          referenceId: bisInvestigations.referenceId,
          subjectFullName: bisInvestigations.subjectFullName,
          status: bisInvestigations.status,
        })
        .from(bisInvestigations)
        .$dynamic();

      // Apply status filter if present
      if (filters.status && typeof filters.status === "string") {
        query = query.where(sql`${bisInvestigations.status} = ${filters.status}` as any);
      }

      const investigations = await query.limit(200);

      if (!investigations || investigations.length === 0) {
        // No investigations to export — skip but still advance the schedule
        await db
          .update(bisExportSchedules)
          .set({ lastRunAt: nowMs, nextRunAt: computeNextRun(schedule.frequency), updatedAt: nowMs })
          .where(eq(bisExportSchedules.id, schedule.id));
        continue;
      }

      // Build the export text
      const dateStr = new Date(nowMs).toISOString().slice(0, 10);
      const separator = "=".repeat(60);
      const sections: string[] = [
        separator,
        `TourismPay BIS Investigation Notes Export`,
        `Generated: ${new Date(nowMs).toUTCString()}`,
        `Schedule: ${schedule.frequency} | User ID: ${schedule.userId}`,
        `Investigations: ${investigations.length}`,
        separator,
        "",
      ];

      let totalNotes = 0;

      for (const inv of investigations) {
        // Fetch notes for this investigation
        const notesQuery = db
          .select()
          .from(bisInvestigationNotes)
          .where(
            schedule.includeInternal
              ? eq(bisInvestigationNotes.investigationId, String(inv.id))
              : and(
                  eq(bisInvestigationNotes.investigationId, String(inv.id)),
                  eq(bisInvestigationNotes.isInternal, false)
                )
          )
          .$dynamic();

        const notes = await notesQuery.limit(100);

        sections.push(`Investigation: ${inv.referenceId}`);
        sections.push(`Subject:       ${inv.subjectFullName}`);
        sections.push(`Status:        ${inv.status}`);
        sections.push(`Notes:         ${notes.length}`);
        sections.push("");

        if (notes.length === 0) {
          sections.push("  (No notes for this investigation)");
          sections.push("");
        } else {
          notes.forEach((note, idx) => {
            sections.push(`  --- Note ${idx + 1}${note.isInternal ? " [INTERNAL]" : ""} ---`);
            sections.push(`  Author: ${note.authorName}`);
            sections.push(`  Date:   ${new Date(Number(note.createdAt)).toLocaleString()}`);
            sections.push("");
            sections.push(`  ${note.content.replace(/\n/g, "\n  ")}`);
            sections.push("");
          });
          totalNotes += notes.length;
        }
      }

      sections.push(separator);
      sections.push(`END OF EXPORT — Total notes: ${totalNotes}`);

      const exportText = sections.join("\n");
      const filename = `bis-notes-export-${dateStr}.txt`;

      // ── 1. In-app notification (all users) ──────────────────────────────────
      // Truncate to 4000 chars for notification body; full text in metadata
      const truncated = exportText.length > 4000
        ? exportText.slice(0, 3900) + "\n\n... [truncated — download full export from BIS Dashboard]"
        : exportText;

      await createUserNotification({
        userId: schedule.userId,
        category: "bis",
        title: `Scheduled BIS Notes Export — ${dateStr}`,
        content: `Your ${schedule.frequency} BIS investigation notes export is ready.\n\n${investigations.length} investigation(s), ${totalNotes} note(s).\n\nFilename: ${filename}\n\n---\n${truncated}`,
        actionUrl: "/bis",
        actionLabel: "View Investigations",
        metadata: { exportText, filename, totalNotes, investigationCount: investigations.length },
      }).catch(() => {});

      // ── 2. Email delivery via notifyOwner (owner users only) ─────────────────
      // The notifyOwner channel delivers to the platform owner's registered email
      // via the platform notification service. We only use this for the owner to avoid
      // sending unsolicited emails to regular users.
      const { isOwner, name: ownerName } = await isOwnerUser(schedule.userId);
      if (isOwner) {
        const emailSubject = `[TourismPay] Scheduled BIS Notes Export — ${dateStr}`;
        const greeting = ownerName ? `Hi ${ownerName},` : "Hi,";
        const emailBody = [
          greeting,
          "",
          `Your ${schedule.frequency} BIS investigation notes export has been generated and is ready for review.`,
          "",
          `  • Investigations included: ${investigations.length}`,
          `  • Total notes: ${totalNotes}`,
          `  • Generated: ${new Date(nowMs).toUTCString()}`,
          `  • Filename: ${filename}`,
          "",
          "You can download the full export from the BIS Dashboard → Investigations → Export All Notes.",
          "",
          "--- Export Preview (first 3,000 characters) ---",
          "",
          exportText.slice(0, 3000) + (exportText.length > 3000 ? "\n\n[...truncated. Full export available in the BIS Dashboard.]" : ""),
        ].join("\n");

        notifyOwner({
          title: emailSubject,
          content: emailBody,
        }).catch((err) => {
          console.warn(`[BISWeeklyExport] Failed to send owner email notification for schedule ${schedule.id}:`, err);
        });
      }

      // ── 3. Advance the schedule ──────────────────────────────────────────────
      const nextRunAt = computeNextRun(schedule.frequency);
      await db
        .update(bisExportSchedules)
        .set({ lastRunAt: nowMs, nextRunAt, updatedAt: nowMs, lastExportNoteCount: totalNotes })
        .where(eq(bisExportSchedules.id, schedule.id));

      console.log(`[BISWeeklyExport] Exported ${totalNotes} notes for user ${schedule.userId} (${schedule.frequency})${isOwner ? " + owner email sent" : ""}`);
    } catch (err) {
      console.error(`[BISWeeklyExport] Error processing schedule ${schedule.id}:`, err);
    }
  }

  // Notify owner with a summary of how many exports ran
  if (dueSchedules.length > 0) {
    notifyOwner({
      title: `BIS Scheduled Exports Ran — ${dueSchedules.length} user(s)`,
      content: `${dueSchedules.length} scheduled BIS notes export(s) were processed. In-app notifications delivered to all scheduled users. Owner email delivery triggered for owner-linked schedules.`,
    }).catch(() => {});
  }
}

export function startBisWeeklyExportJob() {
  console.log("[BISWeeklyExport] Starting scheduled export job (interval: 30min)");
  runCycle().catch(console.error);
  setInterval(() => runCycle().catch(console.error), JOB_INTERVAL_MS);
}
