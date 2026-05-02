/**
 * Merchant Employee BIS (Background Investigation Service)
 * Allows merchants to submit background checks on their staff and track results.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ShieldCheck,
  UserSearch,
  Plus,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Building2,
  RefreshCw,
} from "lucide-react";

const TIER_INFO = {
  basic: {
    label: "Basic",
    price: "$15",
    description: "Identity verification + criminal record check",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  standard: {
    label: "Standard",
    price: "$35",
    description: "Basic + employment history + reference check",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  },
  comprehensive: {
    label: "Comprehensive",
    price: "$75",
    description: "Standard + financial history + social media + global watchlist",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  pending: { label: "Pending", icon: <Clock className="h-3 w-3" />, color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  processing: { label: "Processing", icon: <Loader2 className="h-3 w-3 animate-spin" />, color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  completed: { label: "Completed", icon: <CheckCircle className="h-3 w-3" />, color: "bg-green-500/10 text-green-400 border-green-500/20" },
  flagged: { label: "Flagged", icon: <AlertTriangle className="h-3 w-3" />, color: "bg-red-500/10 text-red-400 border-red-500/20" },
  failed: { label: "Failed", icon: <XCircle className="h-3 w-3" />, color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
};

const RISK_COLORS: Record<string, string> = {
  low: "text-green-400",
  medium: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-red-400",
};

interface NewCheckForm {
  establishmentId: string;
  subjectFullName: string;
  subjectRole: string;
  subjectEmail: string;
  subjectPhone: string;
  subjectNationality: string;
  subjectDob: string;
  subjectNin: string;
  subjectCountry: string;
  tier: "basic" | "standard" | "comprehensive";
  consentObtained: boolean;
}

const EMPTY_FORM: NewCheckForm = {
  establishmentId: "",
  subjectFullName: "",
  subjectRole: "",
  subjectEmail: "",
  subjectPhone: "",
  subjectNationality: "",
  subjectDob: "",
  subjectNin: "",
  subjectCountry: "",
  tier: "basic",
  consentObtained: false,
};

export default function MerchantEmployeeBIS() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewCheckForm>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "processing" | "completed" | "flagged" | "failed">("all");

  const utils = trpc.useUtils();

  // Get merchant's establishments
  const { data: establishmentsData } = trpc.kyb.listEstablishments.useQuery({ limit: 50 });

  // List employee checks
  const { data: checksData, isLoading: checksLoading } = trpc.bis.listMyEmployeeChecks.useQuery(
    { status: statusFilter, limit: 50, offset: 0 },
    { refetchInterval: 30_000 }
  );

  const submitMutation = trpc.bis.submitEmployeeCheck.useMutation({
    onSuccess: () => {
      toast.success("Background check submitted successfully");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      utils.bis.listMyEmployeeChecks.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to submit background check");
    },
  });

  const handleSubmit = () => {
    if (!form.establishmentId) return toast.error("Please select an establishment");
    if (!form.subjectFullName.trim()) return toast.error("Subject full name is required");
    if (!form.subjectRole.trim()) return toast.error("Subject role/position is required");
    if (!form.consentObtained) return toast.error("You must confirm that consent has been obtained from the subject");

    submitMutation.mutate({
      establishmentId: Number(form.establishmentId),
      subjectFullName: form.subjectFullName.trim(),
      subjectRole: form.subjectRole.trim(),
      subjectEmail: form.subjectEmail.trim() || undefined,
      subjectPhone: form.subjectPhone.trim() || undefined,
      subjectNationality: form.subjectNationality.trim() || undefined,
      subjectDob: form.subjectDob || undefined,
      subjectNin: form.subjectNin.trim() || undefined,
      subjectCountry: form.subjectCountry.trim() || undefined,
      tier: form.tier,
      consentObtained: form.consentObtained,
    });
  };

  const checks = checksData?.items ?? [];
  const totalChecks = checksData?.total ?? 0;

  const stats = {
    total: totalChecks,
    pending: checks.filter((c) => c.status === "pending").length,
    completed: checks.filter((c) => c.status === "completed").length,
    flagged: checks.filter((c) => c.status === "flagged").length,
  };

  if (!user) return null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Employee Background Checks</h1>
            <p className="text-sm text-muted-foreground">Submit and track BIS checks for your staff</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Check
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Checks", value: stats.total, icon: <UserSearch className="h-4 w-4 text-indigo-400" />, color: "text-indigo-400" },
          { label: "Pending", value: stats.pending, icon: <Clock className="h-4 w-4 text-yellow-400" />, color: "text-yellow-400" },
          { label: "Completed", value: stats.completed, icon: <CheckCircle className="h-4 w-4 text-green-400" />, color: "text-green-400" },
          { label: "Flagged", value: stats.flagged, icon: <AlertTriangle className="h-4 w-4 text-red-400" />, color: "text-red-400" },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                {stat.icon}
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier Pricing Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Object.entries(TIER_INFO).map(([key, tier]) => (
          <Card key={key} className="border-border/50 bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className={tier.color}>{tier.label}</Badge>
                <span className="text-lg font-bold text-foreground">{tier.price}</span>
              </div>
              <p className="text-xs text-muted-foreground">{tier.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Checks Table */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Check History</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => utils.bis.listMyEmployeeChecks.invalidate()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {checksLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : checks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <UserSearch className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No background checks yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Submit your first employee background check to get started
              </p>
              <Button className="mt-4 gap-2" size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Check
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs">Subject</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Tier</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Risk</TableHead>
                  <TableHead className="text-xs">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((check) => {
                  const statusCfg = STATUS_CONFIG[check.status] ?? STATUS_CONFIG.pending;
                  const tierCfg = TIER_INFO[check.tier as keyof typeof TIER_INFO];
                  return (
                    <TableRow key={check.id} className="border-border/30 hover:bg-muted/20">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {check.referenceId}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{check.subjectFullName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{check.subjectRole}</TableCell>
                      <TableCell>
                        {tierCfg && (
                          <Badge variant="outline" className={`text-xs ${tierCfg.color}`}>
                            {tierCfg.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs gap-1 ${statusCfg.color}`}>
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {check.riskLevel ? (
                          <span className={`text-xs font-medium capitalize ${RISK_COLORS[check.riskLevel] ?? "text-muted-foreground"}`}>
                            {check.riskLevel}
                            {check.riskScore != null && ` (${check.riskScore})`}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {check.createdAt ? new Date(check.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Check Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
              Submit Employee Background Check
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Establishment */}
            <div className="space-y-1.5">
              <Label className="text-xs">Establishment *</Label>
              <Select value={form.establishmentId} onValueChange={(v) => setForm({ ...form, establishmentId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your establishment" />
                </SelectTrigger>
                <SelectContent>
                  {(establishmentsData?.items ?? []).map((est: any) => (
                    <SelectItem key={est.id} value={String(est.id)}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {est.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subject Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Full Name *</Label>
                <Input
                  placeholder="e.g. Amara Osei"
                  value={form.subjectFullName}
                  onChange={(e) => setForm({ ...form, subjectFullName: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Role / Position *</Label>
                <Input
                  placeholder="e.g. Head Chef, Cashier, Security"
                  value={form.subjectRole}
                  onChange={(e) => setForm({ ...form, subjectRole: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="employee@email.com"
                  value={form.subjectEmail}
                  onChange={(e) => setForm({ ...form, subjectEmail: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  placeholder="+234 800 000 0000"
                  value={form.subjectPhone}
                  onChange={(e) => setForm({ ...form, subjectPhone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nationality</Label>
                <Input
                  placeholder="e.g. Nigerian"
                  value={form.subjectNationality}
                  onChange={(e) => setForm({ ...form, subjectNationality: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Country Code</Label>
                <Input
                  placeholder="NG"
                  maxLength={2}
                  value={form.subjectCountry}
                  onChange={(e) => setForm({ ...form, subjectCountry: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date of Birth</Label>
                <Input
                  type="date"
                  value={form.subjectDob}
                  onChange={(e) => setForm({ ...form, subjectDob: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">NIN / ID Number</Label>
                <Input
                  placeholder="National ID number"
                  value={form.subjectNin}
                  onChange={(e) => setForm({ ...form, subjectNin: e.target.value })}
                />
              </div>
            </div>

            {/* Tier Selection */}
            <div className="space-y-2">
              <Label className="text-xs">Check Tier *</Label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(TIER_INFO).map(([key, tier]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm({ ...form, tier: key as any })}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      form.tier === key
                        ? "border-primary bg-primary/10"
                        : "border-border/50 bg-card/30 hover:border-border"
                    }`}
                  >
                    <div className="text-xs font-semibold">{tier.label}</div>
                    <div className="text-sm font-bold mt-0.5">{tier.price}</div>
                    <div className="text-xs text-muted-foreground mt-1 leading-tight">{tier.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Consent */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <Checkbox
                id="consent"
                checked={form.consentObtained}
                onCheckedChange={(checked) => setForm({ ...form, consentObtained: !!checked })}
                className="mt-0.5"
              />
              <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                <span className="font-medium text-amber-400">Consent Required:</span> I confirm that the subject has been informed about and consented to this background check in accordance with applicable data protection laws.
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="gap-2"
            >
              {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Check
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
