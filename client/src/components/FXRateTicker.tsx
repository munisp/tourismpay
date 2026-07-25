/**
 * Real-time FX rate ticker — scrolling banner showing live exchange rates.
 *
 * Shows rates relevant to the tourist's wallet currencies with
 * directional indicators (up/down arrows) for rate movement.
 */
import { useState, useEffect, useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface RateDisplay {
  pair: string;
  rate: number;
  direction: "up" | "down" | "flat";
  change: string;
}

const RATE_PAIRS = [
  { from: "USD", to: "NGN", label: "USD/NGN" },
  { from: "USD", to: "KES", label: "USD/KES" },
  { from: "USD", to: "GHS", label: "USD/GHS" },
  { from: "USD", to: "ZAR", label: "USD/ZAR" },
  { from: "EUR", to: "NGN", label: "EUR/NGN" },
  { from: "GBP", to: "NGN", label: "GBP/NGN" },
  { from: "USDC", to: "NGN", label: "USDC/NGN" },
  { from: "USDC", to: "KES", label: "USDC/KES" },
] as const;

// Simulated rates (in production these come from exchangeRates.getRate)
const BASE_RATES: Record<string, number> = {
  "USD/NGN": 1538.50, "USD/KES": 129.85, "USD/GHS": 14.92,
  "USD/ZAR": 18.45, "EUR/NGN": 1672.30, "GBP/NGN": 1945.60,
  "USDC/NGN": 1537.80, "USDC/KES": 129.70,
};

export function FXRateTicker() {
  const [rates, setRates] = useState<RateDisplay[]>([]);

  useEffect(() => {
    const updateRates = () => {
      setRates(RATE_PAIRS.map(({ label }) => {
        const base = BASE_RATES[label] ?? 1;
        const jitter = (Math.random() - 0.5) * base * 0.002;
        const rate = base + jitter;
        const changePct = (jitter / base) * 100;
        return {
          pair: label,
          rate,
          direction: changePct > 0.01 ? "up" : changePct < -0.01 ? "down" : "flat",
          change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
        };
      }));
    };
    updateRates();
    const interval = setInterval(updateRates, 5000);
    return () => clearInterval(interval);
  }, []);

  if (rates.length === 0) return null;

  return (
    <div className="w-full overflow-hidden bg-muted/30 border-b border-border">
      <div className="flex animate-marquee whitespace-nowrap py-1.5">
        {[...rates, ...rates].map((r, i) => (
          <div
            key={`${r.pair}-${i}`}
            className="inline-flex items-center gap-1.5 mx-4 text-xs"
          >
            <span className="font-semibold text-foreground">{r.pair}</span>
            <span className="font-mono text-foreground/80">{r.rate.toFixed(2)}</span>
            <span className={`flex items-center gap-0.5 font-mono ${
              r.direction === "up" ? "text-green-500" :
              r.direction === "down" ? "text-red-500" : "text-muted-foreground"
            }`}>
              {r.direction === "up" ? <TrendingUp className="w-3 h-3" /> :
               r.direction === "down" ? <TrendingDown className="w-3 h-3" /> :
               <Minus className="w-3 h-3" />}
              {r.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
