/**
 * TouristExperience.tsx
 *
 * Mobile-first PWA view showing the complete tourist journey:
 *   1. Discover — browse approved restaurants/establishments nearby
 *   2. Pay — tap-to-pay with wallet balance, currency selection, FX preview
 *   3. Receipt — animated success screen with loyalty points earned
 *   4. History — spending timeline with per-establishment breakdown
 *   5. Loyalty — tier badge, points balance, available rewards
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  MapPin, Utensils, CreditCard, CheckCircle2, Clock, Star,
  Wallet, Gift, ChevronRight, Search, Zap, Globe, ArrowLeft,
  TrendingUp, Receipt, Sparkles, ShieldCheck, RefreshCw, QrCode, Map as MapIcon,
} from "lucide-react";
import { MapView } from "@/components/Map";

// ─── QR Scanner Dialog ───────────────────────────────────────────────────────

function QRScanDialog({
  open,
  onClose,
  onScanned,
}: {
  open: boolean;
  onClose: () => void;
  onScanned: (token: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const scannerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    setStatus("starting");
    setErrorMsg("");

    let scanner: any = null;
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      scanner = new Html5Qrcode("qr-reader-tourist");
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded: string) => {
            try {
              const url = new URL(decoded);
              const token = url.searchParams.get("token");
              if (token) {
                scanner.stop().catch(() => null);
                onScanned(token);
                onClose();
              } else {
                setErrorMsg("Invalid QR code — please scan a TourismPay payment code.");
              }
            } catch {
              setErrorMsg("Could not read QR code. Please try again.");
            }
          },
          () => { /* ignore frame errors */ }
        )
        .then(() => setStatus("scanning"))
        .catch((err: unknown) => {
          setStatus("error");
          setErrorMsg(err instanceof Error ? err.message : "Camera access denied");
        });
    }).catch(() => {
      setStatus("error");
      setErrorMsg("QR scanner could not be loaded.");
    });

    return () => {
      scanner?.stop().catch(() => null);
      setStatus("idle");
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-emerald-500" />
            Scan QR Code
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Point your camera at the establishment's TourismPay QR code to pay instantly.
          </p>
          <div
            id="qr-reader-tourist"
            className="w-full rounded-lg overflow-hidden bg-black"
            style={{ minHeight: 260 }}
          />
          {status === "starting" && (
            <p className="text-xs text-muted-foreground text-center">Starting camera…</p>
          )}
          {status === "scanning" && (
            <p className="text-xs text-emerald-600 text-center">Camera active — align QR code in the frame</p>
          )}
          {errorMsg && (
            <p className="text-xs text-destructive text-center">{errorMsg}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = "discover" | "map" | "pay" | "receipt" | "history" | "loyalty";

interface Establishment {
  id: number;
  name: string;
  type: string;
  country: string;
  city: string | null;
  address: string | null;
  kybStatus: string;
  contactEmail: string | null;
  latitude?: string | null;
  longitude?: string | null;
}

interface PayForm {
  currency: string;
  amount: string;
  note: string;
}

// ─── Currency helpers ─────────────────────────────────────────────────────────

const CURRENCIES = ["USDC", "CBDC-NG", "XLM"] as const;
const CURRENCY_SYMBOLS: Record<string, string> = { USDC: "$", "CBDC-NG": "₦", XLM: "XLM" };
const CURRENCY_FLAGS: Record<string, string> = { USDC: "🇺🇸", "CBDC-NG": "🇳🇬", XLM: "✨" };
const APPROX_USD: Record<string, number> = { USDC: 1, "CBDC-NG": 0.00065, XLM: 0.11 };

function fmtCurrency(amount: number, currency: string) {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${sym}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toUsd(amount: number, currency: string) {
  return amount * (APPROX_USD[currency] ?? 1);
}

// ─── Tier colours ─────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  BRONZE: "text-amber-700 bg-amber-100 border-amber-300",
  SILVER: "text-slate-600 bg-slate-100 border-slate-300",
  GOLD: "text-yellow-600 bg-yellow-100 border-yellow-300",
  PLATINUM: "text-purple-600 bg-purple-100 border-purple-300",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

type AvailabilityStatus = "available" | "limited" | "full" | "blocked" | "none" | undefined;

function AvailabilityDot({ status, availableSlots }: { status: AvailabilityStatus; availableSlots?: number }) {
  if (!status || status === "none") return null;
  const cfg: Record<string, { color: string; label: string }> = {
    available: { color: "bg-emerald-500", label: `${availableSlots ?? ""} slots available` },
    limited: { color: "bg-amber-500", label: `Only ${availableSlots ?? "few"} slots left` },
    full: { color: "bg-red-500", label: "Fully booked" },
    blocked: { color: "bg-slate-400", label: "Closed / blocked" },
  };
  const { color, label } = cfg[status] ?? cfg.available;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      <span className="truncate max-w-[80px]">{label}</span>
    </span>
  );
}

function EstablishmentCard({
  est,
  onPay,
  availability,
}: {
  est: Establishment;
  onPay: (est: Establishment) => void;
  availability?: { status: string; totalSlots: number; availableSlots: number };
}) {
  const typeIcon: Record<string, string> = {
    restaurant: "🍽️",
    hotel: "🏨",
    tour_operator: "🗺️",
    safari_lodge: "🦁",
    spa_wellness: "💆",
    museum: "🏛️",
    theme_park: "🎡",
    beach_resort: "🏖️",
    concert_venue: "🎭",
    nightclub: "🎵",
    sports_venue: "🏟️",
    conference_center: "🏢",
    travel_agency: "✈️",
    airline: "✈️",
    car_rental: "🚗",
    retail: "🛍️",
    transport: "🚌",
    other: "🏢",
  };
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
      {/* Colourful header strip */}
      <div className="h-2 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-xl flex-shrink-0">
              {typeIcon[est.type] ?? "🏢"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{est.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{est.type.replace("_", " ")}</p>
              {(est.city || est.country) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {[est.city, est.country].filter(Boolean).join(", ")}
                </p>
              )}
              {availability && (
                <div className="mt-1">
                  <AvailabilityDot
                    status={availability.status as AvailabilityStatus}
                    availableSlots={availability.availableSlots}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 bg-emerald-50">
              <ShieldCheck className="w-3 h-3 mr-1" /> Verified
            </Badge>
            <Button size="sm" className="text-xs h-7 px-3" onClick={() => onPay(est)}>
              <Zap className="w-3 h-3 mr-1" /> Pay
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PayDialog({
  est,
  balances,
  open,
  onClose,
  onSuccess,
}: {
  est: Establishment | null;
  balances: { currency: string; balance: string }[];
  open: boolean;
  onClose: () => void;
  onSuccess: (amount: number, currency: string, estName: string, txId: number) => void;
}) {
  const [form, setForm] = useState<PayForm>({ currency: "USDC", amount: "", note: "" });
  const utils = trpc.useUtils();

  const sendMut = trpc.wallet.send.useMutation({
    onSuccess: (data) => {
      utils.wallet.balances.invalidate();
      utils.wallet.transactions.invalidate();
      const amt = parseFloat(form.amount);
      onSuccess(amt, form.currency, est?.name ?? "", 0);
      setForm({ currency: "USDC", amount: "", note: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const selectedBalance = balances.find((b) => b.currency === form.currency);
  const available = parseFloat(selectedBalance?.balance ?? "0");
  const amountNum = parseFloat(form.amount) || 0;
  const usdEquiv = toUsd(amountNum, form.currency);
  const isValid = amountNum > 0 && amountNum <= available && est !== null;

  const handlePay = () => {
    if (!est || !isValid) return;
    sendMut.mutate({
      currency: form.currency as any,
      amount: amountNum,
      counterparty: est.name,
      note: form.note || `Payment at ${est.name}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-500" />
            Pay at {est?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Currency selector */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
            <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CURRENCY_FLAGS[c]} {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Available: {fmtCurrency(available, form.currency)}
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount</label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="text-lg font-semibold"
            />
            {amountNum > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                ≈ ${usdEquiv.toFixed(2)} USD
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
            <Input
              placeholder="e.g. Dinner for 2"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>

          {/* Loyalty preview */}
          {amountNum > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                You'll earn <strong>{Math.floor(usdEquiv * 10)} loyalty points</strong> on this payment
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sendMut.isPending}>Cancel</Button>
          <Button
            onClick={handlePay}
            disabled={!isValid || sendMut.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {sendMut.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" /> Pay {form.amount ? fmtCurrency(amountNum, form.currency) : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptScreen({
  amount,
  currency,
  estName,
  pointsEarned,
  receiptToken,
  onDone,
}: {
  amount: number;
  currency: string;
  estName: string;
  pointsEarned: number;
  receiptToken?: string;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      {/* Success animation */}
      <div className="w-24 h-24 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-6 animate-bounce-once">
        <CheckCircle2 className="w-14 h-14 text-emerald-500" />
      </div>

      <h2 className="text-2xl font-bold mb-1">Payment Successful!</h2>
      <p className="text-muted-foreground text-sm mb-6">Your payment has been processed securely</p>

      {/* Receipt card */}
      <Card className="w-full max-w-sm mb-6 text-left">
        <CardContent className="p-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Merchant</span>
            <span className="font-medium">{estName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="font-bold text-emerald-600">{fmtCurrency(amount, currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">USD Equivalent</span>
            <span className="font-medium">${toUsd(amount, currency).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Currency</span>
            <span className="font-medium">{CURRENCY_FLAGS[currency]} {currency}</span>
          </div>
          <div className="border-t pt-3 flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Confirmed</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Loyalty points earned */}
      {pointsEarned > 0 && (
        <div className="w-full max-w-sm rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 p-4 text-white mb-6 flex items-center gap-3">
          <Sparkles className="w-8 h-8 flex-shrink-0" />
          <div>
            <p className="font-bold text-lg">+{pointsEarned} Points Earned!</p>
            <p className="text-sm opacity-90">Added to your TourismPay loyalty account</p>
          </div>
        </div>
      )}

      <div className="flex gap-3 w-full max-w-sm flex-wrap">
        <Button variant="outline" className="flex-1" onClick={onDone}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        {receiptToken ? (
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => window.open(`/receipt/${receiptToken}`, "_blank")}
          >
            <Receipt className="w-4 h-4 mr-2" /> View Receipt
          </Button>
        ) : (
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={onDone}>
            <Receipt className="w-4 h-4 mr-2" /> View History
          </Button>
        )}
      </div>
    </div>
  );
}

/// ─── EstablishmentMapView ────────────────────────────────────────────────────
// ─── Availability pin color helper ───────────────────────────────────────────

function getPinBgColor(status: string | undefined): string {
  switch (status) {
    case "available": return "#16a34a"; // green-600
    case "limited":   return "#d97706"; // amber-600
    case "full":      return "#dc2626"; // red-600
    case "blocked":   return "#6b7280"; // gray-500
    case "none":      return "#16a34a"; // no data = treat as open
    default:          return "#16a34a"; // default emerald
  }
}

function getAvailabilityLabel(avail: { status: string; totalSlots: number; availableSlots: number } | undefined): string {
  if (!avail || avail.status === "none") return "Open";
  if (avail.status === "blocked") return "Closed";
  if (avail.status === "full") return "Fully Booked";
  if (avail.status === "limited") return `${avail.availableSlots} slot${avail.availableSlots !== 1 ? "s" : ""} left`;
  return `${avail.availableSlots} available`;
}

function EstablishmentMapView({
  establishments,
  onPay,
  availabilitySummary = {},
  travelDate,
}: {
  establishments: Establishment[];
  onPay: (est: Establishment) => void;
  availabilitySummary?: Record<number, { status: string; totalSlots: number; availableSlots: number }>;
  travelDate?: string;
}) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clustererRef = useRef<any>(null);
  const [selectedEst, setSelectedEst] = useState<Establishment | null>(null);

  // ── Viewport persistence helpers ──────────────────────────────────────────
  const VIEWPORT_KEY = "tp_tourist_map_viewport";
  // Africa bounding box: lat -35..37, lng -20..52
  const isInAfrica = (lat: number, lng: number) =>
    lat >= -35 && lat <= 37 && lng >= -20 && lng <= 52;

  const saveViewport = (map: google.maps.Map) => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    if (!center || zoom === undefined) return;
    try {
      localStorage.setItem(
        VIEWPORT_KEY,
        JSON.stringify({ lat: center.lat(), lng: center.lng(), zoom })
      );
    } catch {
      // localStorage may be unavailable in private browsing
    }
  };

  const loadViewport = (): { lat: number; lng: number; zoom: number } | null => {
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { lat: number; lng: number; zoom: number };
      if (
        typeof parsed.lat === "number" &&
        typeof parsed.lng === "number" &&
        typeof parsed.zoom === "number" &&
        isInAfrica(parsed.lat, parsed.lng)
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    infoWindowRef.current = new window.google.maps.InfoWindow();

    // Restore saved viewport (if within Africa bounding box)
    const saved = loadViewport();
    if (saved) {
      map.setCenter({ lat: saved.lat, lng: saved.lng });
      map.setZoom(saved.zoom);
    }

    // Save viewport on every idle event (debounced by Google Maps internally)
    map.addListener("idle", () => saveViewport(map));

    // Clear old markers and clusterer
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    const geocoder = new window.google.maps.Geocoder();
    const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    const placeEst = (est: Establishment, lat: number, lng: number) => {
      const avail = availabilitySummary[est.id];
      const pinBg = getPinBgColor(avail?.status);
      const availLabel = getAvailabilityLabel(avail);

      const pin = document.createElement("div");
      pin.style.cssText = `
        display:flex;align-items:center;justify-content:center;
        width:36px;height:36px;border-radius:50%;
        background:${pinBg};color:#fff;font-size:14px;
        font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,0.3);
        border:2.5px solid rgba(255,255,255,0.85);cursor:pointer;
        position:relative;
      `;
      const PIN_ICONS: Record<string, string> = {
        restaurant: "🍽", hotel: "🏨", tour_operator: "🗺",
        safari_lodge: "🦁", spa_wellness: "💆", museum: "🏛",
        theme_park: "🎡", beach_resort: "🏖", concert_venue: "🎭",
        nightclub: "🎵", sports_venue: "🏟", conference_center: "🏢",
        travel_agency: "✈", airline: "✈", car_rental: "🚗",
        retail: "🛍", transport: "🚌",
      };
      pin.textContent = PIN_ICONS[est.type] ?? "📍";

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
        title: est.name,
        content: pin,
        // NOTE: do NOT set map here — MarkerClusterer manages map assignment
      });

      marker.addListener("click", () => {
        setSelectedEst(est);
        if (infoWindowRef.current) {
          const availBadgeColor = avail?.status === "available" ? "#16a34a" :
            avail?.status === "limited" ? "#d97706" :
            avail?.status === "full" ? "#dc2626" :
            avail?.status === "blocked" ? "#6b7280" : "#16a34a";
          infoWindowRef.current.setContent(
            `<div style="padding:8px;max-width:220px">
              <strong style="font-size:13px">${est.name}</strong>
              <p style="margin:4px 0;font-size:11px;color:#666">${est.type.replace(/_/g, " ")} · ${est.city ?? est.country}</p>
              ${est.address ? `<p style="margin:4px 0;font-size:11px;color:#888">${est.address}</p>` : ""}
              <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${availBadgeColor};flex-shrink:0"></span>
                <span style="font-size:11px;font-weight:600;color:${availBadgeColor}">${availLabel}</span>
                ${travelDate ? `<span style="font-size:10px;color:#999">${travelDate}</span>` : ""}
              </div>
            </div>`
          );
          infoWindowRef.current.open({ anchor: marker, map });
        }
      });

      newMarkers.push(marker);
    };

    // Geocode establishments without coordinates, then cluster all markers
    const geocodePromises: Promise<void>[] = [];
    establishments.forEach((est) => {
      if (est.latitude && est.longitude) {
        placeEst(est, parseFloat(est.latitude), parseFloat(est.longitude));
      } else {
        const addr = [est.address, est.city, est.country].filter(Boolean).join(", ");
        if (!addr) return;
        geocodePromises.push(
          new Promise<void>((resolve) => {
            geocoder.geocode({ address: addr }, (results, status) => {
              if (status === "OK" && results?.[0]) {
                const loc = results[0].geometry.location;
                placeEst(est, loc.lat(), loc.lng());
              }
              resolve();
            });
          })
        );
      }
    });

    // After all geocoding is done, create the clusterer
    Promise.all(geocodePromises).then(() => {
      markersRef.current = newMarkers;
      // Dynamically import MarkerClusterer to avoid SSR issues
      import("@googlemaps/markerclusterer").then(({ MarkerClusterer, DefaultRenderer }) => {
        // Custom renderer: cluster circle with count
        const renderer = new DefaultRenderer();
        const clusterer = new MarkerClusterer({
          map,
          markers: newMarkers,
          renderer,
        });
        clustererRef.current = clusterer;

        // Cluster click → zoom to fit the cluster's marker bounds
        clusterer.addListener("clusterclick", (cluster: any) => {
          const clusterMarkers: google.maps.marker.AdvancedMarkerElement[] = cluster.markers ?? [];
          if (clusterMarkers.length === 0) return;
          const bounds = new window.google.maps.LatLngBounds();
          clusterMarkers.forEach((m) => {
            if (m.position) bounds.extend(m.position as google.maps.LatLngLiteral);
          });
          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, 80); // 80px padding
          }
        });
      }).catch(() => {
        // Fallback: add markers directly to map if clusterer fails
        newMarkers.forEach((m) => { m.map = map; });
      });
    });
  }, [establishments, availabilitySummary, travelDate]);

  // Legend items
  const legend = [
    { color: "#16a34a", label: "Available" },
    { color: "#d97706", label: "Limited" },
    { color: "#dc2626", label: "Full" },
    { color: "#6b7280", label: "Closed" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {establishments.length} verified establishment{establishments.length !== 1 ? "s" : ""} on map
        </p>
        {selectedEst && (
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-xs h-7"
            onClick={() => { onPay(selectedEst); setSelectedEst(null); }}
          >
            <CreditCard className="w-3 h-3 mr-1" /> Pay {selectedEst.name}
          </Button>
        )}
      </div>
      {/* Availability legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span style={{ background: l.color }} className="inline-block w-3 h-3 rounded-full flex-shrink-0" />
            <span className="text-xs text-muted-foreground">{l.label}</span>
          </div>
        ))}
        {travelDate && (
          <span className="text-xs text-muted-foreground ml-auto">📅 {travelDate}</span>
        )}
      </div>
      <MapView
        className="w-full h-[420px] rounded-xl overflow-hidden border"
        initialCenter={{ lat: 6.5244, lng: 3.3792 }} // Lagos, Nigeria — primary market
        initialZoom={5}
        onMapReady={handleMapReady}
      />
      {establishments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No approved establishments to show</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TouristExperience() {
  const { user, isAuthenticated, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>("discover");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedEst, setSelectedEst] = useState<Establishment | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [qrScanOpen, setQrScanOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    amount: number; currency: string; estName: string; pointsEarned: number; receiptToken?: string;
  } | null>(null);
  const [travelDate, setTravelDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // ── Data queries ──────────────────────────────────────────────────────────
  const { data: establishments = [], isLoading: loadingEst } = trpc.kyb.listEstablishments.useQuery(
    { kybStatus: "approved", limit: 50 },
    { enabled: isAuthenticated }
  );
  // Availability summary for the selected travel date
  const estIds = useMemo(() => (establishments as Establishment[]).map((e) => e.id), [establishments]);
  const { data: availabilitySummary = {} } = trpc.serviceAvailability.getEstablishmentAvailabilitySummary.useQuery(
    { establishmentIds: estIds, date: travelDate },
    { enabled: estIds.length > 0 }
  );

  const { data: balances = [], isLoading: loadingBal } = trpc.wallet.balances.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: txData, isLoading: loadingTx } = trpc.wallet.transactions.useQuery(
    { limit: 20 }, { enabled: isAuthenticated }
  );
  const { data: loyaltyAccount } = trpc.loyalty.account.useQuery(
    undefined, { enabled: isAuthenticated }
  );
  const { data: loyaltyRewards = [] } = trpc.loyalty.rewards.useQuery(
    undefined, { enabled: isAuthenticated }
  );

  const earnMut = trpc.loyalty.earn.useMutation();

  // ── Derived data ──────────────────────────────────────────────────────────
  const filteredEst = useMemo(() => {
    const q = search.toLowerCase();
    return (establishments as Establishment[]).filter(
      (e) =>
        (typeFilter === "all" || e.type === typeFilter) &&
        (
          e.name.toLowerCase().includes(q) ||
          (e.city ?? "").toLowerCase().includes(q) ||
          (e.type ?? "").toLowerCase().includes(q)
        )
    );
  }, [establishments, search, typeFilter]);

  const transactions = txData?.items ?? [];

  const totalSpentUsd = useMemo(
    () =>
      transactions
        .filter((t: any) => t.type === "debit")
        .reduce((sum: number, t: any) => sum + toUsd(parseFloat(t.amount), t.currency), 0),
    [transactions]
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleQRScanned = useCallback((token: string) => {
    toast.info("QR code scanned", { description: "Opening payment — select amount to confirm." });
    // Open pay dialog; the token is embedded in the QR data for backend use
    setPayOpen(true);
  }, []);

  const handlePay = useCallback((est: Establishment) => {
    setSelectedEst(est);
    setPayOpen(true);
  }, []);

  const handlePaySuccess = useCallback(
    async (amount: number, currency: string, estName: string, txId: number) => {
      setPayOpen(false);
      const usd = toUsd(amount, currency);
      const pts = Math.floor(usd * 10);
      // Earn loyalty points
      if (pts > 0) {
        await earnMut.mutateAsync({
          points: pts,
          description: `Payment at ${estName}`,
          partner: estName,
        }).catch(() => null);
      }
      setLastReceipt({ amount, currency, estName, pointsEarned: pts });
      setScreen("receipt");
    },
    [earnMut]
  );

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <Globe className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Tourist Experience</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to discover restaurants, pay with your digital wallet, and earn loyalty rewards across Africa.
        </p>
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <a href={getLoginUrl()}>Sign in to continue</a>
        </Button>
      </div>
    );
  }

  // ── Receipt screen ────────────────────────────────────────────────────────
  if (screen === "receipt" && lastReceipt) {
    return (
      <div className="max-w-md mx-auto px-4 py-6">
        <ReceiptScreen
          {...lastReceipt}
          onDone={() => { setScreen("discover"); setLastReceipt(null); }}
        />
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 py-6">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-xl font-bold">
              Hello, {user?.name?.split(" ")[0] ?? "Traveller"} 👋
            </h1>
            <p className="text-xs text-muted-foreground">Discover & pay across Africa</p>
          </div>
          {loyaltyAccount && (
            <Badge
              variant="outline"
              className={`text-xs font-semibold border ${TIER_COLORS[loyaltyAccount.tier] ?? ""}`}
            >
              <Star className="w-3 h-3 mr-1" />
              {loyaltyAccount.tier}
            </Badge>
          )}
        </div>

        {/* Wallet balance strip */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {loadingBal
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-28 rounded-xl flex-shrink-0" />)
            : (balances as any[]).map((b) => (
                <div
                  key={b.currency}
                  className="flex-shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white px-4 py-2 min-w-[110px]"
                >
                  <p className="text-xs opacity-80">{CURRENCY_FLAGS[b.currency]} {b.currency}</p>
                  <p className="font-bold text-sm">{fmtCurrency(parseFloat(b.balance), b.currency)}</p>
                </div>
              ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={screen} onValueChange={(v) => setScreen(v as Screen)}>
        <TabsList className="grid grid-cols-5 w-full mb-4">
          <TabsTrigger value="discover" className="text-xs"><MapPin className="w-3 h-3 mr-1" />Discover</TabsTrigger>
          <TabsTrigger value="map" className="text-xs"><MapIcon className="w-3 h-3 mr-1" />Map</TabsTrigger>
          <TabsTrigger value="history" className="text-xs"><Clock className="w-3 h-3 mr-1" />History</TabsTrigger>
          <TabsTrigger value="loyalty" className="text-xs"><Gift className="w-3 h-3 mr-1" />Loyalty</TabsTrigger>
          <TabsTrigger value="wallet" className="text-xs"><Wallet className="w-3 h-3 mr-1" />Wallet</TabsTrigger>
        </TabsList>

        {/* ── Discover tab ── */}
        <TabsContent value="discover" className="space-y-3">
          {/* Search + QR row */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search establishments, cities…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs flex-shrink-0"
              onClick={() => setQrScanOpen(true)}
            >
              <QrCode className="w-3.5 h-3.5" /> Scan
            </Button>
          </div>
          {/* Travel date picker */}
          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2">
            <span className="text-xs text-muted-foreground flex-shrink-0">📅 Travel date:</span>
            <input
              type="date"
              value={travelDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setTravelDate(e.target.value)}
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer min-w-0"
            />
            <span className="text-xs text-muted-foreground flex-shrink-0">Availability shown below</span>
          </div>

          {/* Type filter chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-nowrap">
            {[
              { value: "all", label: "All", icon: "🌍" },
              { value: "restaurant", label: "Dining", icon: "🍽️" },
              { value: "hotel", label: "Hotels", icon: "🏨" },
              { value: "safari_lodge", label: "Safari", icon: "🦁" },
              { value: "tour_operator", label: "Tours", icon: "🗺️" },
              { value: "beach_resort", label: "Beach", icon: "🏖️" },
              { value: "spa_wellness", label: "Wellness", icon: "💆" },
              { value: "museum", label: "Culture", icon: "🏛️" },
              { value: "theme_park", label: "Parks", icon: "🎡" },
              { value: "concert_venue", label: "Events", icon: "🎭" },
              { value: "sports_venue", label: "Sports", icon: "🏟️" },
              { value: "nightclub", label: "Nightlife", icon: "🎵" },
              { value: "airline", label: "Airlines", icon: "✈️" },
              { value: "car_rental", label: "Car Hire", icon: "🚗" },
              { value: "travel_agency", label: "Travel", icon: "🏷️" },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  typeFilter === t.value
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background text-muted-foreground border-border hover:border-emerald-400"
                }`}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          {loadingEst ? (
            [...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          ) : filteredEst.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No verified establishments found</p>
              <p className="text-xs mt-1">Try a different search or category filter</p>
            </div>
          ) : (
            filteredEst.map((est) => (
              <EstablishmentCard
                key={est.id}
                est={est}
                onPay={handlePay}
                availability={(availabilitySummary as Record<number, { status: string; totalSlots: number; availableSlots: number }>)[est.id]}
              />
            ))
          )}
        </TabsContent>

        {/* ── Map tab ── */}
        <TabsContent value="map" className="space-y-3">
          {/* Travel date picker shared with Discover tab */}
          <div className="flex items-center gap-2 bg-muted/40 rounded-xl px-3 py-2">
            <span className="text-xs text-muted-foreground flex-shrink-0">📅 Travel date:</span>
            <input
              type="date"
              value={travelDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setTravelDate(e.target.value)}
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer min-w-0"
            />
            <span className="text-xs text-muted-foreground flex-shrink-0">Pins show availability</span>
          </div>
          <EstablishmentMapView
            establishments={filteredEst as Establishment[]}
            onPay={handlePay}
            availabilitySummary={availabilitySummary as Record<number, { status: string; totalSlots: number; availableSlots: number }>}
            travelDate={travelDate}
          />
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="space-y-3">
          {/* Spending summary */}
          <Card className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border-0">
            <CardContent className="p-4">
              <p className="text-xs opacity-70 mb-1">Total Spent (USD equiv.)</p>
              <p className="text-3xl font-bold">${totalSpentUsd.toFixed(2)}</p>
              <p className="text-xs opacity-60 mt-1">Last 20 transactions</p>
            </CardContent>
          </Card>

          {loadingTx ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No transactions yet</p>
              <p className="text-xs mt-1">Pay at a restaurant to see your history here</p>
            </div>
          ) : (
            transactions.map((tx: any) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent/30 transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                    tx.type === "debit"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                      : "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500"
                  }`}
                >
                  {tx.type === "debit" ? (
                    <CreditCard className="w-4 h-4" />
                  ) : (
                    <TrendingUp className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tx.counterparty ?? "Transfer"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()} · {tx.currency}
                  </p>
                </div>
                <p
                  className={`text-sm font-semibold flex-shrink-0 ${
                    tx.type === "debit" ? "text-red-500" : "text-emerald-500"
                  }`}
                >
                  {tx.type === "debit" ? "-" : "+"}
                  {fmtCurrency(parseFloat(tx.amount), tx.currency)}
                </p>
              </div>
            ))
          )}
        </TabsContent>

        {/* ── Loyalty tab ── */}
        <TabsContent value="loyalty" className="space-y-4">
          {/* Tier card */}
          {loyaltyAccount && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs opacity-80">Your Tier</p>
                  <p className="text-2xl font-bold">{loyaltyAccount.tier}</p>
                </div>
                <Star className="w-10 h-10 opacity-40" />
              </div>
              <div className="flex gap-6">
                <div>
                  <p className="text-xs opacity-80">Points Balance</p>
                  <p className="text-xl font-bold">{loyaltyAccount.pointsBalance?.toLocaleString() ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs opacity-80">Lifetime Points</p>
                  <p className="text-xl font-bold">{loyaltyAccount.lifetimePoints?.toLocaleString() ?? 0}</p>
                </div>
              </div>
            </div>
          )}

          {/* Available rewards */}
          <div>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-500" /> Available Rewards
            </h3>
            {(loyaltyRewards as any[]).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No rewards available yet</p>
                <p className="text-xs mt-1">Keep paying to unlock rewards</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(loyaltyRewards as any[]).slice(0, 5).map((r: any) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-3 rounded-xl border bg-card"
                  >
                    <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <Gift className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.pointsCost} points</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
                <Button variant="outline" className="w-full text-xs" asChild>
                  <Link href="/loyalty">View all rewards →</Link>
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Wallet tab ── */}
        <TabsContent value="wallet" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-500" /> Your Balances
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loadingBal ? (
                [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)
              ) : (
                (balances as any[]).map((b) => (
                  <div key={b.currency} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{CURRENCY_FLAGS[b.currency] ?? "💰"}</span>
                      <div>
                        <p className="text-sm font-medium">{b.currency}</p>
                        <p className="text-xs text-muted-foreground">
                          ≈ ${toUsd(parseFloat(b.balance), b.currency).toFixed(2)} USD
                        </p>
                      </div>
                    </div>
                    <p className="font-bold">{fmtCurrency(parseFloat(b.balance), b.currency)}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full" asChild>
            <Link href="/wallet">
              <Wallet className="w-4 h-4 mr-2" /> Open Full Wallet
            </Link>
          </Button>
        </TabsContent>
      </Tabs>

      {/* ── QR Scan Dialog ── */}
      <QRScanDialog
        open={qrScanOpen}
        onClose={() => setQrScanOpen(false)}
        onScanned={handleQRScanned}
      />
      {/* ── Pay Dialog ── */}
      <PayDialog
        est={selectedEst}
        balances={balances as any[]}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onSuccess={handlePaySuccess}
      />
    </div>
  );
}
