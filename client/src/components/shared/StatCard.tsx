import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "green" | "amber" | "crimson" | "blue" | "muted";
  icon?: React.ElementType;
  className?: string;
  animationDelay?: number;
}

export default function StatCard({
  label, value, unit, trend, trendValue, color = "muted", icon: Icon, className, animationDelay = 0
}: StatCardProps) {
  const colorMap = {
    green: "text-[oklch(0.78_0.22_152)]",
    amber: "text-[oklch(0.82_0.18_75)]",
    crimson: "text-[oklch(0.62_0.22_25)]",
    blue: "text-[oklch(0.65_0.18_230)]",
    muted: "text-foreground",
  };
  const glowMap = {
    green: "glow-green",
    amber: "glow-amber",
    crimson: "glow-crimson",
    blue: "glow-blue",
    muted: "",
  };

  return (
    <div
      className={cn(
        "glass-card p-4 animate-fade-in-up opacity-0",
        className
      )}
      style={{ animationDelay: `${animationDelay}ms`, animationFillMode: "forwards" }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        {Icon && (
          <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", `bg-${color === "muted" ? "white/5" : color + "/10"}`)}>
            <Icon className={cn("w-3.5 h-3.5", colorMap[color])} />
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <span className={cn("font-mono text-2xl font-bold tracking-tight", colorMap[color])}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground mb-0.5">{unit}</span>}
      </div>
      {(trend || trendValue) && (
        <div className="flex items-center gap-1 mt-2">
          {trend === "up" && <TrendingUp className="w-3 h-3 text-[oklch(0.78_0.22_152)]" />}
          {trend === "down" && <TrendingDown className="w-3 h-3 text-[oklch(0.62_0.22_25)]" />}
          {trend === "neutral" && <Minus className="w-3 h-3 text-muted-foreground" />}
          {trendValue && (
            <span className={cn(
              "text-[10px] font-mono",
              trend === "up" ? "text-[oklch(0.78_0.22_152)]" :
              trend === "down" ? "text-[oklch(0.62_0.22_25)]" :
              "text-muted-foreground"
            )}>{trendValue}</span>
          )}
        </div>
      )}
    </div>
  );
}
