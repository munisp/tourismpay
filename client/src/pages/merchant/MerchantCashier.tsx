/**
 * MerchantCashier — Staff cashier payment flow
 *
 * Allows accepted staff members (cashier/manager/supervisor) and establishment
 * owners to generate a QR payment token on behalf of their establishment.
 * The generated QR can be shown to a tourist who then scans and pays.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  QrCode, Loader2, CheckCircle2, Copy, RefreshCw,
  Building2, DollarSign, FileText, Users2, Zap,
} from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/layout/AppShell";

const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "EGP", "TZS"];

interface GeneratedQR {
  token: string;
  qrData: string;
  expiresAt: Date;
  amountUsd?: string;
  currency: string;
  description?: string;
  establishmentName: string;
}

export default function MerchantCashier() {
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");
  const [generatedQR, setGeneratedQR] = useState<GeneratedQR | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(900); // 15 min in seconds

  // Fetch owned establishments
  const { data: ownedEsts, isLoading: loadingOwned } = trpc.merchantRevenue.myEstablishments.useQuery();

  // Fetch staff establishments
  const { data: staffEsts, isLoading: loadingStaff } = trpc.staffInvites.myStaffEstablishments.useQuery();

  // Combine both lists
  const allEstablishments = useMemo(() => {
    const owned = (ownedEsts ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      country: e.country,
      role: "owner" as string,
    }));
    const staff = (staffEsts ?? []).map((e: any) => ({
      id: e.establishmentId,
      name: e.establishmentName,
      country: e.establishmentCountry,
      role: e.role as string,
    }));
    // Deduplicate by id (owner takes precedence)
    const map = new Map<number, typeof owned[0]>();
    owned.forEach((e) => map.set(e.id, e));
    staff.forEach((e) => { if (!map.has(e.id)) map.set(e.id, e); });
    return Array.from(map.values());
  }, [ownedEsts, staffEsts]);

  const selectedEst = allEstablishments.find((e) => e.id === selectedEstId);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const startCountdown = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeLeft(900);
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const generateMut = trpc.qrPayment.generate.useMutation({
    onSuccess: (data) => {
      const est = allEstablishments.find((e) => e.id === selectedEstId);
      setGeneratedQR({
        token: data.token,
        qrData: data.qrData,
        expiresAt: new Date(data.expiresAt),
        amountUsd: amount || undefined,
        currency,
        description: description || undefined,
        establishmentName: est?.name ?? "Your Establishment",
      });
      startCountdown();
      toast.success("QR code generated — valid for 15 minutes");
    },
    onError: (e) => toast.error(e.message),
  });

  // Regenerate: keep same params, generate a fresh token
  const handleRegenerate = () => {
    if (!selectedEstId) return;
    generateMut.mutate({
      establishmentId: selectedEstId,
      amountUsd: amount || undefined,
      currency: currency || undefined,
      description: description || undefined,
    });
  };

  const handleGenerate = () => {
    if (!selectedEstId) { toast.error("Please select an establishment"); return; }
    generateMut.mutate({
      establishmentId: selectedEstId,
      amountUsd: amount || undefined,
      currency: currency || undefined,
      description: description || undefined,
    });
  };

  const handleReset = () => {
    setGeneratedQR(null);
    setAmount("");
    setDescription("");
    setTimeLeft(900);
  };

  const handleCopyToken = () => {
    if (!generatedQR) return;
    const payUrl = `${window.location.origin}/pay/${generatedQR.token}`;
    navigator.clipboard.writeText(payUrl).then(() => toast.success("Payment link copied!"));
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const isLoading = loadingOwned || loadingStaff;

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold">Cashier Terminal</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Generate a QR code for a tourist to scan and pay at your establishment.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : allEstablishments.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Building2 className="w-10 h-10 text-muted-foreground mx-auto" />
            <p className="font-medium text-sm">No establishments found</p>
            <p className="text-xs text-muted-foreground">
              You need to be an owner or accepted staff member of an establishment to process payments.
            </p>
          </div>
        ) : !generatedQR ? (
          /* ── QR Generation Form ── */
          <div className="space-y-4">
            {/* Establishment selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Establishment
              </Label>
              <Select
                value={selectedEstId?.toString() ?? ""}
                onValueChange={(v) => setSelectedEstId(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select establishment…" />
                </SelectTrigger>
                <SelectContent>
                  {allEstablishments.map((e) => (
                    <SelectItem key={e.id} value={e.id.toString()}>
                      <span className="flex items-center gap-2">
                        {e.name}
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {e.role}
                        </Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEst && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users2 className="w-3 h-3" />
                  Your role: <span className="capitalize font-medium">{selectedEst.role}</span>
                  {" · "}{selectedEst.country}
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Amount
                <span className="text-muted-foreground font-normal">(optional — leave blank for open amount)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1"
                />
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Description
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. Table 5 order, Room service…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={256}
              />
            </div>

            <Button
              className="w-full h-11 gap-2 font-semibold"
              onClick={handleGenerate}
              disabled={generateMut.isPending || !selectedEstId}
            >
              {generateMut.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              ) : (
                <><QrCode className="w-4 h-4" /> Generate QR Code</>
              )}
            </Button>
          </div>
        ) : (
          /* ── Generated QR Display ── */
          <div className="space-y-4">
            {/* Timer */}
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
              timeLeft < 120
                ? "bg-destructive/10 border-destructive/30"
                : "bg-emerald-500/10 border-emerald-500/20"
            }`}>
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${timeLeft < 120 ? "text-destructive" : "text-emerald-500"}`} />
                <span className="text-sm font-medium">
                  {timeLeft > 0 ? "QR code expires in" : "QR code expired"}
                </span>
              </div>
              <span className={`text-lg font-mono font-bold tabular-nums ${
                timeLeft < 120 ? "text-destructive" : "text-emerald-500"
              }`}>
                {formatTime(timeLeft)}
              </span>
            </div>

            {/* Establishment + amount summary */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Establishment</p>
                <p className="text-sm font-semibold">{generatedQR.establishmentName}</p>
              </div>
              {generatedQR.amountUsd && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="text-base font-bold text-primary">
                    {parseFloat(generatedQR.amountUsd).toFixed(2)} {generatedQR.currency}
                  </p>
                </div>
              )}
              {!generatedQR.amountUsd && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <Badge variant="outline" className="text-xs">Open amount</Badge>
                </div>
              )}
              {generatedQR.description && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Note</p>
                  <p className="text-sm">{generatedQR.description}</p>
                </div>
              )}
            </div>

            {/* QR code display — using the qrData string as a visual placeholder */}
            <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3 border border-border">
              <div className="w-48 h-48 bg-muted rounded-xl flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border">
                <QrCode className="w-16 h-16 text-foreground" />
                <p className="text-[10px] font-mono text-muted-foreground text-center px-2 break-all">
                  {generatedQR.token.slice(0, 16)}…
                </p>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Show this to the tourist to scan with their TourismPay app
              </p>
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full h-10 gap-2"
                onClick={handleCopyToken}
              >
                <Copy className="w-4 h-4" /> Copy Payment Link
              </Button>
              <Button
                variant="ghost"
                className="w-full h-10 gap-2 text-muted-foreground"
                onClick={handleReset}
              >
                <RefreshCw className="w-4 h-4" /> Generate New QR
              </Button>
            </div>

            {timeLeft === 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium">QR code expired</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This code is no longer valid. Regenerate to issue a fresh 15-minute token for the same order.
                </p>
                <Button
                  className="w-full h-10 gap-2 font-semibold"
                  onClick={handleRegenerate}
                  disabled={generateMut.isPending}
                >
                  {generateMut.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating…</>
                  ) : (
                    <><RefreshCw className="w-4 h-4" /> Regenerate QR Code</>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
