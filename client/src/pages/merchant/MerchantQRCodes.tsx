/**
 * MerchantQRCodes — Generate and manage QR payment codes for a merchant
 *
 * Accessible to: merchant, admin
 */
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { trpc } from "@/lib/trpc";
import { RoleGuard } from "@/components/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, Plus, Download, Copy, RefreshCw, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

const CURRENCIES = ["USD", "EUR", "GBP", "KES", "NGN", "ZAR", "GHS", "TZS", "UGX"];

type QRToken = {
  id: number;
  token: string;
  amountUsd: string | null;
  currency: string | null;
  description: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  status: string;
};

function GenerateQRDialog({ establishmentId, onSuccess }: { establishmentId: number; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const generateMutation = trpc.qrPayment.generate.useMutation({
    onSuccess: () => {
      toast.success("QR code generated", { description: "Your new QR payment code is ready." });
      setOpen(false);
      setAmount("");
      setDescription("");
      onSuccess();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Error", { description: msg });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Generate QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Payment QR Code</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fixed Amount (optional)</Label>
            <Input
              type="number"
              placeholder="Leave blank for open amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              If left blank, the tourist enters the amount when scanning.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input
              placeholder="e.g. Table 5, Lunch special"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={100}
            />
          </div>
          <Button
            className="w-full"
            onClick={() =>
              generateMutation.mutate({
                establishmentId,
                currency,
                amountUsd: amount || undefined,
                description: description || undefined,
              })
            }
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><QrCode className="w-4 h-4 mr-2" /> Generate</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QRCodeCard({ code, onCopy }: { code: QRToken; onCopy: (text: string) => void }) {
  const qrValue = `tourismpay://pay?token=${code.token}`;

  const handleDownload = () => {
    const svgEl = document.getElementById(`qr-${code.token.slice(-8)}`);
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 300;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      const link = document.createElement("a");
      link.download = `${(code.description || `QR_${code.token.slice(-6)}`).replace(/\s+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="shrink-0 bg-white p-2 rounded-lg border">
            <QRCodeSVG
              id={`qr-${code.token.slice(-8)}`}
              value={qrValue}
              size={100}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={code.status === "pending" ? "default" : "secondary"} className="text-xs">
                {code.status === "pending" ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Active</>
                ) : <>{code.status}</>}
              </Badge>
              {code.amountUsd && (
                <Badge variant="outline" className="text-xs font-mono">
                  {code.currency} {parseFloat(code.amountUsd).toFixed(2)}
                </Badge>
              )}
              {!code.amountUsd && (
                <Badge variant="outline" className="text-xs">Open Amount</Badge>
              )}
            </div>
            {code.description && (
              <p className="text-sm text-foreground font-medium truncate">{code.description}</p>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Created {format(new Date(code.createdAt), "MMM d, yyyy HH:mm")}</span>
            </div>
            {code.expiresAt && (
              <div className="flex items-center gap-1 text-xs text-amber-500">
                <Clock className="w-3 h-3" />
                <span>Expires {format(new Date(code.expiresAt), "MMM d, yyyy HH:mm")}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-7"
                onClick={() => onCopy(qrValue)}
              >
                <Copy className="w-3 h-3" />
                Copy Link
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={handleDownload}>
                <Download className="w-3 h-3" />
                Download
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MerchantQRCodes() {
  const utils = trpc.useUtils();

  const { data: establishments, isLoading: estLoading } = trpc.merchantRevenue.myEstablishments.useQuery();
  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);

  const estId = selectedEstId ?? (establishments?.[0]?.id ?? null);

  const { data: qrList, isLoading: qrLoading } = trpc.qrPayment.listRecent.useQuery(
    { establishmentId: estId! },
    { enabled: !!estId }
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Copied", { description: "Payment link copied to clipboard." });
    });
  };

  const handleRefresh = () => {
    if (estId) utils.qrPayment.listRecent.invalidate({ establishmentId: estId });
  };

  if (estLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!establishments || establishments.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <QrCode className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Establishments Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Complete the restaurant onboarding process before generating QR codes.
            </p>
            <Button variant="outline" onClick={() => window.location.href = "/restaurant-onboarding"}>
              Start Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const codes = (qrList ?? []) as unknown as QRToken[];

  return (
    <RoleGuard roles={["merchant", "admin"]}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">QR Payment Codes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Generate and manage QR codes for contactless payments at your establishment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleRefresh} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            {estId && (
              <GenerateQRDialog establishmentId={estId} onSuccess={handleRefresh} />
            )}
          </div>
        </div>

        {establishments.length > 1 && (
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <Label className="shrink-0 text-sm">Establishment:</Label>
                <Select
                  value={String(estId ?? "")}
                  onValueChange={(v) => setSelectedEstId(Number(v))}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {establishments.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4 px-5">
            <h3 className="text-sm font-semibold text-foreground mb-2">How QR Payments Work</h3>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Generate a QR code below (fixed or open amount).</li>
              <li>Display it at your counter, table, or print it out.</li>
              <li>Tourists scan it with the TourismPay app to pay instantly.</li>
              <li>Funds are credited to your wallet in real-time.</li>
            </ol>
          </CardContent>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">
              Your QR Codes
              {codes.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">({codes.length})</span>
              )}
            </h2>
          </div>

          {qrLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : codes.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <QrCode className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No QR codes yet. Generate your first one above.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {codes.map((code) => (
                <QRCodeCard key={code.token} code={code} onCopy={handleCopy} />
              ))}
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  );
}
