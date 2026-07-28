/**
 * J17 — Geospatial Agent Territory Assignment
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Users, CheckCircle, Loader2 } from "lucide-react";

export default function AgentTerritoryAssignment() {
  const [form, setForm] = useState({ agentId: "", city: "", centerLat: "6.5244", centerLng: "3.3792", radiusKm: "10", agentType: "field_agent" as "field_agent" | "senior_agent" | "regional_manager" });
  const [result, setResult] = useState<any>(null);

  const assignMut = trpc.journeyV2.startAgentTerritoryAssignment.useMutation({
    onSuccess: (d) => { toast.success("Territory Assigned!", { description: d.message }); setResult(d); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Agent Territory Assignment</h1><p className="text-gray-500 mt-1">Assign geospatial territories to field agents</p></div>
        <div className="flex gap-2"><MapPin className="w-7 h-7 text-red-600" /><Users className="w-7 h-7 text-blue-600" /></div>
      </div>

      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex gap-3">
            <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-green-900">Territory Assigned!</p>
              <p className="text-sm text-green-700">Territory ID: {result.territoryId}</p>
              <p className="text-sm text-green-700">{result.establishmentsInTerritory} establishments in territory</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Territory Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Agent ID *</Label><Input value={form.agentId} onChange={e => setForm(f => ({...f, agentId: e.target.value}))} placeholder="agent_123" /></div>
            <div>
              <Label>Agent Type</Label>
              <Select value={form.agentType} onValueChange={v => setForm(f => ({...f, agentType: v as any}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="field_agent">Field Agent</SelectItem>
                  <SelectItem value="senior_agent">Senior Agent</SelectItem>
                  <SelectItem value="regional_manager">Regional Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>City *</Label><Input value={form.city} onChange={e => setForm(f => ({...f, city: e.target.value}))} placeholder="Lagos" /></div>
            <div><Label>Radius (km)</Label><Input type="number" value={form.radiusKm} onChange={e => setForm(f => ({...f, radiusKm: e.target.value}))} /></div>
            <div><Label>Center Latitude</Label><Input type="number" step="0.0001" value={form.centerLat} onChange={e => setForm(f => ({...f, centerLat: e.target.value}))} /></div>
            <div><Label>Center Longitude</Label><Input type="number" step="0.0001" value={form.centerLng} onChange={e => setForm(f => ({...f, centerLng: e.target.value}))} /></div>
          </div>
          <Button onClick={() => assignMut.mutate({ agentId: form.agentId, city: form.city, centerLat: parseFloat(form.centerLat), centerLng: parseFloat(form.centerLng), radiusKm: parseFloat(form.radiusKm), agentType: form.agentType })} disabled={assignMut.isPending || !form.agentId || !form.city} className="w-full">
            {assignMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Assigning...</> : "Assign Territory"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
