/**
 * ARTourism — Production AR page for TourismPay PWA
 * ===================================================
 * Three AR modes:
 *  1. Location AR  — WebXR camera passthrough with GPS-anchored Three.js 3D
 *                    establishment overlay cards. Falls back to live camera
 *                    feed + CSS-positioned 2D cards on non-WebXR browsers.
 *  2. Heritage AR  — Filtered to cultural heritage sites with rich overlays.
 *  3. Marker AR    — Point camera at a TourismPay QR code to trigger payment.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { TourismPayAREngine, AREstablishment, ARStatus } from "@/lib/ar-engine";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Camera, MapPin, Star, Loader2, Globe, X, QrCode,
  Navigation, Layers, Landmark, Wifi, WifiOff,
  AlertTriangle, Info, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ARMode = "location" | "heritage" | "marker";
type ViewMode = "webxr" | "camera_2d" | "map_2d";

// ─── AR Overlay Card ──────────────────────────────────────────────────────────
function ARCard({ establishment, onClick, style }: {
  establishment: AREstablishment & { screenX?: number; screenY?: number };
  onClick: (est: AREstablishment) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="absolute pointer-events-auto cursor-pointer select-none"
      style={{ left: style?.left ?? "50%", top: style?.top ?? "50%", transform: "translate(-50%, -100%)", ...style }}
      onClick={() => onClick(establishment)}
    >
      <div className="absolute left-1/2 bottom-0 w-px h-8 bg-primary/40 transform translate-y-full" />
      <div className={cn(
        "rounded-xl border backdrop-blur-md shadow-2xl px-3 py-2 min-w-[180px] max-w-[220px]",
        "transition-all duration-200 hover:scale-105 active:scale-95",
        establishment.heritage
          ? "bg-purple-950/90 border-purple-500/60"
          : "bg-slate-900/90 border-primary/40"
      )}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-white text-sm font-semibold leading-tight line-clamp-2">{establishment.name}</p>
          {establishment.heritage && <Landmark className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />}
        </div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <MapPin className="w-3 h-3 text-primary shrink-0" />
          <span className="text-xs text-slate-400">{establishment.category}</span>
          <span className="text-xs text-slate-500 ml-auto">
            {establishment.distanceM < 1000 ? `${establishment.distanceM}m` : `${(establishment.distanceM / 1000).toFixed(1)}km`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {establishment.rating && (
            <div className="flex items-center gap-0.5">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span className="text-xs text-amber-400">{establishment.rating.toFixed(1)}</span>
            </div>
          )}
          {(establishment.loyaltyMultiplier ?? 1) > 1 && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 text-emerald-400 border-emerald-400/40">
              {establishment.loyaltyMultiplier}x pts
            </Badge>
          )}
          {establishment.acceptsQRPay && (
            <div className="ml-auto flex items-center gap-0.5">
              <QrCode className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400">Pay</span>
            </div>
          )}
        </div>
        {establishment.heritage && establishment.heritageDescription && (
          <p className="text-[10px] text-purple-300 mt-1.5 line-clamp-2 leading-relaxed">
            {establishment.heritageDescription}
          </p>
        )}
        <div className="mt-2 h-1 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all",
              establishment.distanceM < 100 ? "bg-emerald-500"
              : establishment.distanceM < 300 ? "bg-amber-500" : "bg-primary"
            )}
            style={{ width: `${Math.max(5, 100 - (establishment.distanceM / 500) * 100)}%` }}
          />
        </div>
      </div>
      <div className="absolute left-1/2 bottom-0 w-2 h-2 rounded-full bg-primary transform translate-x-[-50%] translate-y-[calc(100%+2rem)]" />
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────
function PaymentModal({ establishment, onClose, onPay }: {
  establishment: AREstablishment | null;
  onClose: () => void;
  onPay: (est: AREstablishment) => void;
}) {
  if (!establishment) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h3 className="font-semibold text-white">{establishment.name}</h3>
            <p className="text-sm text-slate-400">{establishment.category} · {establishment.distanceM}m away</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400"><X className="w-4 h-4" /></Button>
        </div>
        <div className="p-4 space-y-3">
          {establishment.heritage && establishment.heritageDescription && (
            <div className="bg-purple-950/50 rounded-lg p-3 border border-purple-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Landmark className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-300">Heritage Site</span>
              </div>
              <p className="text-xs text-purple-200 leading-relaxed">{establishment.heritageDescription}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {establishment.rating && (
              <div className="bg-slate-800 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  <span className="text-lg font-bold text-amber-400">{establishment.rating.toFixed(1)}</span>
                </div>
                <p className="text-xs text-slate-400">Rating</p>
              </div>
            )}
            {(establishment.loyaltyMultiplier ?? 1) > 1 && (
              <div className="bg-slate-800 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-lg font-bold text-emerald-400">{establishment.loyaltyMultiplier}x</span>
                </div>
                <p className="text-xs text-slate-400">Loyalty Points</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Navigation className="w-4 h-4 text-primary" />
            <span>{establishment.distanceM < 1000 ? `${establishment.distanceM}m` : `${(establishment.distanceM / 1000).toFixed(1)}km`} away</span>
            <span className="mx-1">·</span>
            <Globe className="w-4 h-4" />
            <span>{establishment.country}</span>
          </div>
        </div>
        <div className="p-4 pt-0 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
          {establishment.acceptsQRPay && (
            <Button className="flex-1 gap-2" onClick={() => onPay(establishment)}>
              <QrCode className="w-4 h-4" />Pay with QR
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ARTourism() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<TourismPayAREngine | null>(null);

  const [arMode, setARMode] = useState<ARMode>("location");
  const [viewMode, setViewMode] = useState<ViewMode>("camera_2d");
  const [arStatus, setARStatus] = useState<ARStatus>("idle");
  const [isActive, setIsActive] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedEstablishment, setSelectedEstablishment] = useState<AREstablishment | null>(null);
  const [webxrSupported, setWebxrSupported] = useState<boolean | null>(null);
  const [cardPositions, setCardPositions] = useState<Array<AREstablishment & { screenX: number; screenY: number }>>([]);

  const nearbyQuery = trpc.ar.getNearbyEstablishments.useQuery(
    { lat: userLocation?.lat ?? 0, lng: userLocation?.lng ?? 0, radiusMeters: 500, limit: 8,
      mode: arMode === "heritage" ? "heritage" : arMode === "location" ? "location" : "all" },
    { enabled: !!userLocation && isActive }
  );
  const arStatsQuery = trpc.ar.getARStats.useQuery({});
  const recordInteraction = trpc.ar.recordARInteraction.useMutation();

  useEffect(() => { TourismPayAREngine.isSupported().then(setWebxrSupported); }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError("Geolocation not supported"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(null); },
      () => { setUserLocation({ lat: 6.5244, lng: 3.3792 }); toast.info("Using demo location (Lagos, Nigeria)"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const startAR = useCallback(async () => {
    if (!userLocation) { requestLocation(); return; }
    setIsActive(true);
    if (!engineRef.current) {
      engineRef.current = new TourismPayAREngine();
      engineRef.current.onStatusChange = setARStatus;
      engineRef.current.onCardTap = (est) => {
        setSelectedEstablishment(est);
        recordInteraction.mutate({ establishmentId: est.id, interactionType: "card_tap", lat: userLocation.lat, lng: userLocation.lng, mode: arMode });
      };
      engineRef.current.onError = (msg) => toast.error(`AR Error: ${msg}`);
    }
    if (webxrSupported && canvasRef.current) {
      setViewMode("webxr");
      await engineRef.current.start(canvasRef.current);
    } else if (videoRef.current) {
      setViewMode("camera_2d");
      await engineRef.current.startCameraFallback(videoRef.current);
    } else {
      setViewMode("map_2d");
      setARStatus("fallback_2d");
    }
  }, [userLocation, webxrSupported, arMode, requestLocation, recordInteraction]);

  const stopAR = useCallback(async () => {
    await engineRef.current?.stop();
    setIsActive(false); setARStatus("idle"); setCardPositions([]);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!nearbyQuery.data?.establishments || !userLocation || !isActive) return;
    const establishments = nearbyQuery.data.establishments;
    if (viewMode === "webxr" && engineRef.current) {
      engineRef.current.addEstablishments(establishments, userLocation.lat, userLocation.lng);
    } else {
      const positions = establishments.map((est, i) => {
        const angle = (i / establishments.length) * Math.PI * 2 - Math.PI / 2;
        const radius = 0.25 + (i % 3) * 0.08;
        return { ...est,
          screenX: Math.max(10, Math.min(90, 50 + Math.cos(angle) * radius * 100)),
          screenY: Math.max(15, Math.min(85, 50 + Math.sin(angle) * radius * 60)),
        };
      });
      setCardPositions(positions);
    }
  }, [nearbyQuery.data, userLocation, isActive, viewMode]);

  const handleCanvasTap = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    engineRef.current?.handleTap(e.clientX, e.clientY);
  }, []);

  const handleQRPayment = useCallback((est: AREstablishment) => {
    setSelectedEstablishment(null);
    recordInteraction.mutate({ establishmentId: est.id, interactionType: "qr_trigger", mode: arMode });
    toast.success(`Opening QR payment for ${est.name}`, {
      action: { label: "Pay Now", onClick: () => window.location.assign(`/wallet?pay=${est.walletId}`) },
    });
  }, [arMode, recordInteraction]);

  useEffect(() => { return () => { engineRef.current?.dispose(); }; }, []);
  useEffect(() => { requestLocation(); }, [requestLocation]);

  const establishments = nearbyQuery.data?.establishments ?? [];

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">
      {/* ── AR Viewport ── */}
      {isActive && (
        <div className="absolute inset-0 z-0">
          {viewMode === "webxr" && <canvas ref={canvasRef} className="w-full h-full" onClick={handleCanvasTap} />}
          {viewMode === "camera_2d" && (
            <>
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
              <div id="ar-overlay-root" className="absolute inset-0 pointer-events-none">
                {cardPositions.map((est) => (
                  <ARCard key={est.id} establishment={est} onClick={setSelectedEstablishment}
                    style={{ left: `${est.screenX}%`, top: `${est.screenY}%` }} />
                ))}
              </div>
            </>
          )}
          {viewMode === "map_2d" && (
            <div className="w-full h-full bg-slate-950">
              <div className="absolute inset-0 p-4 overflow-y-auto pt-20">
                <div className="grid grid-cols-1 gap-3 max-w-lg mx-auto">
                  {establishments.map((est) => (
                    <div key={est.id}
                      className="bg-slate-900/90 rounded-xl border border-primary/30 p-3 cursor-pointer hover:border-primary/60 transition-colors"
                      onClick={() => setSelectedEstablishment(est)}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-white text-sm">{est.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{est.category} · {est.distanceM}m</p>
                        </div>
                        {est.acceptsQRPay && <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Landing / Idle State ── */}
      {!isActive && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-slate-950 to-black">
          <div className="w-full max-w-md space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 mb-4">
                <Camera className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-white">AR Tourism</h1>
              <p className="text-slate-400 text-sm mt-2">
                Point your camera at the world to discover nearby establishments, heritage sites, and payment opportunities.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <p className="text-xl font-bold text-primary">{arStatsQuery.data?.arEnabled ?? "—"}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">AR Spots</p>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <p className="text-xl font-bold text-emerald-400">{arStatsQuery.data?.withQRPay ?? "—"}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">QR Pay</p>
              </div>
              <div className="bg-slate-900 rounded-xl p-3 text-center border border-slate-800">
                <p className="text-xl font-bold text-purple-400">{arStatsQuery.data?.heritage ?? "—"}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Heritage</p>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">AR Mode</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: "location" as const, label: "Nearby", icon: Navigation, desc: "All establishments" },
                  { id: "heritage" as const, label: "Heritage", icon: Landmark, desc: "Cultural sites" },
                  { id: "marker" as const, label: "Scan QR", icon: QrCode, desc: "Scan to pay" },
                ]).map(({ id, label, icon: Icon, desc }) => (
                  <button key={id} onClick={() => setARMode(id)}
                    className={cn("flex flex-col items-center gap-1 p-3 rounded-xl border text-center transition-all",
                      arMode === id ? "bg-primary/10 border-primary text-primary" : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500")}>
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-medium">{label}</span>
                    <span className="text-[9px] opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={cn("flex items-center gap-2 rounded-lg p-3 text-sm",
              userLocation ? "bg-emerald-950/50 border border-emerald-500/30 text-emerald-300"
                : "bg-amber-950/50 border border-amber-500/30 text-amber-300")}>
              {userLocation ? (
                <><Wifi className="w-4 h-4 shrink-0" /><span>GPS ready · {userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}</span></>
              ) : (
                <><WifiOff className="w-4 h-4 shrink-0" /><span>{locationError ?? "Requesting GPS location…"}</span></>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={webxrSupported ? "default" : "secondary"} className="gap-1">
                <Layers className="w-3 h-3" />
                {webxrSupported ? "WebXR AR Available" : "Camera 2D Mode"}
              </Badge>
              {!webxrSupported && <span className="text-xs text-slate-500">WebXR requires Chrome on Android or Safari 17+ on iOS</span>}
            </div>
            <Button size="lg" className="w-full gap-2 h-12 text-base" onClick={startAR}
              disabled={arStatus === "starting" || arStatus === "requesting_permission"}>
              {arStatus === "starting" || arStatus === "requesting_permission"
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Camera className="w-5 h-5" />}
              {arStatus === "requesting_permission" ? "Requesting camera…"
                : arStatus === "starting" ? "Starting AR…"
                : `Launch ${arMode === "heritage" ? "Heritage" : arMode === "marker" ? "QR Scanner" : "Location"} AR`}
            </Button>
          </div>
        </div>
      )}

      {/* ── Active AR HUD ── */}
      {isActive && (
        <>
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full",
                arStatus === "active" || arStatus === "fallback_2d" ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
              <span className="text-white text-sm font-medium">
                {arMode === "heritage" ? "Heritage AR" : arMode === "marker" ? "QR Scanner" : "Location AR"}
              </span>
              {nearbyQuery.isLoading && <Loader2 className="w-3 h-3 text-white animate-spin" />}
            </div>
            <Button variant="ghost" size="icon" onClick={stopAR} className="text-white bg-black/30 rounded-full h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
                <MapPin className="w-3.5 h-3.5 text-primary" />
                <span className="text-white text-xs">{establishments.length} {arMode === "heritage" ? "heritage sites" : "establishments"} nearby</span>
              </div>
              <div className="flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5">
                <Navigation className="w-3.5 h-3.5 text-primary" />
                <span className="text-white text-xs">{userLocation ? `${userLocation.lat.toFixed(3)}, ${userLocation.lng.toFixed(3)}` : "No GPS"}</span>
              </div>
            </div>
            <div className="flex gap-2">
              {(["location", "heritage", "marker"] as const).map((mode) => (
                <button key={mode} onClick={() => setARMode(mode)}
                  className={cn("flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    arMode === mode ? "bg-primary text-white" : "bg-black/50 text-slate-300 hover:bg-black/70")}>
                  {mode === "location" ? "📍 Nearby" : mode === "heritage" ? "🏛️ Heritage" : "📷 Scan"}
                </button>
              ))}
            </div>
          </div>
          {establishments.length > 0 && viewMode !== "webxr" && (
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-20">
              <div className="bg-black/60 rounded-full px-3 py-1.5 flex items-center gap-1.5">
                <Info className="w-3 h-3 text-slate-300" />
                <span className="text-xs text-slate-300">Tap a card to pay or learn more</span>
              </div>
            </div>
          )}
          {nearbyQuery.isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 rounded-xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-white text-sm">Scanning nearby…</span>
              </div>
            </div>
          )}
          {!nearbyQuery.isLoading && establishments.length === 0 && isActive && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div className="bg-black/70 rounded-xl px-5 py-4 text-center max-w-xs">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-white text-sm font-medium">No establishments found</p>
                <p className="text-slate-400 text-xs mt-1">Move to a different location or expand the search radius</p>
              </div>
            </div>
          )}
        </>
      )}

      <PaymentModal establishment={selectedEstablishment} onClose={() => setSelectedEstablishment(null)} onPay={handleQRPayment} />
    </div>
  );
}
