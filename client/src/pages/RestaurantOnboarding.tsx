/**
 * RestaurantOnboarding.tsx
 *
 * Guided restaurant/establishment onboarding journey:
 *   Step 1 — Welcome & country selection
 *   Step 2 — Business registration form
 *   Step 3 — KYB document checklist (5 KYB steps)
 *   Step 4 — Under review screen with progress tracker
 *   Step 5 — Go-live dashboard (approved)
 *
 * All mutations are wired to live tRPC procedures.
 */

import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Building2, Globe, CheckCircle2, Clock, Sparkles, ChevronRight,
  FileText, ShieldCheck, Zap, TrendingUp, Users, CreditCard,
  ArrowRight, ArrowLeft, RefreshCw, Star, MapPin, Phone, Mail,
  AlertCircle, CircleDot, Circle, Navigation,
} from "lucide-react";
import { MapView } from "@/components/Map";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type OnboardingStep = "welcome" | "register" | "kyb" | "review" | "live";

interface RegForm {
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

// ─── Constants ────────────────────────────────────────────────────────────────

const ESTABLISHMENT_TYPES = [
  { value: "restaurant", label: "🍽️ Restaurant / Café" },
  { value: "hotel", label: "🏨 Hotel / Lodge" },
  { value: "safari_lodge", label: "🦁 Safari Lodge" },
  { value: "tour_operator", label: "🗺️ Tour Operator" },
  { value: "beach_resort", label: "🏖️ Beach Resort" },
  { value: "spa_wellness", label: "💆 Spa & Wellness" },
  { value: "museum", label: "🏛️ Museum / Cultural Site" },
  { value: "theme_park", label: "🎡 Theme Park" },
  { value: "concert_venue", label: "🎭 Concert / Events Venue" },
  { value: "nightclub", label: "🎵 Nightclub / Bar" },
  { value: "sports_venue", label: "🏟️ Sports Venue / Stadium" },
  { value: "conference_center", label: "🏢 Conference Center" },
  { value: "travel_agency", label: "🏷️ Travel Agency" },
  { value: "airline", label: "✈️ Airline" },
  { value: "car_rental", label: "🚗 Car Rental" },
  { value: "retail", label: "🛍️ Retail Shop" },
  { value: "transport", label: "🚌 Transport / Shuttle" },
  { value: "other", label: "🏢 Other" },
];

const COUNTRIES = [
  { code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "NGN" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", currency: "KES" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR" },
  { code: "GH", name: "Ghana", flag: "🇬🇭", currency: "GHS" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", currency: "TZS" },
  { code: "RW", name: "Rwanda", flag: "🇷🇼", currency: "RWF" },
  { code: "ET", name: "Ethiopia", flag: "🇪🇹", currency: "ETB" },
  { code: "EG", name: "Egypt", flag: "🇪🇬", currency: "EGP" },
  { code: "MA", name: "Morocco", flag: "🇲🇦", currency: "MAD" },
  { code: "SN", name: "Senegal", flag: "🇸🇳", currency: "XOF" },
];

const KYB_STEPS = [
  {
    step: 1,
    title: "Business Identity",
    description: "Certificate of incorporation, business registration",
    docs: ["Certificate of Incorporation", "Business Registration Certificate"],
    icon: Building2,
  },
  {
    step: 2,
    title: "Ownership & Directors",
    description: "Director IDs, beneficial ownership declaration",
    docs: ["Director National ID / Passport", "Beneficial Ownership Form"],
    icon: Users,
  },
  {
    step: 3,
    title: "Financial Profile",
    description: "Bank statements, tax clearance certificate",
    docs: ["6-Month Bank Statement", "Tax Clearance Certificate"],
    icon: CreditCard,
  },
  {
    step: 4,
    title: "Compliance & AML",
    description: "AML policy, sanctions screening consent",
    docs: ["AML/CFT Policy Document", "Sanctions Screening Consent"],
    icon: ShieldCheck,
  },
  {
    step: 5,
    title: "Final Review",
    description: "Submit all documents for compliance review",
    docs: ["Signed Declaration Form"],
    icon: CheckCircle2,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

// Step labels for the 5-stage onboarding journey
const ONBOARDING_STEPS = [
  { label: "Location",    icon: Globe },
  { label: "Register",   icon: Building2 },
  { label: "KYB Docs",   icon: FileText },
  { label: "Review",     icon: Clock },
  { label: "Go Live",    icon: Sparkles },
];

/**
 * OnboardingProgressBar
 *
 * Displays a horizontal step-progress bar with labelled steps.
 * `current` is 1-indexed (1 = first step active).
 */
function OnboardingProgressBar({ current }: { current: number }) {
  const total = ONBOARDING_STEPS.length;
  const pct = Math.round(((current - 1) / (total - 1)) * 100);

  return (
    <div className="mb-7">
      {/* Step counter */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Step {current} of {total}</span>
        <span className="text-xs font-semibold text-emerald-600">{pct}% complete</span>
      </div>

      {/* Progress track */}
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden mb-3">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step labels */}
      <div className="flex items-start justify-between">
        {ONBOARDING_STEPS.map((s, i) => {
          const stepNum = i + 1;
          const isDone    = stepNum < current;
          const isActive  = stepNum === current;
          const Icon = s.icon;
          return (
            <div key={i} className="flex flex-col items-center gap-1" style={{ width: `${100 / total}%` }}>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isActive
                    ? "bg-emerald-500 text-white ring-2 ring-emerald-300 ring-offset-1"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>
              <span
                className={`text-[10px] text-center leading-tight ${
                  isActive ? "font-semibold text-emerald-600" : isDone ? "text-emerald-500" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KybStepCard({
  stepInfo,
  status,
  onAdvance,
  isPending,
}: {
  stepInfo: (typeof KYB_STEPS)[number];
  status: "pending" | "active" | "done";
  onAdvance: () => void;
  isPending: boolean;
}) {
  const Icon = stepInfo.icon;
  return (
    <Card
      className={`transition-all ${
        status === "active"
          ? "border-emerald-400 shadow-md ring-1 ring-emerald-300"
          : status === "done"
          ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/10"
          : "opacity-60"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              status === "done"
                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-500"
                : status === "active"
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {status === "done" ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-sm">{stepInfo.title}</p>
              {status === "done" && (
                <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50">
                  Complete
                </Badge>
              )}
              {status === "active" && (
                <Badge className="text-xs bg-emerald-500">Current</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{stepInfo.description}</p>
            {status === "active" && (
              <div className="mt-3 space-y-1.5">
                {stepInfo.docs.map((doc) => (
                  <div key={doc} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                    {doc}
                  </div>
                ))}
                <Button
                  size="sm"
                  className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-xs h-8"
                  onClick={onAdvance}
                  disabled={isPending}
                >
                  {isPending ? (
                    <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Submitting…</>
                  ) : stepInfo.step === 5 ? (
                    <><ShieldCheck className="w-3 h-3 mr-1" /> Submit for Review</>
                  ) : (
                    <><ArrowRight className="w-3 h-3 mr-1" /> Confirm & Continue</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RestaurantOnboarding() {
  const { user, isAuthenticated, loading } = useAuth();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [selectedCountry, setSelectedCountry] = useState<string>("");
  const [establishmentId, setEstablishmentId] = useState<number | null>(null);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [kybStep, setKybStep] = useState(1); // current KYB step (1-5)

  const [form, setForm] = useState<RegForm>({
    name: "",
    type: "",
    country: "",
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

  const utils = trpc.useUtils();
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [pickedLatLng, setPickedLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const updateLocationMut = trpc.kyb.updateLocation.useMutation({
    onSuccess: () => {
      toast.success("Location saved! Your establishment will appear on the tourist map.");
      setLocationPickerOpen(false);
      utils.kyb.listEstablishments.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    // Default to Nairobi if no location set
    const center = { lat: -1.286389, lng: 36.817223 };
    map.setCenter(center);
    map.setZoom(13);
    // Create draggable marker
    const marker = new google.maps.Marker({
      position: center,
      map,
      draggable: true,
      title: "Drag to set your location",
    });
    markerRef.current = marker;
    setPickedLatLng(center);
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (pos) setPickedLatLng({ lat: pos.lat(), lng: pos.lng() });
    });
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        marker.setPosition(e.latLng);
        setPickedLatLng({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });
  }, []);

  const handleSaveLocation = () => {
    const estId = myEst?.id ?? establishmentId;
    if (!estId || !pickedLatLng) return;
    updateLocationMut.mutate({
      establishmentId: estId,
      latitude: pickedLatLng.lat,
      longitude: pickedLatLng.lng,
    });
  };

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: myEstablishments = [], isLoading: loadingEst } = trpc.kyb.listEstablishments.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated }
  );

  // If user already has an establishment, determine which step to show
  const myEst = useMemo(() => {
    return (myEstablishments as any[]).find((e: any) => e.ownerId === user?.id);
  }, [myEstablishments, user?.id]);

  const { data: kybApps = [] } = trpc.kyb.getKybApplications.useQuery(
    { establishmentId: myEst?.id ?? 0 },
    { enabled: !!myEst?.id }
  );

  const latestApp = (kybApps as any[])[0] ?? null;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createEstMut = trpc.kyb.createEstablishment.useMutation({
    onSuccess: (data: any) => {
      setEstablishmentId(data?.id ?? null);
      utils.kyb.listEstablishments.invalidate();
      toast.success("Business registered successfully!");
      setStep("kyb");
    },
    onError: (e) => toast.error(e.message),
  });

  const startKybMut = trpc.kyb.startKybApplication.useMutation({
    onSuccess: (data: any) => {
      setApplicationId(data?.id ?? null);
      setKybStep(1);
    },
    onError: (e) => toast.error(e.message),
  });

  const advanceKybMut = trpc.kyb.advanceKybStep.useMutation({
    onSuccess: (_, vars) => {
      if (vars.step === 5) {
        utils.kyb.listEstablishments.invalidate();
        utils.kyb.getKybApplications.invalidate({ establishmentId: establishmentId ?? 0 });
        toast.success("Application submitted for review!");
        setStep("review");
      } else {
        setKybStep((s) => s + 1);
        toast.success(`Step ${vars.step} complete!`);
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Derived state ─────────────────────────────────────────────────────────
  const isFormValid = useMemo(
    () => form.name.trim() && form.type && form.country && form.contactEmail.trim(),
    [form]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCountrySelect = (code: string) => {
    const country = COUNTRIES.find((c) => c.code === code);
    setSelectedCountry(code);
    setForm((f) => ({ ...f, country: code, currency: country?.currency ?? "USD" }));
  };

  const handleRegister = () => {
    if (!isFormValid) return;
    createEstMut.mutate({
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
  };

  const handleStartKyb = () => {
    const estId = establishmentId ?? myEst?.id;
    if (!estId) return;
    if (latestApp?.id) {
      setApplicationId(latestApp.id);
      setKybStep(latestApp.currentStep ?? 1);
    } else {
      startKybMut.mutate({ establishmentId: estId });
    }
  };

  const handleAdvanceKyb = (kybStepNum: number) => {
    const appId = applicationId ?? latestApp?.id;
    if (!appId) return;
    advanceKybMut.mutate({ applicationId: appId, step: kybStepNum });
  };

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <Building2 className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Business Onboarding</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to register your establishment and start accepting TourismPay payments from tourists across Africa.
        </p>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <a href={getLoginUrl()}>Sign in to get started</a>
        </Button>
      </div>
    );
  }

  // ── Redirect to correct step if user already has an establishment ─────────
  const effectiveEst = myEst ?? (establishmentId ? { id: establishmentId, kybStatus: "draft" } : null);
  const effectiveStep = step === "welcome" && effectiveEst
    ? effectiveEst.kybStatus === "approved"
      ? "live"
      : effectiveEst.kybStatus === "under_review"
      ? "review"
      : effectiveEst.kybStatus === "submitted"
      ? "kyb"
      : step
    : step;

  // ── Welcome screen ────────────────────────────────────────────────────────
  if (effectiveStep === "welcome") {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <OnboardingProgressBar current={1} />
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Join TourismPay</h1>
          <p className="text-muted-foreground text-sm">
            Accept digital payments from tourists in 10+ African currencies. Get paid instantly, no forex hassle.
          </p>
        </div>

        {/* Benefits */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {[
            { icon: Zap, title: "Instant Payments", desc: "Receive funds in seconds" },
            { icon: Globe, title: "10+ Currencies", desc: "USDC, CBDC-NG, XLM & more" },
            { icon: ShieldCheck, title: "KYB Protected", desc: "Verified & compliant" },
            { icon: TrendingUp, title: "Analytics", desc: "Track revenue in real time" },
          ].map((b) => (
            <Card key={b.title} className="p-3">
              <b.icon className="w-5 h-5 text-emerald-500 mb-1" />
              <p className="text-xs font-semibold">{b.title}</p>
              <p className="text-xs text-muted-foreground">{b.desc}</p>
            </Card>
          ))}
        </div>

        {/* Country selection */}
        <div className="mb-6">
          <Label className="text-sm font-medium mb-2 block">Where is your business located?</Label>
          <div className="grid grid-cols-2 gap-2">
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                onClick={() => handleCountrySelect(c.code)}
                className={`flex items-center gap-2 p-3 rounded-xl border text-sm text-left transition-all ${
                  selectedCountry === c.code
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 font-medium"
                    : "border-border hover:border-emerald-300 hover:bg-muted/40"
                }`}
              >
                <span className="text-lg">{c.flag}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full bg-emerald-600 hover:bg-emerald-700"
          disabled={!selectedCountry}
          onClick={() => setStep("register")}
        >
          Continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  // ── Register screen ───────────────────────────────────────────────────────
  if (effectiveStep === "register") {
    const country = COUNTRIES.find((c) => c.code === form.country);
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <button
          onClick={() => setStep("welcome")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <OnboardingProgressBar current={2} />

        <h2 className="text-xl font-bold mb-1">Register Your Business</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {country?.flag} {country?.name} · This information will be verified during KYB
        </p>

        <div className="space-y-4">
          {/* Business name */}
          <div>
            <Label className="text-xs">Business Name *</Label>
            <Input
              placeholder="e.g. Savanna Grill Lagos"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Type */}
          <div>
            <Label className="text-xs">Business Type *</Label>
            <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select type…" />
              </SelectTrigger>
              <SelectContent>
                {ESTABLISHMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City & Address */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">City</Label>
              <Input
                placeholder="Lagos"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Employees</Label>
              <Input
                type="number"
                placeholder="10"
                value={form.employeeCount}
                onChange={(e) => setForm((f) => ({ ...f, employeeCount: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Address</Label>
            <Input
              placeholder="123 Victoria Island"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Contact Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="info@restaurant.com"
                  className="pl-8"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <Input
                  placeholder="+234 800 000 0000"
                  className="pl-8"
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Registration & Tax */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Reg. Number</Label>
              <Input
                placeholder="RC123456"
                value={form.registrationNumber}
                onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Tax ID</Label>
              <Input
                placeholder="TIN-000000"
                value={form.taxId}
                onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
              />
            </div>
          </div>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 mt-2"
            disabled={!isFormValid || createEstMut.isPending}
            onClick={handleRegister}
          >
            {createEstMut.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Registering…</>
            ) : (
              <>Register Business <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── KYB screen ────────────────────────────────────────────────────────────
  if (effectiveStep === "kyb") {
    const estId = establishmentId ?? myEst?.id;
    const appId = applicationId ?? latestApp?.id;
    const currentKybStep = appId ? (latestApp?.currentStep ?? kybStep) : kybStep;

    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <OnboardingProgressBar current={3} />

        <h2 className="text-xl font-bold mb-1">KYB Verification</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Complete all 5 steps to get your business verified and start accepting payments.
        </p>

        {!appId && (
          <Card className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Start KYB Process</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  Click below to initiate your KYB application with our compliance team.
                </p>
                <Button
                  size="sm"
                  className="mt-2 bg-amber-500 hover:bg-amber-600 text-white text-xs h-7"
                  onClick={handleStartKyb}
                  disabled={startKybMut.isPending}
                >
                  {startKybMut.isPending ? (
                    <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Starting…</>
                  ) : (
                    "Start KYB Application"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {KYB_STEPS.map((s) => {
            const status =
              s.step < currentKybStep ? "done" : s.step === currentKybStep ? "active" : "pending";
            return (
              <KybStepCard
                key={s.step}
                stepInfo={s}
                status={status}
                onAdvance={() => handleAdvanceKyb(s.step)}
                isPending={advanceKybMut.isPending && advanceKybMut.variables?.step === s.step}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Under review screen ───────────────────────────────────────────────────
  if (effectiveStep === "review") {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <OnboardingProgressBar current={4} />

        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-blue-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Under Review</h2>
          <p className="text-sm text-muted-foreground">
            Your KYB application has been submitted. Our compliance team typically reviews applications within 2–5 business days.
          </p>
        </div>

        {/* Progress timeline */}
        <Card className="mb-6">
          <CardContent className="p-5 space-y-4">
            {[
              { label: "Application Submitted", done: true, icon: CheckCircle2 },
              { label: "Document Verification", done: false, icon: FileText, active: true },
              { label: "AML / Sanctions Screening", done: false, icon: ShieldCheck },
              { label: "Final Compliance Approval", done: false, icon: Star },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    item.done
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-500"
                      : item.active
                      ? "bg-blue-100 dark:bg-blue-900/40 text-blue-500"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : item.active ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>
                <p
                  className={`text-sm ${
                    item.done ? "text-emerald-600 font-medium" : item.active ? "font-medium" : "text-muted-foreground"
                  }`}
                >
                  {item.label}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
          <CardContent className="p-4 text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">What happens next?</p>
            <p className="text-xs">
              You'll receive an email notification once your application is approved. You can also check this page for status updates. If additional documents are needed, our compliance team will contact you directly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Go-live dashboard ─────────────────────────────────────────────────────
  if (effectiveStep === "live") {
    const est = myEst ?? { name: "Your Business", country: form.country, type: form.type };
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <OnboardingProgressBar current={5} />

        {/* Congrats banner */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-6 mb-6 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-80" />
          <h2 className="text-2xl font-bold mb-1">You're Live! 🎉</h2>
          <p className="text-sm opacity-90">{est.name} is now verified and accepting TourismPay payments</p>
          <Badge className="mt-3 bg-white/20 text-white border-white/30">
            <ShieldCheck className="w-3 h-3 mr-1" /> KYB Approved
          </Badge>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Currencies", value: "10+", icon: Globe },
            { label: "Settlement", value: "Instant", icon: Zap },
            { label: "Tourists", value: "Ready", icon: Users },
          ].map((s) => (
            <Card key={s.label} className="text-center p-3">
              <s.icon className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="font-bold text-sm">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Location picker */}
        <Card className="mb-4 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <Navigation className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Set Your Location</p>
                  <p className="text-xs text-muted-foreground">
                    {myEst?.latitude ? `📍 ${parseFloat(myEst.latitude).toFixed(4)}, ${parseFloat(myEst.longitude ?? "0").toFixed(4)}` : "Not set — tourists won't see you on the map"}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                onClick={() => setLocationPickerOpen(true)}
              >
                <MapPin className="w-3 h-3 mr-1" />
                {myEst?.latitude ? "Update" : "Set Location"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Location picker dialog */}
        <Dialog open={locationPickerOpen} onOpenChange={setLocationPickerOpen}>
          <DialogContent className="max-w-lg p-0 overflow-hidden">
            <DialogHeader className="px-4 pt-4 pb-2">
              <DialogTitle className="text-sm">Pin Your Establishment Location</DialogTitle>
              <p className="text-xs text-muted-foreground">Click on the map or drag the marker to your exact location</p>
            </DialogHeader>
            <div className="h-72 w-full">
              <MapView onMapReady={handleMapReady} />
            </div>
            <DialogFooter className="px-4 py-3 border-t flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {pickedLatLng ? `${pickedLatLng.lat.toFixed(5)}, ${pickedLatLng.lng.toFixed(5)}` : "No location selected"}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setLocationPickerOpen(false)}>Cancel</Button>
                <Button
                  size="sm"
                  className="text-xs bg-emerald-600 hover:bg-emerald-700"
                  disabled={!pickedLatLng || updateLocationMut.isPending}
                  onClick={handleSaveLocation}
                >
                  {updateLocationMut.isPending ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Saving…</> : <><MapPin className="w-3 h-3 mr-1" /> Save Location</>}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Next steps */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Get Started</CardTitle>
            <CardDescription className="text-xs">Complete these steps to start receiving payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { title: "Set up your payment QR code", desc: "Display at your checkout counter", done: false },
              { title: "Configure settlement currency", desc: "Choose how you receive funds", done: false },
              { title: "Invite your staff", desc: "Add team members to your account", done: false },
              { title: "View your dashboard", desc: "Track revenue and transactions", done: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer group">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <CircleDot className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 text-xs" asChild>
            <a href="/kyb">
              <Building2 className="w-4 h-4 mr-1" /> KYB Portal
            </a>
          </Button>
          <Button className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700" asChild>
            <a href="/wallet">
              <TrendingUp className="w-4 h-4 mr-1" /> View Wallet
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
