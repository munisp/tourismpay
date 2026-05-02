import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2, Loader2, AlertCircle, Share2, Download,
  MapPin, Building2, Receipt, ArrowLeft, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function PaymentReceipt() {
  const { token } = useParams<{ token: string }>();
  const [copied, setCopied] = useState(false);

  const { data: receipt, isLoading, error } = trpc.qrPayment.getReceipt.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(receipt?.receiptId ?? "");
    setCopied(true);
    toast.success("Receipt ID copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    const shareData = {
      title: `TourismPay Receipt ${receipt?.receiptId}`,
      text: `Payment of ${formatCurrency(receipt?.amount ?? 0, receipt?.currency ?? "USD")} at ${receipt?.merchant?.name ?? "merchant"} — ${receipt?.receiptId}`,
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Receipt link copied to clipboard");
    }
  };

  const handleDownload = () => {
    const lines = [
      "TourismPay Payment Receipt",
      "==========================",
      `Receipt ID:  ${receipt?.receiptId}`,
      `Date:        ${formatDate(receipt?.paidAt ?? null)}`,
      `Amount:      ${formatCurrency(receipt?.amount ?? 0, receipt?.currency ?? "USD")}`,
      `Currency:    ${receipt?.currency}`,
      receipt?.description ? `Description: ${receipt.description}` : null,
      "",
      "Merchant",
      `Name:        ${receipt?.merchant?.name ?? "—"}`,
      receipt?.merchant?.city ? `Location:    ${receipt.merchant.city}, ${receipt.merchant.country}` : null,
      "",
      `Paid by:     ${receipt?.payerName ?? "Anonymous"}`,
      receipt?.walletTxId ? `Wallet Ref:  ${receipt.walletTxId}` : null,
      "",
      "Thank you for using TourismPay!",
    ].filter(Boolean).join("\n");

    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${receipt?.receiptId ?? "receipt"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="text-muted-foreground">Invalid receipt link.</p>
          <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Go Home</Button></Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <p className="font-semibold">Receipt not found</p>
          <p className="text-sm text-muted-foreground">{error?.message ?? "This payment may not have been completed yet."}</p>
          <Link href="/"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Go Home</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-background to-background flex flex-col items-center justify-start py-8 px-4">
      {/* Back link */}
      <div className="w-full max-w-sm mb-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
      </div>

      {/* Receipt card */}
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-emerald-600 px-6 py-6 text-white text-center space-y-2">
          <CheckCircle2 className="w-12 h-12 mx-auto opacity-90" />
          <h1 className="text-xl font-bold">Payment Successful</h1>
          <p className="text-3xl font-extrabold tracking-tight">
            {formatCurrency(receipt.amount, receipt.currency)}
          </p>
          <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
            {receipt.currency}
          </Badge>
        </div>

        {/* Receipt ID bar */}
        <div className="bg-emerald-700/20 border-b border-border px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-muted-foreground">{receipt.receiptId}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
        </div>

        {/* Details */}
        <div className="px-6 py-5 space-y-4">
          {/* Date */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date &amp; Time</span>
            <span className="font-medium">{formatDate(receipt.paidAt)}</span>
          </div>

          {receipt.description && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Description</span>
              <span className="font-medium text-right max-w-[180px]">{receipt.description}</span>
            </div>
          )}

          {/* Line items */}
          {receipt.description && receipt.description.includes("|") && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
                <div className="space-y-1.5">
                  {receipt.description.split("|").map((item, i) => {
                    const [name, qty, price] = item.trim().split(":");
                    return (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-foreground">{name}{qty ? ` ×${qty}` : ""}</span>
                        <span className="font-medium">{price ?? ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Merchant */}
          {receipt.merchant && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Merchant</p>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{receipt.merchant.name}</p>
                  {receipt.merchant.city && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {receipt.merchant.city}, {receipt.merchant.country}
                    </p>
                  )}
                  <Badge variant="outline" className="text-xs mt-1 capitalize">{receipt.merchant.type?.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Paid by */}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paid by</span>
            <span className="font-medium">{receipt.payerName ?? "Anonymous"}</span>
          </div>

          {receipt.walletTxId && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Wallet Ref</span>
              <span className="font-mono text-xs text-muted-foreground truncate max-w-[160px]">{receipt.walletTxId}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-6 pt-2 flex gap-3">
          <Button variant="outline" className="flex-1" size="sm" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-2" /> Share
          </Button>
          <Button variant="outline" className="flex-1" size="sm" onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" /> Download
          </Button>
        </div>

        {/* Branding */}
        <div className="border-t border-border px-6 py-3 text-center">
          <p className="text-xs text-muted-foreground">Powered by <span className="font-semibold text-primary">TourismPay</span></p>
        </div>
      </div>
    </div>
  );
}
