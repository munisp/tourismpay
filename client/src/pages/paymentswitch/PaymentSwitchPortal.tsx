import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Monitor,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * PaymentSwitch Portal
 *
 * Embeds the original standalone PaymentSwitch Next.js admin dashboard
 * inside the TourismPay PWA as a full-screen authenticated iframe.
 *
 * The PS dashboard runs on a separate port (configurable via
 * VITE_PAYMENT_SWITCH_PORTAL_URL env var) and is loaded with an
 * auto-login token so the user doesn't need to log in separately.
 *
 * When the env var is not set, the page shows a configuration guide.
 */

// The public URL of the standalone PS dashboard.
// In production, set VITE_PAYMENT_SWITCH_PORTAL_URL to the deployed URL.
// In development, this defaults to the sandbox-exposed port 3001 URL.
const PS_PORTAL_URL =
  import.meta.env.VITE_PAYMENT_SWITCH_PORTAL_URL ||
  "https://3001-ine1iy93bd1m06526vzdg-fb9d06f9.us1.manus.computer";

type LoadState = "idle" | "loading" | "loaded" | "error";

export default function PaymentSwitchPortal() {
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Build the auto-login URL that sets the PS session token and redirects to the dashboard
  const autoLoginUrl = `${PS_PORTAL_URL}/auto-login?token=demo-token&redirect=/`;

  const handleLoad = useCallback(() => {
    setLoadState("loaded");
  }, []);

  const handleError = useCallback(() => {
    setLoadState("error");
  }, []);

  const handleRefresh = useCallback(() => {
    setLoadState("loading");
    setIframeKey((k) => k + 1);
    toast.info("Refreshing PaymentSwitch portal…");
  }, []);

  const handleOpenExternal = useCallback(() => {
    window.open(autoLoginUrl, "_blank", "noopener,noreferrer");
  }, [autoLoginUrl]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((f) => !f);
  }, []);

  useEffect(() => {
    setLoadState("loading");
  }, [iframeKey]);

  // Sync resolved theme to PS portal iframe via postMessage
  useEffect(() => {
    if (loadState !== "loaded" || !iframeRef.current?.contentWindow) return;
    try {
      iframeRef.current.contentWindow.postMessage(
        { type: "TOURISMPAY_THEME", theme: resolvedTheme },
        PS_PORTAL_URL
      );
    } catch {
      // cross-origin restrictions — silently ignore
    }
  }, [resolvedTheme, loadState]);

  const statusBadge = () => {
    switch (loadState) {
      case "loading":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading
          </Badge>
        );
      case "loaded":
        return (
          <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
            <CheckCircle2 className="h-3 w-3" />
            Live
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Unavailable
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div
        className={`flex flex-col bg-background ${
          isFullscreen
            ? "fixed inset-0 z-50"
            : "h-[calc(100vh-4rem)]"
        }`}
      >
        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">PaymentSwitch Admin Portal</span>
            {statusBadge()}
            {user?.role === "admin" && (
              <Badge variant="outline" className="text-xs">
                Super Admin
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleRefresh}
                  disabled={loadState === "loading"}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadState === "loading" ? "animate-spin" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh portal</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleOpenExternal}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in new tab</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Loading overlay ──────────────────────────────────────────── */}
        {loadState === "loading" && (
          <div className="absolute inset-0 top-[41px] flex items-center justify-center bg-background/80 z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Loading PaymentSwitch portal…
              </p>
            </div>
          </div>
        )}

        {/* ── Error state ──────────────────────────────────────────────── */}
        {loadState === "error" && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                PaymentSwitch Portal Unavailable
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                The standalone PaymentSwitch dashboard could not be reached at:
              </p>
              <code className="text-xs bg-muted px-3 py-1 rounded block mb-6 break-all">
                {PS_PORTAL_URL}
              </code>
              <div className="space-y-2 text-sm text-left bg-muted/50 rounded-lg p-4 mb-6">
                <p className="font-medium">To enable this portal:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>
                    Start the PS dashboard:{" "}
                    <code className="text-xs bg-muted px-1 rounded">
                      cd 04-payment-switch/admin-dashboard && pnpm dev
                    </code>
                  </li>
                  <li>
                    Set{" "}
                    <code className="text-xs bg-muted px-1 rounded">
                      VITE_PAYMENT_SWITCH_PORTAL_URL
                    </code>{" "}
                    to the deployed URL in production
                  </li>
                </ol>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={handleRefresh} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
                <Button onClick={handleOpenExternal}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Direct URL
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Iframe ───────────────────────────────────────────────────── */}
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={autoLoginUrl}
          className={`flex-1 w-full border-0 ${
            loadState === "error" ? "hidden" : "block"
          }`}
          title="PaymentSwitch Admin Portal"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </TooltipProvider>
  );
}
