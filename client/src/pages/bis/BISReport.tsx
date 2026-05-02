import { useParams, Link, useSearch } from "wouter";
import { useState, useEffect } from "react";
import {
  Shield, Download, Share2, ArrowLeft, Loader2, AlertCircle,
  CheckCircle, FileText, RefreshCw, ExternalLink, Clock, Flag,
  Users, Plus, Trash2, Link2, UserCheck, Package, DollarSign
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import RiskRing from "@/components/shared/RiskRing";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskBadgeClass(level: string | null | undefined): string {
  switch (level) {
    case "critical": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "high": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "medium": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "low": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

const statusStyles: Record<string, string> = {
  pending: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  flagged: "bg-red-500/20 text-red-400 border-red-500/30",
  failed: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─── Directors Panel Component ───────────────────────────────────────────────

function DirectorsPanel({ investigationId }: { investigationId: number }) {
  const utils = trpc.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [showBundleModal, setShowBundleModal] = useState(false);
  const [bundleTier, setBundleTier] = useState<"basic" | "standard" | "comprehensive">("standard");
  const [form, setForm] = useState({
    fullName: "", role: "Director" as string,
    nationality: "", nin: "", email: "", phone: "", ownershipPercent: "",
  });

  const { data: directors = [], isLoading } = trpc.bis.listDirectors.useQuery(
    { investigationId },
    { enabled: investigationId > 0 }
  );

  const uninvestigated = directors.filter((d: any) => !d.linkedInvestigationId);

  const addMutation = trpc.bis.addDirector.useMutation({
    onSuccess: () => {
      utils.bis.listDirectors.invalidate({ investigationId });
      setShowAdd(false);
      setForm({ fullName: "", role: "Director", nationality: "", nin: "", email: "", phone: "", ownershipPercent: "" });
      toast.success("Director added");
    },
    onError: (e) => toast.error("Failed to add director", { description: e.message }),
  });

  const removeMutation = trpc.bis.removeDirector.useMutation({
    onSuccess: () => {
      utils.bis.listDirectors.invalidate({ investigationId });
      toast.success("Director removed");
    },
    onError: (e) => toast.error("Failed to remove director", { description: e.message }),
  });

  const bundleMutation = trpc.bis.bundleDirectorInvestigation.useMutation({
    onSuccess: (data) => {
      utils.bis.listDirectors.invalidate({ investigationId });
      toast.success(`Individual investigation created`, {
        description: `$${data.price} (${data.discountPercent}% bundle discount) — Investigation #${data.investigationId}`,
      });
    },
    onError: (e) => toast.error("Bundle failed", { description: e.message }),
  });

  const bundleAllMutation = trpc.bis.bundleAllDirectors.useMutation({
    onSuccess: (data) => {
      setShowBundleModal(false);
      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    },
    onError: (e) => toast.error("Bundle checkout failed", { description: e.message }),
  });

  // Price preview calculation (client-side, matches server)
  const TIER_BASE: Record<string, number> = { basic: 49, standard: 99, comprehensive: 199 };
  const DISCOUNT = 20;
  const unitPrice = Math.round(TIER_BASE[bundleTier] * (1 - DISCOUNT / 100) * 100) / 100;
  const totalPrice = Math.round(unitPrice * uninvestigated.length * 100) / 100;

  const ROLES = ["Director", "CEO", "CFO", "Secretary", "Shareholder", "Other"];
  const TIERS = [
    { value: "basic", label: "Basic", basePrice: 49 },
    { value: "standard", label: "Standard", basePrice: 99 },
    { value: "comprehensive", label: "Comprehensive", basePrice: 199 },
  ];

  return (
    <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "120ms", animationFillMode: "forwards" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          <Users className="w-4 h-4 text-primary" />
          Directors & Key Personnel
        </h3>
        <div className="flex items-center gap-2">
          {uninvestigated.length >= 2 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
              onClick={() => setShowBundleModal(true)}
            >
              <Package className="w-3 h-3" /> Bundle All ({uninvestigated.length})
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(true)}>
            <Plus className="w-3 h-3" /> Add Director
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
      ) : directors.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground">
          <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
          No directors added yet. Add directors to run bundled individual investigations at a 20% discount.
        </div>
      ) : (
        <div className="space-y-2">
          {directors.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <UserCheck className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground truncate">{d.fullName}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{d.role}</Badge>
                  {d.ownershipPercent && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{d.ownershipPercent}%</Badge>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {[d.nationality, d.nin ? `NIN: ${d.nin}` : null, d.email].filter(Boolean).join(" · ")}
                </div>
                {d.linkedInvestigationId && (
                  <div className="flex items-center gap-1 mt-1">
                    <Link2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-500">Linked investigation #{d.linkedInvestigationId}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!d.linkedInvestigationId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                    disabled={bundleMutation.isPending}
                    onClick={() => bundleMutation.mutate({ directorId: d.id, tier: "standard" })}
                    title="Create bundled individual investigation (20% discount)"
                  >
                    <Shield className="w-2.5 h-2.5" /> Investigate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                  onClick={() => removeMutation.mutate({ directorId: d.id })}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bundle All Directors Modal */}
      <Dialog open={showBundleModal} onOpenChange={setShowBundleModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-500" />
              Bundle All Director Investigations
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Tier selector */}
            <div>
              <Label className="text-xs mb-2 block">Investigation Tier</Label>
              <div className="grid grid-cols-3 gap-2">
                {TIERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setBundleTier(t.value as any)}
                    className={`p-2 rounded-md border text-xs text-center transition-colors ${
                      bundleTier === t.value
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium">{t.label}</div>
                    <div className="text-[10px] mt-0.5">${t.basePrice}/person</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Price breakdown */}
            <div className="bg-muted/30 border border-border rounded-md p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground mb-2">Price Breakdown</p>
              {uninvestigated.map((d: any) => (
                <div key={d.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[180px]">{d.fullName} ({d.role})</span>
                  <span className="font-medium">${unitPrice.toFixed(2)}</span>
                </div>
              ))}
              <div className="border-t border-border/50 pt-2 mt-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal ({uninvestigated.length} × ${TIER_BASE[bundleTier]})</span>
                  <span>${(TIER_BASE[bundleTier] * uninvestigated.length).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-500">
                  <span>Bundle discount ({DISCOUNT}%)</span>
                  <span>-${((TIER_BASE[bundleTier] * uninvestigated.length) - totalPrice).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-foreground mt-1">
                  <span>Total</span>
                  <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />{totalPrice.toFixed(2)} USD</span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground bg-primary/5 border border-primary/20 rounded p-2">
              You will be redirected to Stripe Checkout. All {uninvestigated.length} director investigations will be queued immediately after payment.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowBundleModal(false)}>Cancel</Button>
            <Button
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
              disabled={bundleAllMutation.isPending}
              onClick={() => bundleAllMutation.mutate({
                investigationId,
                tier: bundleTier,
                origin: window.location.origin,
              })}
            >
              {bundleAllMutation.isPending ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Processing...</>
              ) : (
                <><Shield className="w-3 h-3" /> Pay ${totalPrice.toFixed(2)} & Investigate All</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Director Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Director / Key Personnel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Full Name *</Label>
              <Input className="h-8 text-xs mt-1" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. John Doe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Ownership %</Label>
                <Input className="h-8 text-xs mt-1" type="number" min={0} max={100} value={form.ownershipPercent} onChange={e => setForm(f => ({ ...f, ownershipPercent: e.target.value }))} placeholder="0–100" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nationality</Label>
                <Input className="h-8 text-xs mt-1" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} placeholder="e.g. Nigerian" />
              </div>
              <div>
                <Label className="text-xs">NIN / ID Number</Label>
                <Input className="h-8 text-xs mt-1" value={form.nin} onChange={e => setForm(f => ({ ...f, nin: e.target.value }))} placeholder="National ID" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input className="h-8 text-xs mt-1" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="director@company.com" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input className="h-8 text-xs mt-1" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234..." />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground bg-primary/5 border border-primary/20 rounded p-2">
              After adding, click <strong>Investigate</strong> on any director to create a bundled individual BIS investigation at a <strong>20% discount</strong>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={form.fullName.trim().length < 2 || addMutation.isPending}
              onClick={() => addMutation.mutate({
                investigationId,
                fullName: form.fullName.trim(),
                role: form.role as any,
                nationality: form.nationality || undefined,
                nin: form.nin || undefined,
                email: form.email || undefined,
                phone: form.phone || undefined,
                ownershipPercent: form.ownershipPercent ? parseInt(form.ownershipPercent) : undefined,
              })}
            >
              {addMutation.isPending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Adding...</> : "Add Director"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BISReport() {
  const { id } = useParams<{ id: string }>();
  const investigationId = id ? parseInt(id, 10) : 0;
  const searchString = useSearch();

  const [showFullSummary, setShowFullSummary] = useState(false);

  // Show bundle checkout success toast when redirected back from Stripe
  // URL pattern: /bis/report/:id?bundle_checkout=success&count=N&tier=T
  const [bundleToastShown, setBundleToastShown] = useState(false);
  useEffect(() => {
    if (bundleToastShown) return;
    const params = new URLSearchParams(searchString);
    if (params.get("bundle_checkout") === "success") {
      const count = parseInt(params.get("count") ?? "0", 10);
      const tier = params.get("tier") ?? "standard";
      setBundleToastShown(true);
      toast.success(
        `Director Bundle Payment Confirmed`,
        {
          description: `${count > 0 ? count : "All"} director investigation${count !== 1 ? "s" : ""} queued at ${tier.charAt(0).toUpperCase() + tier.slice(1)} tier with a 20% bundle discount. You will receive an in-app notification once each investigation is processed.`,
          duration: 8000,
        }
      );
      // Clean up the query params from the URL without reloading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [searchString, bundleToastShown]);

  // Fetch investigation details
  const { data: inv, isLoading, error } = trpc.bis.byId.useQuery(
    { id: investigationId },
    { enabled: investigationId > 0 }
  );

  // Fetch latest report export
  const { data: latestExport, refetch: refetchExport } = trpc.bisReport.latestExport.useQuery(
    { investigationId },
    { enabled: investigationId > 0 }
  );

  // Generate report mutation
  const generateMutation = trpc.bisReport.generate.useMutation({
    onSuccess: (data) => {
      toast.success("Report generated", {
        description: `${data.referenceId} — opening in new tab`,
      });
      refetchExport();
      if (data.fileUrl) {
        window.open(data.fileUrl, "_blank");
      }
    },
    onError: (err) => {
      toast.error("Report generation failed", { description: err.message });
    },
  });

  // Build radar chart data from module results
  const moduleResults = inv?.moduleResults as Record<string, unknown> | null;
  const radarData = moduleResults
    ? Object.entries(moduleResults)
        .slice(0, 6)
        .map(([key, value]) => ({
          subject: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).substring(0, 12),
          A: typeof value === "object" && value !== null && "score" in value
            ? Number((value as any).score ?? 50)
            : typeof value === "number"
            ? value
            : 50,
        }))
    : [
        { subject: "Identity", A: 0 },
        { subject: "Criminal", A: 0 },
        { subject: "Financial", A: 0 },
        { subject: "Social", A: 0 },
        { subject: "Network", A: 0 },
      ];

  // ─── Loading / error states ────────────────────────────────────────────────

  if (!investigationId || isNaN(investigationId)) {
    return (
      <div className="p-6">
        <div className="glass-card p-8 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">Invalid investigation ID</p>
          <Link href="/bis">
            <Button size="sm" variant="outline" className="mt-4 h-7 text-xs border-border bg-white/5">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to BIS Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading investigation...</span>
      </div>
    );
  }

  if (error || !inv) {
    return (
      <div className="p-6">
        <div className="glass-card p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-foreground font-medium">Investigation not found</p>
          <p className="text-xs text-muted-foreground mt-1">{error?.message}</p>
          <Link href="/bis">
            <Button size="sm" variant="outline" className="mt-4 h-7 text-xs border-border bg-white/5">
              <ArrowLeft className="w-3 h-3 mr-1" /> Back to BIS Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  const recommendations = (inv.recommendations as string[]) ?? [];

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title={`BIS Report — ${inv.referenceId}`}
        subtitle={`${inv.tier.toUpperCase()} background investigation`}
        breadcrumbs={[
          { label: "BIS", href: "/bis" },
          { label: inv.referenceId },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/bis">
              <Button size="sm" variant="outline" className="h-7 text-xs border-border bg-white/5">
                <ArrowLeft className="w-3 h-3 mr-1" /> Back
              </Button>
            </Link>
            {latestExport?.fileUrl && (
              <a href={latestExport.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="h-7 text-xs border-border bg-white/5">
                  <ExternalLink className="w-3 h-3 mr-1" /> View Report
                </Button>
              </a>
            )}
            <Button
              size="sm"
              className="h-7 text-xs bg-primary text-primary-foreground"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate({ investigationId })}
            >
              {generateMutation.isPending ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...</>
              ) : (
                <><Download className="w-3 h-3 mr-1" /> {latestExport ? "Regenerate" : "Generate"} Report</>
              )}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left panel: subject card */}
        <div className="glass-card p-5 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          <div className="flex flex-col items-center gap-3 mb-5">
            <RiskRing score={inv.riskScore ?? 0} size={100} />
            <div className="text-center">
              <p className="font-bold text-foreground text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {inv.subjectFullName}
              </p>
              {inv.subjectRole && (
                <p className="text-xs text-muted-foreground">{inv.subjectRole}</p>
              )}
              {inv.riskLevel && (
                <span className={`text-[10px] px-2 py-1 rounded border font-mono mt-2 inline-block uppercase ${riskBadgeClass(inv.riskLevel)}`}>
                  {inv.riskLevel} RISK
                </span>
              )}
            </div>
          </div>

          {/* Entity badge */}
          {(inv as any).subjectType === "entity" && (
            <div className="mb-3 flex justify-center">
              <span className="text-[10px] px-3 py-1 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-400 font-semibold uppercase tracking-widest">
                ★ Entity Investigation
              </span>
            </div>
          )}

          <div className="space-y-0 text-xs">
            {((inv as any).subjectType === "entity"
              ? [
                  ["Reference", inv.referenceId],
                  ["Status", inv.status.toUpperCase()],
                  ["Tier", inv.tier.toUpperCase()],
                  ["Entity Type", (inv as any).entityType ?? "—"],
                  ["Reg. Number", (inv as any).entityRegistrationNumber ?? "—"],
                  ["Year Founded", (inv as any).entityYearFounded ?? "—"],
                  ["Country", inv.subjectCountry ?? "—"],
                  ["Website", (inv as any).entityWebsite ?? "—"],
                  ["Risk Score", inv.riskScore != null ? `${inv.riskScore}/100` : "Pending"],
                  ["Consent", inv.consentObtained ? "Obtained ✓" : "Not obtained"],
                  ["Initiated", formatDate(inv.createdAt)],
                  ["Completed", formatDate(inv.completedAt)],
                ]
              : [
                  ["Reference", inv.referenceId],
                  ["Status", inv.status.toUpperCase()],
                  ["Tier", inv.tier.toUpperCase()],
                  ["Nationality", inv.subjectNationality ?? "—"],
                  ["Country", inv.subjectCountry ?? "—"],
                  ["NIN / ID", inv.subjectNin ?? "—"],
                  ["Risk Score", inv.riskScore != null ? `${inv.riskScore}/100` : "Pending"],
                  ["Consent", inv.consentObtained ? "Obtained ✓" : "Not obtained"],
                  ["Initiated", formatDate(inv.createdAt)],
                  ["Completed", formatDate(inv.completedAt)],
                ]
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-mono text-foreground text-right max-w-[120px] truncate">{v}</span>
              </div>
            ))}
          </div>

          {/* Latest export info */}
          {latestExport && (
            <div className="mt-4 p-2.5 rounded-md bg-primary/10 border border-primary/20">
              <p className="text-[10px] text-primary font-medium flex items-center gap-1">
                <FileText className="w-3 h-3" /> Report available
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Generated {formatDate(latestExport.createdAt)}
              </p>
              <a href={latestExport.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="h-6 text-[10px] mt-2 w-full border-primary/30 bg-primary/5">
                  <ExternalLink className="w-3 h-3 mr-1" /> Open Report
                </Button>
              </a>
            </div>
          )}
        </div>

        {/* Right panel: modules + radar + summary */}
        <div className="lg:col-span-2 space-y-4">
          {/* Module Results */}
          <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
            <h3 className="text-sm font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Module Analysis Results
            </h3>
            {moduleResults && Object.keys(moduleResults).length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(moduleResults).map(([key, value]) => {
                  const displayKey = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const score =
                    typeof value === "object" && value !== null && "score" in value
                      ? Number((value as any).score)
                      : typeof value === "number"
                      ? value
                      : null;
                  const status =
                    typeof value === "object" && value !== null && "status" in value
                      ? String((value as any).status)
                      : null;
                  const detail =
                    typeof value === "object" && value !== null && "detail" in value
                      ? String((value as any).detail)
                      : typeof value === "string"
                      ? value
                      : null;

                  return (
                    <div key={key} className="p-3 rounded-md bg-white/3 border border-border/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">{displayKey}</span>
                        {score != null && (
                          <span className="font-mono text-xs text-primary">{score}</span>
                        )}
                      </div>
                      {status && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-mono uppercase">
                          {status}
                        </span>
                      )}
                      {detail && (
                        <p className="text-[10px] text-muted-foreground mt-1">{detail}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-xs">
                <Clock className="w-4 h-4 mr-2" />
                {inv.status === "pending" || inv.status === "processing"
                  ? "Investigation in progress — module results will appear here."
                  : "No module results recorded."}
              </div>
            )}
          </div>

          {/* Directors Panel — entity investigations only */}
          {(inv as any).subjectType === "entity" && (
            <DirectorsPanel investigationId={investigationId} />
          )}

          {/* Risk Radar */}
          <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "150ms", animationFillMode: "forwards" }}>
            <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              Risk Profile Radar
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="oklch(1 0 0 / 10%)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 264)" }} />
                <Radar
                  name="Score"
                  dataKey="A"
                  stroke="oklch(0.78 0.22 152)"
                  fill="oklch(0.78 0.22 152)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* LLM Executive Summary */}
          {latestExport?.llmSummary && (
            <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  AI Executive Summary
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={() => setShowFullSummary(!showFullSummary)}
                >
                  {showFullSummary ? "Collapse" : "Expand"}
                </Button>
              </div>
              <div
                className={`text-xs text-muted-foreground leading-relaxed overflow-hidden transition-all ${
                  showFullSummary ? "max-h-none" : "max-h-24"
                }`}
                style={{ whiteSpace: "pre-line" }}
              >
                {latestExport.llmSummary}
              </div>
              {!showFullSummary && (
                <div className="h-6 bg-gradient-to-t from-background to-transparent -mt-6 relative" />
              )}
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="glass-card p-4 animate-fade-in-up opacity-0" style={{ animationDelay: "250ms", animationFillMode: "forwards" }}>
              <h3 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                Recommendations
              </h3>
              <ul className="space-y-2">
                {recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generate report CTA if not yet generated */}
          {!latestExport && inv.status === "completed" && (
            <div className="glass-card p-4 border border-primary/20 animate-fade-in-up opacity-0" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Generate PDF Report</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Create a formatted investigation report with AI-generated executive summary.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-primary text-primary-foreground flex-shrink-0"
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate({ investigationId })}
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...</>
                  ) : (
                    <><Download className="w-3 h-3 mr-1" /> Generate</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
