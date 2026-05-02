import { useState } from "react";
import { useLocation } from "wouter";
import { Shield, ChevronRight, CheckCircle, Clock, AlertCircle, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const COUNTRIES = ["NG", "KE", "GH", "ZA", "EG", "TZ", "UG", "RW", "ET", "SN"];
const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria", KE: "Kenya", GH: "Ghana", ZA: "South Africa",
  EG: "Egypt", TZ: "Tanzania", UG: "Uganda", RW: "Rwanda", ET: "Ethiopia", SN: "Senegal",
};

const TIERS = [
  { id: "basic", label: "Basic", desc: "Identity + Criminal check", price: "$49" },
  { id: "standard", label: "Standard", desc: "Basic + Financial footprint", price: "$99" },
  { id: "comprehensive", label: "Comprehensive", desc: "All modules + Social NLP", price: "$199" },
] as const;

const ENTITY_TIERS = [
  { id: "basic", label: "Basic", desc: "Registry check + Ownership verification", price: "$79" },
  { id: "standard", label: "Standard", desc: "Basic + Financial footprint + Sanctions", price: "$149" },
  { id: "comprehensive", label: "Comprehensive", desc: "All modules + Adverse media + AML", price: "$299" },
] as const;

const INDIVIDUAL_MODULES = [
  { id: "identity", label: "Identity Triangulation", desc: "Cross-reference NIN, BVN, passport, voter ID" },
  { id: "osint", label: "OSINT & Criminal Proxy", desc: "Court records, adverse media, police clearance proxy" },
  { id: "financial", label: "Financial Footprint", desc: "Mobile money, utility payments, credit proxies" },
  { id: "social", label: "Social Media NLP", desc: "AI-powered social media sentiment & risk analysis" },
];

const ENTITY_MODULES = [
  { id: "registry", label: "Business Registry Check", desc: "Verify registration, directors, ownership structure" },
  { id: "sanctions", label: "Sanctions & PEP Screening", desc: "OFAC, UN, EU, FATF watchlists" },
  { id: "financial", label: "Financial Footprint", desc: "Credit history, insolvency, tax compliance" },
  { id: "adverse_media", label: "Adverse Media & OSINT", desc: "Negative press, court records, regulatory actions" },
];

const ESTABLISHMENT_TYPES = [
  { value: "restaurant", label: "Restaurant / Café" },
  { value: "hotel", label: "Hotel / Lodge" },
  { value: "safari_lodge", label: "Safari Lodge" },
  { value: "tour_operator", label: "Tour Operator" },
  { value: "beach_resort", label: "Beach Resort" },
  { value: "spa_wellness", label: "Spa & Wellness" },
  { value: "museum", label: "Museum / Cultural Site" },
  { value: "theme_park", label: "Theme Park" },
  { value: "concert_venue", label: "Concert / Events Venue" },
  { value: "nightclub", label: "Nightclub / Bar" },
  { value: "sports_venue", label: "Sports Venue / Stadium" },
  { value: "conference_center", label: "Conference Center" },
  { value: "travel_agency", label: "Travel Agency" },
  { value: "airline", label: "Airline" },
  { value: "car_rental", label: "Car Rental" },
  { value: "other", label: "Other" },
];

const STEPS = ["Subject Details", "Investigation Tier", "Consent & Submit"];

export default function BISInvestigation() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [subjectType, setSubjectType] = useState<"individual" | "entity">("individual");

  // Individual form state
  const [indForm, setIndForm] = useState({
    subjectFullName: "",
    subjectDob: "",
    subjectNationality: "",
    subjectNin: "",
    subjectPhone: "",
    subjectEmail: "",
    subjectRole: "",
    subjectCountry: "NG" as string,
    tier: "standard" as "basic" | "standard" | "comprehensive",
    establishmentId: undefined as number | undefined,
    consentObtained: false,
  });

  // Entity form state
  const [entForm, setEntForm] = useState({
    subjectFullName: "", // company name
    entityRegistrationNumber: "",
    entityType: "hotel",
    entityWebsite: "",
    entityYearFounded: "",
    subjectCountry: "NG" as string,
    subjectEmail: "",
    subjectPhone: "",
    tier: "standard" as "basic" | "standard" | "comprehensive",
    establishmentId: undefined as number | undefined,
    consentObtained: false,
  });

  const { data: establishments } = trpc.africa.establishments.useQuery({ limit: 100 });

  const createMutation = trpc.bis.create.useMutation({
    onSuccess: (inv) => {
      toast.success("Investigation submitted", {
        description: `Reference: ${inv?.referenceId} — processing will begin shortly.`,
      });
      navigate(`/bis/${inv?.id}`);
    },
    onError: (err) => {
      toast.error("Submission failed", { description: err.message });
    },
  });

  const setInd = (key: string, value: any) => setIndForm(f => ({ ...f, [key]: value }));
  const setEnt = (key: string, value: any) => setEntForm(f => ({ ...f, [key]: value }));

  const canProceed = () => {
    if (subjectType === "individual") {
      if (step === 0) return indForm.subjectFullName.trim().length >= 2;
      if (step === 1) return !!indForm.tier;
      if (step === 2) return indForm.consentObtained;
    } else {
      if (step === 0) return entForm.subjectFullName.trim().length >= 2;
      if (step === 1) return !!entForm.tier;
      if (step === 2) return entForm.consentObtained;
    }
    return true;
  };

  const handleSubmit = () => {
    if (subjectType === "individual") {
      createMutation.mutate({
        subjectType: "individual",
        subjectFullName: indForm.subjectFullName,
        subjectDob: indForm.subjectDob || undefined,
        subjectNationality: indForm.subjectNationality || undefined,
        subjectNin: indForm.subjectNin || undefined,
        subjectPhone: indForm.subjectPhone || undefined,
        subjectEmail: indForm.subjectEmail || undefined,
        subjectRole: indForm.subjectRole || undefined,
        subjectCountry: indForm.subjectCountry || undefined,
        tier: indForm.tier,
        establishmentId: indForm.establishmentId,
        consentObtained: indForm.consentObtained,
      });
    } else {
      createMutation.mutate({
        subjectType: "entity",
        subjectFullName: entForm.subjectFullName,
        subjectCountry: entForm.subjectCountry || undefined,
        subjectEmail: entForm.subjectEmail || undefined,
        subjectPhone: entForm.subjectPhone || undefined,
        entityRegistrationNumber: entForm.entityRegistrationNumber || undefined,
        entityType: entForm.entityType || undefined,
        entityWebsite: entForm.entityWebsite || undefined,
        entityYearFounded: entForm.entityYearFounded ? parseInt(entForm.entityYearFounded) : undefined,
        tier: entForm.tier,
        establishmentId: entForm.establishmentId,
        consentObtained: entForm.consentObtained,
      });
    }
  };

  const activeTiers = subjectType === "individual" ? TIERS : ENTITY_TIERS;
  const activeModules = subjectType === "individual" ? INDIVIDUAL_MODULES : ENTITY_MODULES;
  const activeTier = subjectType === "individual" ? indForm.tier : entForm.tier;
  const activeConsent = subjectType === "individual" ? indForm.consentObtained : entForm.consentObtained;

  return (
    <div className="p-6 min-h-full">
      <PageHeader
        title="New BIS Investigation"
        subtitle="Submit a background investigation for an individual or an establishment entity"
        breadcrumbs={[{ label: "BIS", href: "/bis" }, { label: "New Investigation" }]}
      />

      <div className="max-w-2xl">
        <div className="glass-card p-6 animate-fade-in-up opacity-0" style={{ animationFillMode: "forwards" }}>
          {/* Subject type selector */}
          <Tabs value={subjectType} onValueChange={(v) => { setSubjectType(v as any); setStep(0); }} className="mb-6">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="individual" className="gap-2 text-xs">
                <User className="w-3.5 h-3.5" /> Individual / Staff Check
              </TabsTrigger>
              <TabsTrigger value="entity" className="gap-2 text-xs">
                <Building2 className="w-3.5 h-3.5" /> Entity / Establishment Check
              </TabsTrigger>
            </TabsList>
            <TabsContent value="individual">
              <p className="text-xs text-muted-foreground mt-2">
                Run a background check on an employee, contractor, or tour guide. Covers identity, criminal history, financial footprint, and social media risk.
              </p>
            </TabsContent>
            <TabsContent value="entity">
              <p className="text-xs text-muted-foreground mt-2">
                Investigate a business entity — hotel, safari lodge, airline, tour operator, etc. Covers business registry, ownership, sanctions, and adverse media.
              </p>
            </TabsContent>
          </Tabs>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  i < step ? "bg-primary text-primary-foreground" :
                  i === step ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                  "bg-white/10 text-muted-foreground"
                }`}>
                  {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* ── INDIVIDUAL: Step 0 ── */}
          {step === 0 && subjectType === "individual" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Full Name *</Label>
                  <Input
                    value={indForm.subjectFullName}
                    onChange={e => setInd("subjectFullName", e.target.value)}
                    placeholder="e.g. Emeka Okafor"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Country</Label>
                  <select
                    value={indForm.subjectCountry}
                    onChange={e => setInd("subjectCountry", e.target.value)}
                    className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c} value={c}>{COUNTRY_NAMES[c]} ({c})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Date of Birth</Label>
                  <Input
                    type="date"
                    value={indForm.subjectDob}
                    onChange={e => setInd("subjectDob", e.target.value)}
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">National ID / NIN / BVN</Label>
                  <Input
                    value={indForm.subjectNin}
                    onChange={e => setInd("subjectNin", e.target.value)}
                    placeholder="22XXXXXXXXX"
                    className="h-9 text-xs bg-white/5 border-border font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Phone Number</Label>
                  <Input
                    value={indForm.subjectPhone}
                    onChange={e => setInd("subjectPhone", e.target.value)}
                    placeholder="+234 XXX XXX XXXX"
                    className="h-9 text-xs bg-white/5 border-border font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Email</Label>
                  <Input
                    type="email"
                    value={indForm.subjectEmail}
                    onChange={e => setInd("subjectEmail", e.target.value)}
                    placeholder="subject@example.com"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Role / Position</Label>
                  <Input
                    value={indForm.subjectRole}
                    onChange={e => setInd("subjectRole", e.target.value)}
                    placeholder="Head Chef"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Nationality</Label>
                  <Input
                    value={indForm.subjectNationality}
                    onChange={e => setInd("subjectNationality", e.target.value)}
                    placeholder="Nigerian"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Linked Establishment (optional)</Label>
                  <select
                    value={indForm.establishmentId ?? ""}
                    onChange={e => setInd("establishmentId", e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  >
                    <option value="">— None —</option>
                    {(establishments as any[])?.map((est: any) => (
                      <option key={est.id} value={est.id}>{est.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── ENTITY: Step 0 ── */}
          {step === 0 && subjectType === "entity" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Company / Entity Name *</Label>
                  <Input
                    value={entForm.subjectFullName}
                    onChange={e => setEnt("subjectFullName", e.target.value)}
                    placeholder="e.g. Serengeti Safari Lodge Ltd"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Establishment Type</Label>
                  <select
                    value={entForm.entityType}
                    onChange={e => setEnt("entityType", e.target.value)}
                    className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  >
                    {ESTABLISHMENT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Country of Registration</Label>
                  <select
                    value={entForm.subjectCountry}
                    onChange={e => setEnt("subjectCountry", e.target.value)}
                    className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c} value={c}>{COUNTRY_NAMES[c]} ({c})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Registration Number</Label>
                  <Input
                    value={entForm.entityRegistrationNumber}
                    onChange={e => setEnt("entityRegistrationNumber", e.target.value)}
                    placeholder="RC-XXXXXXX"
                    className="h-9 text-xs bg-white/5 border-border font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Year Founded</Label>
                  <Input
                    type="number"
                    value={entForm.entityYearFounded}
                    onChange={e => setEnt("entityYearFounded", e.target.value)}
                    placeholder="2015"
                    min={1800}
                    max={new Date().getFullYear()}
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Website</Label>
                  <Input
                    value={entForm.entityWebsite}
                    onChange={e => setEnt("entityWebsite", e.target.value)}
                    placeholder="https://example.com"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Contact Email</Label>
                  <Input
                    type="email"
                    value={entForm.subjectEmail}
                    onChange={e => setEnt("subjectEmail", e.target.value)}
                    placeholder="info@entity.com"
                    className="h-9 text-xs bg-white/5 border-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Contact Phone</Label>
                  <Input
                    value={entForm.subjectPhone}
                    onChange={e => setEnt("subjectPhone", e.target.value)}
                    placeholder="+234 XXX XXX XXXX"
                    className="h-9 text-xs bg-white/5 border-border font-mono"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">Link to Registered Establishment (optional)</Label>
                  <select
                    value={entForm.establishmentId ?? ""}
                    onChange={e => setEnt("establishmentId", e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full h-9 text-xs bg-white/5 border border-border rounded-md px-3 text-foreground"
                  >
                    <option value="">— None —</option>
                    {(establishments as any[])?.map((est: any) => (
                      <option key={est.id} value={est.id}>{est.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Tier selection */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-4">
                Select the investigation depth. Higher tiers include more modules and provide a more comprehensive risk profile.
              </p>
              {activeTiers.map(t => (
                <div
                  key={t.id}
                  onClick={() => subjectType === "individual" ? setInd("tier", t.id) : setEnt("tier", t.id)}
                  className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                    activeTier === t.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-white/3 hover:bg-white/5"
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    activeTier === t.id ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {activeTier === t.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                  <span className="text-sm font-mono font-bold text-primary">{t.price}</span>
                </div>
              ))}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-3">Modules included in {activeTiers.find(t => t.id === activeTier)?.label}:</p>
                <div className="space-y-2">
                  {activeModules.slice(0, activeTier === "basic" ? 2 : activeTier === "standard" ? 3 : 4).map(m => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-xs text-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Consent & Submit */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-400 mb-1">
                      {subjectType === "individual" ? "Consent Required" : "Authorization Required"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subjectType === "individual"
                        ? "By proceeding, you confirm that the subject has provided written consent for this background investigation in accordance with applicable data protection laws (NDPR, GDPR, POPIA)."
                        : "By proceeding, you confirm that you are authorized to request this entity investigation and that all information provided is accurate. Entity investigations are conducted using publicly available records and licensed data sources."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Investigation Summary</p>
                {subjectType === "individual" ? [
                  ["Type", "Individual / Staff Check"],
                  ["Subject", indForm.subjectFullName],
                  ["Country", `${COUNTRY_NAMES[indForm.subjectCountry] ?? indForm.subjectCountry} (${indForm.subjectCountry})`],
                  ["Role", indForm.subjectRole || "—"],
                  ["Tier", TIERS.find(t => t.id === indForm.tier)?.label ?? indForm.tier],
                  ["Price", TIERS.find(t => t.id === indForm.tier)?.price ?? "—"],
                ] : [
                  ["Type", "Entity / Establishment Check"],
                  ["Company", entForm.subjectFullName],
                  ["Entity Type", ESTABLISHMENT_TYPES.find(t => t.value === entForm.entityType)?.label ?? entForm.entityType],
                  ["Country", `${COUNTRY_NAMES[entForm.subjectCountry] ?? entForm.subjectCountry} (${entForm.subjectCountry})`],
                  ["Reg. Number", entForm.entityRegistrationNumber || "—"],
                  ["Tier", ENTITY_TIERS.find(t => t.id === entForm.tier)?.label ?? entForm.tier],
                  ["Price", ENTITY_TIERS.find(t => t.id === entForm.tier)?.price ?? "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-3 py-2 rounded-md bg-white/3 text-xs">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-foreground font-medium">{v}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-3 p-3 rounded-md bg-white/3">
                <Checkbox
                  id="consent"
                  checked={activeConsent}
                  onCheckedChange={v => subjectType === "individual" ? setInd("consentObtained", !!v) : setEnt("consentObtained", !!v)}
                  className="mt-0.5"
                />
                <Label htmlFor="consent" className="text-xs text-foreground cursor-pointer leading-relaxed">
                  {subjectType === "individual"
                    ? "I confirm that the subject has provided written consent for this background investigation and that all information provided is accurate to the best of my knowledge."
                    : "I confirm that I am authorized to request this entity investigation and that all information provided is accurate. I understand this investigation uses licensed data sources and public records."}
                </Label>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs border-border bg-white/5"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0 || createMutation.isPending}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                size="sm"
                className="h-8 text-xs bg-primary text-primary-foreground"
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 text-xs bg-primary text-primary-foreground"
                onClick={handleSubmit}
                disabled={!canProceed() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <><Clock className="w-3.5 h-3.5 mr-1 animate-spin" /> Submitting...</>
                ) : (
                  <><Shield className="w-3.5 h-3.5 mr-1" /> Submit Investigation</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
