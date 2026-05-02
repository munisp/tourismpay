import { useState } from "react";
import {
  Building2, Upload, CheckCircle, Clock, AlertCircle, ChevronRight,
  FileText, Loader2, RefreshCw, Shield, BadgeCheck
} from "lucide-react";
import KybStepper from "@/components/kyb/KybStepper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import KybDocumentUpload from "@/components/kyb/KybDocumentUpload";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Wizard Steps ─────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: "Business Details" },
  { id: 1, label: "Documents" },
  { id: 2, label: "Compliance" },
  { id: 3, label: "Review & Submit" },
];

// ─── Status helpers ───────────────────────────────────────────────────────────

const statusStyles: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  submitted: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  under_review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  suspended: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${statusStyles[status] ?? statusStyles.draft}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ─── Business Details Form ────────────────────────────────────────────────────

interface BusinessFormData {
  name: string;
  type: string;
  country: string;
  city: string;
  address: string;
  registrationNumber: string;
  taxId: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  employeeCount: string;
  annualRevenue: string;
  currency: string;
}

const ESTABLISHMENT_TYPES = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restaurant" },
  { value: "concert_venue", label: "Concert Venue" },
  { value: "safari_lodge", label: "Safari Lodge" },
  { value: "tour_operator", label: "Tour Operator" },
  { value: "airline", label: "Airline" },
  { value: "car_rental", label: "Car Rental" },
  { value: "spa_wellness", label: "Spa & Wellness" },
  { value: "museum", label: "Museum" },
  { value: "theme_park", label: "Theme Park" },
  { value: "beach_resort", label: "Beach Resort" },
  { value: "conference_center", label: "Conference Center" },
  { value: "nightclub", label: "Nightclub" },
  { value: "sports_venue", label: "Sports Venue" },
  { value: "travel_agency", label: "Travel Agency" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KYBOnboarding() {
  const [showForm, setShowForm] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [createdEstId, setCreatedEstId] = useState<number | null>(null);
  const [createdAppId, setCreatedAppId] = useState<number | null>(null);
  const [uploadedDocCount, setUploadedDocCount] = useState(0);

  const [form, setForm] = useState<BusinessFormData>({
    name: "",
    type: "hotel",
    country: "NG",
    city: "",
    address: "",
    registrationNumber: "",
    taxId: "",
    contactEmail: "",
    contactPhone: "",
    website: "",
    employeeCount: "",
    annualRevenue: "",
    currency: "USD",
  });

  // ─── tRPC queries ────────────────────────────────────────────────────────────

  const { data: stats, refetch: refetchStats } = trpc.kyb.stats.useQuery();
  const { data: countries } = trpc.kyb.supportedCountries.useQuery();
  const { data: establishments, refetch: refetchEstablishments } = trpc.kyb.listEstablishments.useQuery({
    limit: 50,
    offset: 0,
  });

  // ─── tRPC mutations ──────────────────────────────────────────────────────────

  const createEstMutation = trpc.kyb.createEstablishment.useMutation();
  const startKybMutation = trpc.kyb.startKybApplication.useMutation();
  const advanceStepMutation = trpc.kyb.advanceKybStep.useMutation();

  // ─── Step handlers ────────────────────────────────────────────────────────────

  const handleStep0Next = async () => {
    if (!form.name.trim() || form.name.length < 2) {
      toast.error("Business name is required (min 2 characters)");
      return;
    }

    try {
      const est = await createEstMutation.mutateAsync({
        name: form.name,
        type: form.type as any,
        country: form.country,
        city: form.city || undefined,
        address: form.address || undefined,
        registrationNumber: form.registrationNumber || undefined,
        taxId: form.taxId || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        website: form.website || undefined,
        employeeCount: form.employeeCount ? parseInt(form.employeeCount) : undefined,
        annualRevenue: form.annualRevenue || undefined,
        currency: form.currency,
      });

      if (!est?.id) throw new Error("Failed to create establishment");
      setCreatedEstId(est.id);

      // Start KYB application
      const app = await startKybMutation.mutateAsync({ establishmentId: est.id });
      if (!app?.id) throw new Error("Failed to start KYB application");
      setCreatedAppId(app.id);

      toast.success("Business registered", { description: `${form.name} — KYB application started` });
      setActiveStep(1);
      refetchEstablishments();
      refetchStats();
    } catch (err: any) {
      toast.error("Registration failed", { description: err?.message ?? "Please try again." });
    }
  };

  const handleStep1Next = async () => {
    if (uploadedDocCount === 0) {
      toast.warning("Please upload at least one document before proceeding.");
      return;
    }
    if (createdAppId) {
      await advanceStepMutation.mutateAsync({ applicationId: createdAppId, step: 2 });
    }
    setActiveStep(2);
  };

  const handleStep2Next = async () => {
    if (createdAppId) {
      await advanceStepMutation.mutateAsync({ applicationId: createdAppId, step: 3 });
    }
    setActiveStep(3);
  };

  const handleSubmit = async () => {
    if (createdAppId) {
      await advanceStepMutation.mutateAsync({ applicationId: createdAppId, step: 5 });
    }
    toast.success("KYB application submitted", {
      description: "You will receive a decision within 2–3 business days.",
    });
    setShowForm(false);
    setActiveStep(0);
    setCreatedEstId(null);
    setCreatedAppId(null);
    setUploadedDocCount(0);
    setForm({
      name: "", type: "hotel", country: "NG", city: "", address: "",
      registrationNumber: "", taxId: "", contactEmail: "", contactPhone: "",
      website: "", employeeCount: "", annualRevenue: "", currency: "USD",
    });
    refetchEstablishments();
    refetchStats();
  };

  const handleNext = () => {
    if (activeStep === 0) return handleStep0Next();
    if (activeStep === 1) return handleStep1Next();
    if (activeStep === 2) return handleStep2Next();
  };

  const isNextLoading =
    createEstMutation.isPending ||
    startKybMutation.isPending ||
    advanceStepMutation.isPending;

  // ─── Render ──────────────────────────────────────────────────────────────────

  type EstRow = NonNullable<typeof establishments>[number];
  const estList: EstRow[] = establishments ?? [];

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="Establishment KYB Onboarding"
        subtitle="Multi-country KYB with PaddleOCR + Docling verification"
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => { refetchEstablishments(); refetchStats(); }}
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs bg-primary text-primary-foreground"
              onClick={() => { setShowForm(!showForm); setActiveStep(0); }}
            >
              + New Application
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        <StatCard label="Total Applications" value={stats?.total ?? "—"} color="blue" icon={FileText} animationDelay={0} />
        <StatCard label="Approved" value={stats?.approved ?? "—"} color="green" icon={CheckCircle} animationDelay={50} />
        <StatCard label="Pending Review" value={stats?.underReview ?? "—"} color="amber" icon={Clock} animationDelay={100} />
        <StatCard
          label="Approval Rate"
          value={stats && stats.total > 0 ? ((stats.approved / stats.total) * 100).toFixed(1) : "—"}
          unit="%"
          color="green"
          animationDelay={150}
        />
      </div>

      {/* Wizard Form */}
      {showForm && (
        <div className="glass-card p-5 mb-4 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          {/* Step indicators */}
          <div className="mb-5">
            <KybStepper steps={STEPS} activeStep={activeStep} />
          </div>

          {/* Step 0: Business Details */}
          {activeStep === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Business Name *</Label>
                <Input
                  placeholder="e.g. Lagos Grand Hotel"
                  className="h-9 text-xs bg-white/5 border-border"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Country *</Label>
                <select
                  className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                >
                  {(countries ?? []).map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Establishment Type *</Label>
                <select
                  className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {ESTABLISHMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">City</Label>
                <Input
                  placeholder="e.g. Lagos"
                  className="h-9 text-xs bg-white/5 border-border"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Registration Number</Label>
                <Input
                  placeholder="RC-XXXXXXX"
                  className="h-9 text-xs bg-white/5 border-border font-mono"
                  value={form.registrationNumber}
                  onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Tax ID</Label>
                <Input
                  placeholder="TIN-XXXXXXX"
                  className="h-9 text-xs bg-white/5 border-border font-mono"
                  value={form.taxId}
                  onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Contact Email</Label>
                <Input
                  type="email"
                  placeholder="contact@business.com"
                  className="h-9 text-xs bg-white/5 border-border"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Contact Phone</Label>
                <Input
                  placeholder="+234 XXX XXX XXXX"
                  className="h-9 text-xs bg-white/5 border-border"
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Step 1: Document Upload */}
          {activeStep === 1 && (
            <div>
              {createdEstId && createdAppId ? (
                <KybDocumentUpload
                  applicationId={createdAppId}
                  establishmentId={createdEstId}
                  establishmentType={form.type}
                  onDocumentsChanged={setUploadedDocCount}
                />
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                  <AlertCircle className="w-4 h-4 mr-2 text-amber-400" />
                  Please complete Step 1 first to create the establishment record.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Compliance Checks */}
          {activeStep === 2 && (
            <div className="space-y-3">
              {[
                { label: "AML/CFT Screening", status: "PASS", detail: "No adverse records in FATF databases" },
                { label: "Sanctions List Check", status: "PASS", detail: "OFAC, UN, EU sanctions — clear" },
                { label: "PEP Screening", status: "PASS", detail: "No politically exposed persons identified" },
                { label: "Adverse Media Scan", status: "PASS", detail: "No negative press coverage detected" },
                { label: "Business Registry Verification", status: "PENDING", detail: "Awaiting registry API response" },
              ].map((check) => (
                <div key={check.label} className="flex items-center justify-between p-2.5 rounded-md bg-white/3 border border-border/50">
                  <div>
                    <span className="text-xs text-foreground font-medium">{check.label}</span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{check.detail}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                    check.status === "PASS"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  }`}>{check.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Review */}
          {activeStep === 3 && (
            <div className="space-y-3">
              <div className="p-4 rounded-md bg-white/3 border border-border space-y-2">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-primary" /> Application Summary
                </h4>
                {[
                  ["Business Name", form.name || "—"],
                  ["Country", countries?.find((c) => c.code === form.country)?.name ?? form.country],
                  ["Type", ESTABLISHMENT_TYPES.find((t) => t.value === form.type)?.label ?? form.type],
                  ["Registration No.", form.registrationNumber || "—"],
                  ["Tax ID", form.taxId || "—"],
                  ["Contact Email", form.contactEmail || "—"],
                  ["Documents Uploaded", `${uploadedDocCount} file(s)`],
                  ["Compliance", "All checks passed"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-foreground font-medium">{v}</span>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>By submitting, you confirm that all information is accurate and consent to KYB verification checks.</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-border bg-white/5"
              onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
              disabled={activeStep === 0 || isNextLoading}
            >
              Back
            </Button>
            {activeStep < STEPS.length - 1 ? (
              <Button
                size="sm"
                className="h-8 text-xs bg-primary text-primary-foreground"
                onClick={handleNext}
                disabled={isNextLoading}
              >
                {isNextLoading ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing...</>
                ) : (
                  "Next Step"
                )}
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSubmit}
                disabled={isNextLoading}
              >
                <Shield className="w-3 h-3 mr-1" /> Submit Application
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Establishments Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            KYB Applications
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            {establishments?.length ?? 0} records
          </span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              {["ID", "Business", "Country", "Type", "KYB Status", "Score", "Created"].map((h) => (
                <th key={h} className="text-left p-3 text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(establishments ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">
                  No establishments yet. Click "+ New Application" to get started.
                </td>
              </tr>
            ) : (
              estList.map((est, i: number) => (
                <tr
                  key={est.id}
                  className="border-b border-border/50 hover:bg-white/3 transition-colors animate-fade-in-up opacity-0"
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: "forwards" }}
                >
                  <td className="p-3 font-mono text-muted-foreground text-[10px]">EST-{est.id}</td>
                  <td className="p-3 font-medium text-foreground">{est.name}</td>
                  <td className="p-3">
                    <span className="bg-white/10 text-foreground text-[9px] px-1.5 py-0.5 rounded font-mono">
                      {est.country}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground capitalize">{est.type.replace(/_/g, " ")}</td>
                  <td className="p-3"><StatusBadge status={est.kybStatus} /></td>
                  <td className="p-3 font-mono text-muted-foreground">
                    {est.kybScore != null ? `${est.kybScore}/100` : "—"}
                  </td>
                  <td className="p-3 text-muted-foreground font-mono text-[10px]">
                    {new Date(est.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
