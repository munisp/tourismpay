import { cn } from "@/lib/utils";

interface RiskRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
}

function getRiskColor(score: number): string {
  if (score <= 30) return "oklch(0.78 0.22 152)";   // green
  if (score <= 60) return "oklch(0.82 0.18 75)";    // amber
  if (score <= 80) return "oklch(0.62 0.22 25)";    // crimson
  return "oklch(0.55 0.25 25)";                      // deep red
}

function getRiskLabel(score: number): string {
  if (score <= 30) return "LOW";
  if (score <= 60) return "MEDIUM";
  if (score <= 80) return "HIGH";
  return "CRITICAL";
}

export default function RiskRing({ score, size = 80, strokeWidth = 6, className, showLabel = true }: RiskRingProps) {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getRiskColor(score);
  const label = getRiskLabel(score);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="oklch(1 0 0 / 8%)"
            strokeWidth={strokeWidth}
          />
          {/* Score arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="risk-ring"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        {/* Center score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-bold text-foreground" style={{ fontSize: size * 0.22 }}>
            {score}
          </span>
        </div>
      </div>
      {showLabel && (
        <span className="text-[10px] font-mono font-semibold" style={{ color }}>
          {label}
        </span>
      )}
    </div>
  );
}
