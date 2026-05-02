/**
 * BIS Module Result Editor
 * Admin-only panel for overriding individual module risk scores and adding analyst notes.
 */

import { useState } from "react";
import { Shield, AlertTriangle, CheckCircle, HelpCircle, Loader2, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleStatus = "clear" | "flagged" | "inconclusive" | "pending";

interface ModuleResult {
  score: number;
  status: ModuleStatus;
  summary?: string;
  findings?: string[];
  analystOverride?: boolean;
}

interface ModuleEditorState {
  score: number;
  status: ModuleStatus;
  summary: string;
  analystOverride: boolean;
}

const MODULE_KEYS = ["identity", "criminal", "financial", "sanctions", "pep", "adverse_media"] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

const MODULE_LABELS: Record<ModuleKey, string> = {
  identity: "Identity Verification",
  criminal: "Criminal Record",
  financial: "Financial Risk",
  sanctions: "Sanctions Screening",
  pep: "PEP Check",
  adverse_media: "Adverse Media",
};

const MODULE_ICONS: Record<ModuleKey, React.ElementType> = {
  identity: Shield,
  criminal: AlertTriangle,
  financial: Shield,
  sanctions: AlertTriangle,
  pep: Shield,
  adverse_media: AlertTriangle,
};

const STATUS_OPTIONS: { value: ModuleStatus; label: string; color: string }[] = [
  { value: "clear", label: "Clear", color: "text-emerald-400" },
  { value: "flagged", label: "Flagged", color: "text-red-400" },
  { value: "inconclusive", label: "Inconclusive", color: "text-amber-400" },
  { value: "pending", label: "Pending", color: "text-zinc-400" },
];

const STATUS_ICONS: Record<ModuleStatus, React.ElementType> = {
  clear: CheckCircle,
  flagged: AlertTriangle,
  inconclusive: HelpCircle,
  pending: Loader2,
};

// ─── Single Module Row ────────────────────────────────────────────────────────

function ModuleRow({
  moduleKey,
  current,
  edited,
  onChange,
}: {
  moduleKey: ModuleKey;
  current: ModuleResult | undefined;
  edited: ModuleEditorState;
  onChange: (key: ModuleKey, update: Partial<ModuleEditorState>) => void;
}) {
  const Icon = MODULE_ICONS[moduleKey];
  const StatusIcon = STATUS_ICONS[edited.status];
  const isDirty =
    edited.score !== (current?.score ?? 0) ||
    edited.status !== (current?.status ?? "pending") ||
    edited.summary !== (current?.summary ?? "") ||
    edited.analystOverride !== (current?.analystOverride ?? false);

  return (
    <div className={cn(
      "p-4 rounded-lg border transition-colors",
      isDirty ? "border-primary/40 bg-primary/5" : "border-border/30 bg-white/2"
    )}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground">{MODULE_LABELS[moduleKey]}</span>
        {isDirty && (
          <span className="ml-auto text-[9px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/30">
            MODIFIED
          </span>
        )}
        {edited.analystOverride && (
          <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
            OVERRIDE
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Score slider */}
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 block">
            Risk Score: <span className="text-foreground font-mono font-bold">{edited.score}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={edited.score}
            onChange={(e) => onChange(moduleKey, { score: Number(e.target.value) })}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, oklch(0.55 0.25 25) 0%, oklch(0.82 0.18 75) 50%, oklch(0.78 0.22 152) 100%)`,
            }}
          />
          <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
            <span>0 Low</span>
            <span>100 Critical</span>
          </div>
        </div>

        {/* Status select */}
        <div>
          <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 block">
            Status
          </label>
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map((opt) => {
              const SIcon = STATUS_ICONS[opt.value];
              return (
                <button
                  key={opt.value}
                  onClick={() => onChange(moduleKey, { status: opt.value })}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium border transition-colors",
                    edited.status === opt.value
                      ? `${opt.color} bg-white/10 border-current`
                      : "text-muted-foreground border-border/30 hover:border-border/60"
                  )}
                >
                  <SIcon className="w-2.5 h-2.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-3">
        <label className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 block">
          Summary (optional)
        </label>
        <textarea
          value={edited.summary}
          onChange={(e) => onChange(moduleKey, { summary: e.target.value })}
          placeholder="Brief summary of findings..."
          rows={2}
          className="w-full bg-white/5 border border-border/40 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
        />
      </div>

      {/* Analyst override toggle */}
      <div className="flex items-center gap-2 mt-2">
        <input
          type="checkbox"
          id={`override-${moduleKey}`}
          checked={edited.analystOverride}
          onChange={(e) => onChange(moduleKey, { analystOverride: e.target.checked })}
          className="w-3 h-3 rounded"
        />
        <label htmlFor={`override-${moduleKey}`} className="text-[10px] text-muted-foreground cursor-pointer">
          Mark as analyst override
        </label>
      </div>
    </div>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

interface BISModuleEditorProps {
  investigationId: number;
  referenceId: string;
  currentModuleResults: Record<string, unknown>;
  onSaved?: () => void;
}

export default function BISModuleEditor({
  investigationId,
  referenceId,
  currentModuleResults,
  onSaved,
}: BISModuleEditorProps) {
  // Initialize editor state from current module results
  const initState = (): Record<ModuleKey, ModuleEditorState> => {
    const state = {} as Record<ModuleKey, ModuleEditorState>;
    for (const key of MODULE_KEYS) {
      const cur = currentModuleResults[key] as ModuleResult | undefined;
      state[key] = {
        score: cur?.score ?? 0,
        status: cur?.status ?? "pending",
        summary: cur?.summary ?? "",
        analystOverride: cur?.analystOverride ?? false,
      };
    }
    return state;
  };

  const [edits, setEdits] = useState<Record<ModuleKey, ModuleEditorState>>(initState);
  const [analystNotes, setAnalystNotes] = useState("");

  const handleChange = (key: ModuleKey, update: Partial<ModuleEditorState>) => {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...update } }));
  };

  const handleReset = () => {
    setEdits(initState());
    setAnalystNotes("");
  };

  const updateMutation = trpc.bisModuleEditor.updateModuleResults.useMutation({
    onSuccess: (data) => {
      toast.success("Module results saved", {
        description: `New risk score: ${data.investigation?.riskScore}/100 (${data.investigation?.riskLevel})`,
      });
      onSaved?.();
    },
    onError: (err) => {
      toast.error("Save failed", { description: err.message });
    },
  });

  const handleSave = () => {
    // Build modules object — only include modules that have been modified
    const modules: Record<string, unknown> = {};
    for (const key of MODULE_KEYS) {
      const cur = currentModuleResults[key] as ModuleResult | undefined;
      const ed = edits[key];
      const isDirty =
        ed.score !== (cur?.score ?? 0) ||
        ed.status !== (cur?.status ?? "pending") ||
        ed.summary !== (cur?.summary ?? "") ||
        ed.analystOverride !== (cur?.analystOverride ?? false);

      if (isDirty) {
        modules[key] = {
          score: ed.score,
          status: ed.status,
          summary: ed.summary || undefined,
          findings: (cur?.findings ?? []),
          analystOverride: ed.analystOverride,
        };
      }
    }

    if (Object.keys(modules).length === 0 && !analystNotes) {
      toast.info("No changes to save");
      return;
    }

    updateMutation.mutate({
      investigationId,
      modules: modules as Parameters<typeof updateMutation.mutate>[0]["modules"],
      analystNotes: analystNotes || undefined,
    });
  };

  const dirtyCount = MODULE_KEYS.filter((key) => {
    const cur = currentModuleResults[key] as ModuleResult | undefined;
    const ed = edits[key];
    return (
      ed.score !== (cur?.score ?? 0) ||
      ed.status !== (cur?.status ?? "pending") ||
      ed.summary !== (cur?.summary ?? "") ||
      ed.analystOverride !== (cur?.analystOverride ?? false)
    );
  }).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Module Result Editor
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {referenceId} · Admin override mode
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-1 rounded border border-primary/30">
              {dirtyCount} module{dirtyCount !== 1 ? "s" : ""} modified
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] gap-1.5"
            onClick={handleReset}
            disabled={updateMutation.isPending}
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </Button>
          <Button
            size="sm"
            className="h-7 text-[10px] gap-1.5"
            onClick={handleSave}
            disabled={updateMutation.isPending || (dirtyCount === 0 && !analystNotes)}
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Save className="w-3 h-3" />
            )}
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-amber-300 leading-relaxed">
          Changes made here will override the automated investigation results and recalculate the overall risk score. All edits are logged in the audit trail.
        </p>
      </div>

      {/* Module rows */}
      <div className="space-y-3">
        {MODULE_KEYS.map((key) => (
          <ModuleRow
            key={key}
            moduleKey={key}
            current={currentModuleResults[key] as ModuleResult | undefined}
            edited={edits[key]}
            onChange={handleChange}
          />
        ))}
      </div>

      {/* Analyst notes */}
      <div>
        <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">
          Analyst Notes
        </label>
        <textarea
          value={analystNotes}
          onChange={(e) => setAnalystNotes(e.target.value)}
          placeholder="Add overall analyst notes or recommendations (will be appended to investigation recommendations)..."
          rows={4}
          className="w-full bg-white/5 border border-border/40 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
        />
      </div>
    </div>
  );
}
