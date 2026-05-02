import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Settings, Clock, AlertTriangle, CheckCircle2, RefreshCw, Save } from "lucide-react";

const RISK_LEVELS = [
  { key: "low", label: "Low Risk", color: "text-green-400", bgColor: "bg-green-400/10 border-green-400/20", description: "Standard investigations with minimal urgency" },
  { key: "medium", label: "Medium Risk", color: "text-yellow-400", bgColor: "bg-yellow-400/10 border-yellow-400/20", description: "Investigations requiring timely attention" },
  { key: "high", label: "High Risk", color: "text-orange-400", bgColor: "bg-orange-400/10 border-orange-400/20", description: "Priority investigations needing rapid response" },
  { key: "critical", label: "Critical Risk", color: "text-red-400", bgColor: "bg-red-400/10 border-red-400/20", description: "Emergency investigations requiring immediate action" },
] as const;

type RiskLevel = typeof RISK_LEVELS[number]["key"];

export default function BISSettings() {
  const [editValues, setEditValues] = useState<Partial<Record<RiskLevel, string>>>({});
  const [saving, setSaving] = useState(false);

  const { data: slaData, isLoading, refetch } = trpc.bis.getSlaConfig.useQuery();
  const updateSlaConfig = trpc.bis.updateSlaConfig.useMutation({
    onSuccess: (data) => {
      toast.success("SLA configuration updated", {
        description: `New SLA hours: Low=${data.config.low}h, Medium=${data.config.medium}h, High=${data.config.high}h, Critical=${data.config.critical}h`,
      });
      setEditValues({});
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to update SLA config", { description: err.message });
    },
  });

  const { data: statsData, isLoading: statsLoading } = trpc.bis.getSlaStats.useQuery();

  const currentConfig = slaData?.config;
  const defaults = slaData?.defaults;

  const handleSave = async () => {
    if (Object.keys(editValues).length === 0) return;
    setSaving(true);
    const updates: Partial<Record<RiskLevel, number>> = {};
    for (const [key, val] of Object.entries(editValues)) {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) {
        updates[key as RiskLevel] = n;
      }
    }
    try {
      await updateSlaConfig.mutateAsync(updates);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!defaults) return;
    setSaving(true);
    try {
      await updateSlaConfig.mutateAsync(defaults);
      toast.success("SLA config reset to defaults");
    } finally {
      setSaving(false);
    }
  };

  const getDisplayValue = (key: RiskLevel): string => {
    if (editValues[key] !== undefined) return editValues[key]!;
    return String(currentConfig?.[key] ?? "");
  };

  const hasChanges = Object.keys(editValues).length > 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            BIS Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure SLA hours per risk level for Background Investigation Service investigations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={saving || isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* SLA Compliance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Active", value: statsData?.total ?? 0, icon: Clock, color: "text-blue-400" },
          { label: "On Time", value: statsData?.onTime ?? 0, icon: CheckCircle2, color: "text-green-400" },
          { label: "Overdue", value: statsData?.overdue ?? 0, icon: AlertTriangle, color: "text-red-400" },
          { label: "Compliance Rate", value: statsLoading ? "—" : `${100 - (statsData?.overdueRate ?? 0)}%`, icon: CheckCircle2, color: "text-primary" },
        ].map((stat) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{statsLoading ? "—" : stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SLA Configuration */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            SLA Hours by Risk Level
          </CardTitle>
          <CardDescription>
            Set the maximum hours allowed to resolve an investigation before it is marked as overdue.
            Valid range: 1–720 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {RISK_LEVELS.map((r) => (
                <div key={r.key} className="h-20 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {RISK_LEVELS.map((risk) => {
                const displayVal = getDisplayValue(risk.key);
                const isEdited = editValues[risk.key] !== undefined;
                const defaultHours = defaults?.[risk.key];
                return (
                  <div key={risk.key} className={`flex items-center justify-between p-4 rounded-lg border ${risk.bgColor}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold ${risk.color}`}>{risk.label}</span>
                        {isEdited && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary text-primary">
                            Modified
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{risk.description}</p>
                      {defaultHours !== undefined && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Default: {defaultHours}h</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={720}
                          value={displayVal}
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [risk.key]: e.target.value }))}
                          className="w-24 h-8 text-sm text-right bg-background/50"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">hours</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasChanges && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm text-primary">
                      You have unsaved changes to {Object.keys(editValues).length} SLA setting{Object.keys(editValues).length > 1 ? "s" : ""}.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditValues({})}>
                        Discard
                      </Button>
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save All"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">How SLA Tracking Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>When a new investigation is created, a <strong className="text-foreground">due date</strong> is automatically calculated based on the investigation's risk level and the SLA hours configured here.</p>
          <p>Investigations that have not been resolved by their due date are marked as <strong className="text-red-400">OVERDUE</strong> with a red badge in the Investigations table.</p>
          <p>The SLA compliance rate on the BIS Dashboard reflects the percentage of active investigations that are still within their SLA window.</p>
        </CardContent>
      </Card>
    </div>
  );
}
