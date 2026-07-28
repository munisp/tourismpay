/**
 * J20 — Full Tourist Lifecycle: Arrive → Pay → Earn → Redeem → Depart
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Globe, CheckCircle, Loader2, Wallet, Star, Hotel, FileText, Shield } from "lucide-react";

const COUNTRIES = ["US", "GB", "CA", "AU", "DE", "FR", "JP", "CN", "IN", "BR", "ZA", "GH", "KE"];

export default function FullTouristLifecycle() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    passportCountry: "US", destination: "", hotelId: "",
    checkIn: "", checkOut: "", budgetNgn: "500000",
    insuranceCoverage: "standard" as "basic" | "standard" | "comprehensive",
  });
  const [result, setResult] = useState<any>(null);

  const summary = trpc.journeyV2.getTouristLifecycleSummary.useQuery(undefined, { enabled: !!user?.id });

  const startMut = trpc.journeyV2.startFullTouristLifecycle.useMutation({
    onSuccess: (d) => {
      toast.success("Welcome to Nigeria! 🇳🇬", { description: d.message });
      setResult(d);
      summary.refetch();
    },
    onError: (e) => toast.error("Journey failed", { description: e.message }),
  });

  const tierColor = (t: string) => ({ gold: "bg-yellow-100 text-yellow-800", silver: "bg-gray-100 text-gray-800", bronze: "bg-orange-100 text-orange-800" }[t] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Full Tourist Lifecycle</h1>
          <p className="text-gray-500 mt-1">Complete journey: e-Visa → Insurance → AI Itinerary → Hotel → Loyalty → Depart</p>
        </div>
        <Globe className="w-8 h-8 text-blue-600" />
      </div>

      {/* Summary Cards */}
      {summary.data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { icon: Wallet, label: "Balance", value: `₦${Number(summary.data.walletBalance).toLocaleString()}`, color: "text-green-600" },
            { icon: Star, label: "Loyalty Pts", value: summary.data.loyaltyPoints.toLocaleString(), color: "text-yellow-600" },
            { icon: Hotel, label: "Bookings", value: summary.data.bookingCount, color: "text-blue-600" },
            { icon: Shield, label: "Policies", value: summary.data.activePolicies, color: "text-purple-600" },
            { icon: FileText, label: "Visas", value: summary.data.visaCount, color: "text-orange-600" },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-3 text-center">
                <Icon className={`w-5 h-5 mx-auto mb-1 ${color}`} />
                <p className="text-xs text-gray-500">{label}</p>
                <p className="font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Result */}
      {result && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-green-900">Lifecycle Complete! Welcome to Nigeria! 🇳🇬</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-sm text-green-700">
                  <p>Visa: {result.visaRef}</p>
                  <p>Booking: {result.bookingRef}</p>
                  <p>Policy: {result.policyId}</p>
                  <p>Itinerary: {result.itineraryId}</p>
                  <p>Loyalty: {result.loyaltyPoints} pts</p>
                  <p>Balance: ₦{Number(result.walletBalance).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journey Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" /> Start Your Journey
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Passport Country *</Label>
              <Select value={form.passportCountry} onValueChange={v => setForm(f => ({...f, passportCountry: v}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Destination *</Label><Input value={form.destination} onChange={e => setForm(f => ({...f, destination: e.target.value}))} placeholder="Lagos, Nigeria" /></div>
            <div><Label>Hotel ID *</Label><Input value={form.hotelId} onChange={e => setForm(f => ({...f, hotelId: e.target.value}))} placeholder="hotel_123" /></div>
            <div><Label>Budget (NGN)</Label><Input type="number" value={form.budgetNgn} onChange={e => setForm(f => ({...f, budgetNgn: e.target.value}))} /></div>
            <div><Label>Check-In *</Label><Input type="date" value={form.checkIn} onChange={e => setForm(f => ({...f, checkIn: e.target.value}))} /></div>
            <div><Label>Check-Out *</Label><Input type="date" value={form.checkOut} onChange={e => setForm(f => ({...f, checkOut: e.target.value}))} /></div>
            <div className="md:col-span-2">
              <Label>Insurance Coverage</Label>
              <Select value={form.insuranceCoverage} onValueChange={v => setForm(f => ({...f, insuranceCoverage: v as any}))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic (₦5,000)</SelectItem>
                  <SelectItem value="standard">Standard (₦10,000)</SelectItem>
                  <SelectItem value="comprehensive">Comprehensive (₦25,000)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
            <strong>This journey includes:</strong> e-Visa application · Travel insurance · AI itinerary generation · Hotel booking · Loyalty points earning
          </div>
          <Button onClick={() => startMut.mutate({ passportCountry: form.passportCountry, destination: form.destination, hotelId: form.hotelId, checkIn: form.checkIn, checkOut: form.checkOut, budgetNgn: parseFloat(form.budgetNgn), insuranceCoverage: form.insuranceCoverage })} disabled={startMut.isPending || !form.destination || !form.hotelId || !form.checkIn || !form.checkOut} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3">
            {startMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up your journey...</> : "🇳🇬 Start Full Tourist Lifecycle"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
