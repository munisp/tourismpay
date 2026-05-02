import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { globalSearch } from "../db";

export const searchRouter = router({
  /**
   * Global search across establishments, BIS investigations, and KYB applications.
   * Requires at least 2 characters.
   */
  global: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(100),
      })
    )
    .query(async ({ input }) => {
      const results = await globalSearch(input.query);

      // Flatten into a ranked list with category tags
      const items: Array<{
        id: number;
        category: "establishment" | "investigation" | "kyb_application";
        title: string;
        subtitle: string;
        href: string;
        badge?: string;
        badgeColor?: string;
      }> = [];

      for (const est of results.establishments) {
        items.push({
          id: est.id,
          category: "establishment",
          title: est.name,
          subtitle: `${est.type} · ${est.country}${est.contactEmail ? ` · ${est.contactEmail}` : ""}`,
          href: `/africa/registry`,
          badge: est.kybStatus,
          badgeColor:
            est.kybStatus === "approved"
              ? "green"
              : est.kybStatus === "rejected"
              ? "red"
              : est.kybStatus === "under_review"
              ? "yellow"
              : "gray",
        });
      }

      for (const inv of results.investigations) {
        items.push({
          id: inv.id,
          category: "investigation",
          title: inv.subjectFullName,
          subtitle: `${inv.referenceId} · ${inv.tier} tier${inv.subjectEmail ? ` · ${inv.subjectEmail}` : ""}`,
          href: `/bis/${inv.id}`,
          badge: inv.status,
          badgeColor:
            inv.status === "completed"
              ? "green"
              : inv.status === "flagged"
              ? "red"
              : inv.status === "processing"
              ? "blue"
              : "gray",
        });
      }

      for (const app of results.kybApplications) {
        items.push({
          id: app.id,
          category: "kyb_application",
          title: `KYB Application #${app.id}`,
          subtitle: `Step ${app.currentStep} · ${app.status}${app.complianceScore != null ? ` · Score: ${app.complianceScore}` : ""}`,
          href: `/admin/kyb-applications`,
          badge: app.status,
          badgeColor:
            app.status === "approved"
              ? "green"
              : app.status === "rejected"
              ? "red"
              : app.status === "under_review"
              ? "yellow"
              : "gray",
        });
      }

      return {
        items,
        counts: {
          establishments: results.establishments.length,
          investigations: results.investigations.length,
          kybApplications: results.kybApplications.length,
          total: items.length,
        },
      };
    }),
});
