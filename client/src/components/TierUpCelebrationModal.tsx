/**
 * TierUpCelebrationModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen animated celebration overlay that fires when a user's loyalty
 * tier advances (e.g. BRONZE → SILVER).
 *
 * Guard: each upgrade is stored in localStorage under the key
 * `tp_tier_celebrated_<userId>_<newTier>` so the modal only shows once per
 * tier advance, even across page reloads.
 *
 * Usage:
 *   <TierUpCelebrationModal userId={user.id} currentTier={acct.tier} />
 *
 * The component subscribes to the loyalty.account query; when the tier
 * changes and the localStorage guard is absent it shows the modal.
 */

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { X, Trophy, Star, Sparkles, ChevronRight, Share2, Loader2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── Tier config ──────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  icon: string;
  perks: string[];
}> = {
  SILVER: {
    label: "Silver",
    color: "text-slate-300",
    bg: "bg-slate-400/10",
    border: "border-slate-400/30",
    glow: "shadow-[0_0_40px_rgba(148,163,184,0.3)]",
    icon: "🥈",
    perks: ["1.5× points multiplier", "Priority customer support", "Exclusive Silver discounts"],
  },
  GOLD: {
    label: "Gold",
    color: "text-amber-300",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    glow: "shadow-[0_0_40px_rgba(251,191,36,0.3)]",
    icon: "🥇",
    perks: ["2× points multiplier", "Dedicated account manager", "Complimentary lounge access"],
  },
  PLATINUM: {
    label: "Platinum",
    color: "text-violet-300",
    bg: "bg-violet-400/10",
    border: "border-violet-400/30",
    glow: "shadow-[0_0_40px_rgba(167,139,250,0.4)]",
    icon: "💎",
    perks: ["3× points multiplier", "Personal concierge service", "Unlimited lounge access"],
  },
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getCelebratedKey(userId: string | number, tier: string) {
  return `tp_tier_celebrated_${userId}_${tier}`;
}

function hasCelebrated(userId: string | number, tier: string) {
  try {
    return localStorage.getItem(getCelebratedKey(userId, tier)) === "1";
  } catch {
    return false;
  }
}

function markCelebrated(userId: string | number, tier: string) {
  try {
    localStorage.setItem(getCelebratedKey(userId, tier), "1");
  } catch {
    // ignore storage errors
  }
}

// ─── Confetti helpers ─────────────────────────────────────────────────────────

function fireConfetti(tier: string) {
  const colors: Record<string, string[]> = {
    SILVER: ["#94a3b8", "#cbd5e1", "#e2e8f0", "#ffffff"],
    GOLD: ["#fbbf24", "#f59e0b", "#fde68a", "#ffffff"],
    PLATINUM: ["#a78bfa", "#8b5cf6", "#ddd6fe", "#ffffff"],
  };
  const palette = colors[tier] ?? colors.GOLD;

  // First burst — center
  confetti({
    particleCount: 120,
    spread: 80,
    origin: { x: 0.5, y: 0.45 },
    colors: palette,
    startVelocity: 45,
    gravity: 0.9,
    ticks: 250,
  });

  // Side cannons
  setTimeout(() => {
    confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: palette });
    confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: palette });
  }, 200);

  // Trailing sparkle
  setTimeout(() => {
    confetti({
      particleCount: 40,
      spread: 100,
      origin: { x: 0.5, y: 0.3 },
      colors: palette,
      shapes: ["circle"],
      scalar: 0.6,
    });
  }, 500);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  userId: string | number;
  /** Pass the user's current tier from the loyalty.account query */
  currentTier: string;
  /** Optional: the user's display name for the share card. Defaults to "TourismPay Member" */
  userName?: string;
}
export default function TierUpCelebrationModal({ userId, currentTier, userName }: Props) {
  const [visible, setVisible] = useState(false);
  const [celebratingTier, setCelebratingTier] = useState<string | null>(null);
  const prevTierRef = useRef<string | null>(null);
  const firedRef = useRef(false);

  // Detect tier change
  useEffect(() => {
    const upgradeTiers = ["SILVER", "GOLD", "PLATINUM"];
    const isUpgrade =
      prevTierRef.current !== null &&
      prevTierRef.current !== currentTier &&
      upgradeTiers.includes(currentTier) &&
      upgradeTiers.indexOf(currentTier) > upgradeTiers.indexOf(prevTierRef.current ?? "");

    if (isUpgrade && !hasCelebrated(userId, currentTier)) {
      setCelebratingTier(currentTier);
      setVisible(true);
      markCelebrated(userId, currentTier);
      firedRef.current = false;
    }

    prevTierRef.current = currentTier;
  }, [currentTier, userId]);

  // Also show on mount if the tier was just set and not yet celebrated
  // (handles the case where the page loads after an earn that triggered tier-up)
  useEffect(() => {
    const upgradeTiers = ["SILVER", "GOLD", "PLATINUM"];
    if (upgradeTiers.includes(currentTier) && !hasCelebrated(userId, currentTier)) {
      // Only auto-show if we have a stored "previous tier" in localStorage
      const prevKey = `tp_prev_tier_${userId}`;
      const storedPrev = localStorage.getItem(prevKey);
      if (storedPrev && storedPrev !== currentTier && upgradeTiers.indexOf(currentTier) > upgradeTiers.indexOf(storedPrev)) {
        setCelebratingTier(currentTier);
        setVisible(true);
        markCelebrated(userId, currentTier);
        firedRef.current = false;
      }
    }
    // Always update stored previous tier
    try { localStorage.setItem(`tp_prev_tier_${userId}`, currentTier); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire confetti when modal becomes visible
  useEffect(() => {
    if (visible && celebratingTier && !firedRef.current) {
      firedRef.current = true;
      // Small delay so the modal renders first
      setTimeout(() => fireConfetti(celebratingTier), 150);
    }
  }, [visible, celebratingTier]);

  const handleClose = () => {
    setVisible(false);
    setCelebratingTier(null);
  };

  // Share card generation
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const generateShareCardMut = trpc.loyalty.generateShareCard.useMutation({
    onSuccess: (data) => {
      if (data.imageUrl) {
        setShareCardUrl(data.imageUrl);
        window.open(data.imageUrl, "_blank", "noopener,noreferrer");
        toast.success("Share card generated! Use the Download button to save it.");
      }
    },
    onError: (err) => toast.error(`Failed to generate share card: ${err.message}`),
  });

  const handleShare = () => {
    if (!celebratingTier) return;
    setShareCardUrl(null);
    generateShareCardMut.mutate({
      tier: celebratingTier as "SILVER" | "GOLD" | "PLATINUM",
      userName: userName?.trim() || "TourismPay Member",
    });
  };

  const handleDownloadCard = async () => {
    if (!shareCardUrl) return;
    try {
      const res = await fetch(shareCardUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tourismpay-${celebratingTier?.toLowerCase() ?? "tier"}-achievement.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab if CORS prevents direct download
      window.open(shareCardUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (!visible || !celebratingTier) return null;

  const cfg = TIER_CONFIG[celebratingTier];
  if (!cfg) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className={cn(
          "relative w-full max-w-sm rounded-2xl border p-8 text-center",
          "bg-background/95",
          cfg.border,
          cfg.glow,
          "animate-scale-in"
        )}
        style={{
          animation: "scaleIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Tier badge */}
        <div className={cn(
          "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 text-4xl border-2",
          cfg.bg,
          cfg.border,
        )}>
          {cfg.icon}
        </div>

        {/* Headline */}
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Sparkles className={cn("w-4 h-4", cfg.color)} />
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Tier Upgrade
          </p>
          <Sparkles className={cn("w-4 h-4", cfg.color)} />
        </div>
        <h2
          className={cn("text-3xl font-black mb-1", cfg.color)}
          style={{ fontFamily: "Space Grotesk, sans-serif" }}
        >
          {cfg.label} Member
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Congratulations! You've unlocked exclusive {cfg.label} benefits.
        </p>

        {/* Perks */}
        <div className={cn("rounded-xl border p-4 mb-6 text-left space-y-2", cfg.bg, cfg.border)}>
          {cfg.perks.map((perk) => (
            <div key={perk} className="flex items-center gap-2">
              <Star className={cn("w-3.5 h-3.5 shrink-0", cfg.color)} />
              <span className="text-xs text-foreground">{perk}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs border-border"
              onClick={handleShare}
              disabled={generateShareCardMut.isPending}
            >
              {generateShareCardMut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
              )}
              {generateShareCardMut.isPending ? "Generating..." : "Share"}
            </Button>
            {shareCardUrl && (
              <Button
                variant="outline"
                className="h-9 px-3 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                onClick={handleDownloadCard}
                title="Download share card"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            )}
            {shareCardUrl && (
              <Button
                variant="outline"
                className="h-9 px-3 text-xs border-border hover:bg-white/5"
                onClick={() => { setShareCardUrl(null); handleShare(); }}
                disabled={generateShareCardMut.isPending}
                title="Generate a new share card image"
              >
                {generateShareCardMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
              </Button>
            )}
          </div>
          {/* Inline share card preview */}
          {shareCardUrl && (
            <div className="rounded-lg overflow-hidden border border-emerald-500/20 bg-black/30 relative group">
              <img
                src={shareCardUrl}
                alt="Your achievement share card"
                className="w-full h-auto max-h-40 object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={handleDownloadCard}
                  className="flex items-center gap-1 text-[10px] font-medium text-white bg-emerald-600/80 hover:bg-emerald-600 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download
                </button>
                <button
                  onClick={() => window.open(shareCardUrl, "_blank", "noopener,noreferrer")}
                  className="flex items-center gap-1 text-[10px] font-medium text-white bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-md transition-colors"
                >
                  <Share2 className="w-3 h-3" />
                  Open
                </button>
              </div>
              <p className="absolute bottom-1 left-2 text-[9px] text-white/60">Hover to save or open</p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-9 text-xs border-border"
              onClick={handleClose}
            >
              Close
            </Button>
            <Link href="/loyalty" onClick={handleClose} className="flex-1">
              <Button className="w-full h-9 text-xs">
                View Rewards
                <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Inline keyframe for scale-in animation */}
      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
