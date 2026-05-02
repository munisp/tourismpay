/**
 * InstallPrompt — PWA "Add to Home Screen" banner
 *
 * Shows a dismissible install prompt to tourists and merchants.
 * Uses the beforeinstallprompt event on Android/Chrome.
 * On iOS it shows manual instructions since the event is not supported.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Smartphone } from "lucide-react";
import { useRole } from "@/hooks/useRole";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const { role } = useRole();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // Only show for tourist and merchant roles
  const isTargetRole = role === "tourist" || role === "merchant";

  useEffect(() => {
    if (!isTargetRole) return;

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    setIsIOS(ios);

    // Check if dismissed recently
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      // Don't show again for 7 days
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    if (ios) {
      // Show iOS instructions after a short delay
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // Listen for the Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isTargetRole]);

  if (!isTargetRole || isInstalled || !showBanner) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    }
    setShowBanner(false);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    setShowBanner(false);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl p-4 flex gap-3 items-start">
        {/* Icon */}
        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-emerald-500" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Install TourismPay</p>
          {isIOS ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap <span className="font-medium text-foreground">Share</span> then{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span> for the best experience.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for faster access and offline support.
            </p>
          )}

          {!isIOS && (
            <Button
              size="sm"
              className="mt-2 h-7 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={handleInstall}
            >
              <Download className="w-3 h-3 mr-1" />
              Install
            </Button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          aria-label="Dismiss install prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
