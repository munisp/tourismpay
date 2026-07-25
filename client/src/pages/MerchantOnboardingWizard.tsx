import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Hotel, UtensilsCrossed, Home, Music, Car, Wine,
  CheckCircle, Upload, ArrowRight, ArrowLeft, Loader2,
  Building2, FileText, Wallet, Settings, Rocket
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

type MerchantType = "hotel" | "restaurant" | "airbnb" | "concert" | "transport" | "nightclub";

const MERCHANT_TYPE_META: Record<MerchantType, { icon: any; label: string; color: string; description: string }> = {
  hotel: { icon: Hotel, label: "Hotel", color: "text-blue-400", description: "Register your hotel property and start accepting bookings" },
  restaurant: { icon: UtensilsCrossed, label: "Restaurant", color: "text-orange-400", description: "Set up your restaurant and accept digital payments" },
  airbnb: { icon: Home, label: "Short-Stay / Airbnb", color: "text-pink-400", description: "List your property for short-term rentals" },
  concert: { icon: Music, label: "Concert / Events", color: "text-purple-400", description: "Create events and sell tickets online" },
  transport: { icon: Car, label: "Transport Provider", color: "text-emerald-400", description: "Register your fleet and accept ride bookings" },
  nightclub: { icon: Wine, label: "Night Club", color: "text-red-400", description: "Manage entry, tables, and bottle service" },
};

const STEP_ICONS = [Building2, FileText, CheckCircle, Wallet, Settings, Rocket];
const STEP_LABELS = ["Business Info", "KYB Documents", "Review", "Wallet Setup", "Configure", "Go Live"];

export default function MerchantOnboardingWizard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedType = searchParams.get("type") as MerchantType | null;

  const [selectedType, setSelectedType] = useState<MerchantType | null>(preselectedType);
  const [step, setStep] = useState(preselectedType ? 1 : 0);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  // Step 1 form state
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPhone: "",
    rcNumber: "",
    tinNumber: "",
    businessAddress: "",
    lga: "",
    state: "Lagos",
  });

  // Step 2 document state
  const [documents, setDocuments] = useState<Array<{ documentType: string; fileUrl: string; fileName: string }>>([]);

  // Queries
  const configQuery = trpc.journeyOrchestrator.getAllMerchantTypeConfigs.useQuery();
  const statusQuery = trpc.journeyOrchestrator.getMerchantOnboardingStatus.useQuery(
    { applicationId: applicationId! },
    { enabled: !!applicationId }
  );

  // Mutations
  const startMut = trpc.journeyOrchestrator.startMerchantOnboarding.useMutation({
    onSuccess: (data) => {
      setApplicationId(data.applicationId);
      setStep(2);
      toast.success(`Application created! Upload your KYB documents.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const submitDocsMut = trpc.journeyOrchestrator.submitKybDocuments.useMutation({
    onSuccess: () => {
      setStep(3);
      toast.success("Documents submitted! Our team will review within 24-48 hours.");
    },
    onError: (e) => toast.error(e.message),
  });

  const configs = configQuery.data ?? [];
  const selectedConfig = configs.find((c: any) => c.merchantType === selectedType);

  const handleStartOnboarding = () => {
    if (!selectedType) return;
    startMut.mutate({
      merchantType: selectedType,
      businessName: form.businessName,
      ownerName: form.ownerName,
      ownerEmail: form.ownerEmail,
      ownerPhone: form.ownerPhone,
      rcNumber: form.rcNumber || undefined,
      tinNumber: form.tinNumber || undefined,
      businessAddress: form.businessAddress,
      lga: form.lga || undefined,
      state: form.state,
    });
  };

  const handleSubmitDocuments = () => {
    if (!applicationId) return;
    if (documents.length === 0) {
      toast.error("Please add at least one document");
      return;
    }
    submitDocsMut.mutate({ applicationId, documents });
  };

  const addDocument = (documentType: string) => {
    // In production this would open a file picker / S3 upload
    const mockUrl = `https://storage.tourismpay.io/kyb/${applicationId}/${documentType}_${Date.now()}.pdf`;
    setDocuments(prev => {
      const existing = prev.findIndex(d => d.documentType === documentType);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { documentType, fileUrl: mockUrl, fileName: `${documentType}.pdf` };
        return updated;
      }
      return [...prev, { documentType, fileUrl: mockUrl, fileName: `${documentType}.pdf` }];
    });
    toast.success(`${documentType.replace(/_/g, " ")} uploaded`);
  };

  // Step 0: Select merchant type
  if (step === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Merchant Onboarding</h1>
          <p className="text-zinc-400 mt-2">Select your business type to begin the onboarding process</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.entries(MERCHANT_TYPE_META) as [MerchantType, any][]).map(([type, meta]) => {
            const Icon = meta.icon;
            return (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setStep(1); }}
                className={`p-6 rounded-xl border text-left transition-all hover:scale-105 ${
                  selectedType === type
                    ? "border-emerald-500 bg-emerald-900/20"
                    : "border-zinc-700/50 bg-zinc-800/50 hover:border-zinc-500"
                }`}
              >
                <Icon className={`h-8 w-8 ${meta.color} mb-3`} />
                <h3 className="text-lg font-semibold text-white">{meta.label}</h3>
                <p className="text-sm text-zinc-400 mt-1">{meta.description}</p>
                {configs.find((c: any) => c.merchantType === type) && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <span>Fee: {configs.find((c: any) => c.merchantType === type)?.platformFeePercent}%</span>
                    <span>·</span>
                    <span>Settlement: {configs.find((c: any) => c.merchantType === type)?.settlementCycle}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Progress bar
  const StepProgress = () => (
    <div className="flex items-center justify-between mb-8">
      {STEP_LABELS.map((label, i) => {
        const Icon = STEP_ICONS[i];
        const isCompleted = step > i + 1;
        const isCurrent = step === i + 1;
        return (
          <div key={label} className="flex items-center">
            <div className={`flex flex-col items-center ${i < STEP_LABELS.length - 1 ? "flex-1" : ""}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                isCompleted ? "bg-emerald-600 border-emerald-600" :
                isCurrent ? "border-emerald-500 bg-emerald-900/30" :
                "border-zinc-700 bg-zinc-800/50"
              }`}>
                {isCompleted ? <CheckCircle className="h-5 w-5 text-white" /> : <Icon className={`h-5 w-5 ${isCurrent ? "text-emerald-400" : "text-zinc-500"}`} />}
              </div>
              <span className={`text-xs mt-1 hidden md:block ${isCurrent ? "text-emerald-400" : isCompleted ? "text-zinc-300" : "text-zinc-600"}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 ${isCompleted ? "bg-emerald-600" : "bg-zinc-700"}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  const meta = selectedType ? MERCHANT_TYPE_META[selectedType] : null;
  const Icon = meta?.icon ?? Building2;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        {meta && <Icon className={`h-7 w-7 ${meta.color}`} />}
        <div>
          <h1 className="text-2xl font-bold text-white">{meta?.label} Merchant Onboarding</h1>
          <p className="text-sm text-zinc-400">{meta?.description}</p>
        </div>
      </div>

      <StepProgress />

      {/* Step 1: Business Info */}
      {step === 1 && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Business Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: "businessName", label: "Business Name *", placeholder: "e.g. Eko Hotel & Suites" },
              { key: "ownerName", label: "Owner/Director Name *", placeholder: "Full legal name" },
              { key: "ownerEmail", label: "Business Email *", placeholder: "info@yourbusiness.com", type: "email" },
              { key: "ownerPhone", label: "Phone Number *", placeholder: "+234 801 234 5678" },
              { key: "rcNumber", label: "CAC RC Number", placeholder: "RC 1234567" },
              { key: "tinNumber", label: "Tax ID (TIN)", placeholder: "12345678-0001" },
              { key: "businessAddress", label: "Business Address *", placeholder: "123 Broad Street, Lagos Island" },
              { key: "lga", label: "LGA", placeholder: "Lagos Island" },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-sm text-zinc-400 mb-1">{label}</label>
                <input
                  type={type ?? "text"}
                  value={(form as any)[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-sm text-zinc-400 mb-1">State</label>
              <select
                value={form.state}
                onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white"
              >
                {["Lagos", "Abuja", "Rivers", "Kano", "Ogun", "Oyo", "Delta", "Anambra"].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {selectedConfig && (
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-700/30">
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Platform Terms for {meta?.label}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><span className="text-zinc-500">Platform Fee</span><p className="text-white font-medium">{selectedConfig.platformFeePercent}%</p></div>
                <div><span className="text-zinc-500">Settlement</span><p className="text-white font-medium">{selectedConfig.settlementCycle}</p></div>
                <div><span className="text-zinc-500">VAT</span><p className="text-white font-medium">{selectedConfig.vatApplicable ? "7.5% (FIRS)" : "N/A"}</p></div>
                <div><span className="text-zinc-500">Service Charge</span><p className="text-white font-medium">{selectedConfig.serviceChargePercent}%</p></div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={handleStartOnboarding}
              disabled={startMut.isPending || !form.businessName || !form.ownerName || !form.ownerEmail || !form.ownerPhone || !form.businessAddress}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {startMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {startMut.isPending ? "Submitting..." : "Continue to Documents"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: KYB Documents */}
      {step === 2 && selectedConfig && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">KYB Document Upload</h2>
          <p className="text-sm text-zinc-400">Upload the following documents to verify your business. All documents must be clear and valid.</p>
          <div className="space-y-3">
            {selectedConfig.kybDocuments.map((docType: string) => {
              const uploaded = documents.find(d => d.documentType === docType);
              return (
                <div key={docType} className={`flex items-center justify-between p-3 rounded-lg border ${uploaded ? "border-emerald-700/50 bg-emerald-900/10" : "border-zinc-700/50 bg-zinc-900/50"}`}>
                  <div className="flex items-center gap-3">
                    {uploaded ? <CheckCircle className="h-5 w-5 text-emerald-400" /> : <FileText className="h-5 w-5 text-zinc-500" />}
                    <div>
                      <p className="text-sm font-medium text-white">{docType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                      {uploaded && <p className="text-xs text-emerald-400">{uploaded.fileName}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => addDocument(docType)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                      uploaded ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                    }`}
                  >
                    <Upload className="h-3 w-3" />
                    {uploaded ? "Replace" : "Upload"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span>{documents.length} of {selectedConfig.kybDocuments.length} documents uploaded</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={handleSubmitDocuments}
              disabled={submitDocsMut.isPending || documents.length === 0}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {submitDocsMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {submitDocsMut.isPending ? "Submitting..." : "Submit for Review"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Under Review */}
      {step === 3 && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Application Under Review</h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            Your KYB documents have been submitted. Our compliance team will review your application within <strong className="text-white">24–48 hours</strong>.
          </p>
          {applicationId && (
            <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-700/30 inline-block">
              <p className="text-xs text-zinc-500">Application ID</p>
              <p className="text-sm font-mono text-white">{applicationId}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-left">
            {[
              { step: "1", label: "Document Verification", desc: "Our team verifies CAC, TIN, and all submitted documents", status: "in_progress" },
              { step: "2", label: "Compliance Check", desc: "AML/KYB scoring and regulatory compliance review", status: "pending" },
              { step: "3", label: "Account Activation", desc: "Wallet provisioning and platform access granted", status: "pending" },
            ].map(({ step: s, label, desc, status }) => (
              <div key={s} className={`p-4 rounded-lg border ${status === "in_progress" ? "border-yellow-700/50 bg-yellow-900/10" : "border-zinc-700/50 bg-zinc-900/50"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${status === "in_progress" ? "bg-yellow-600 text-white" : "bg-zinc-700 text-zinc-400"}`}>{s}</span>
                  <span className="text-sm font-medium text-white">{label}</span>
                </div>
                <p className="text-xs text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-center mt-4">
            <button onClick={() => navigate("/admin/kyb-applications")} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm">
              View Application Status
            </button>
            <button onClick={() => navigate("/merchant/revenue")} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">
              Go to Merchant Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
