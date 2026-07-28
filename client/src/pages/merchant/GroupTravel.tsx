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
import { Users, Building2, Calculator, DollarSign } from "lucide-react";

export default function GroupTravel() {
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ group_name: "", organizer_email: "", event_type: "conference", pax_count: "20", rooms_required: "10", check_in: "", check_out: "", nights: "2", rate_per_room_per_night: "", currency: "NGN", attrition_pct: "20", notes: "" });

  const { data: bookings, isLoading, refetch } = trpc.groupTravel.hotelGroupBookings.useQuery(
    { hotelId: user?.id ?? "" },
    { enabled: !!user?.id }
  );

  const createMut = trpc.groupTravel.createGroupBooking.useMutation({
    onSuccess: (d) => { toast.success("Group Booking Created", { description: d.message }); setShowCreate(false); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const statusColor = (s: string) => ({ confirmed: "bg-green-100 text-green-800", draft: "bg-gray-100 text-gray-800", cancelled: "bg-red-100 text-red-800" }[s] ?? "bg-gray-100 text-gray-800");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Group Travel & MICE</h1><p className="text-gray-500 mt-1">Manage conferences, incentives, and group bookings</p></div>
        <Button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2"><Users className="w-4 h-4" />New Group Booking</Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle>Create Group Booking</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Group Name</Label><Input value={form.group_name} onChange={e => setForm(f => ({...f, group_name: e.target.value}))} placeholder="Acme Corp Annual Conference" /></div>
              <div><Label>Organizer Email</Label><Input type="email" value={form.organizer_email} onChange={e => setForm(f => ({...f, organizer_email: e.target.value}))} /></div>
              <div><Label>Event Type</Label>
                <Select value={form.event_type} onValueChange={v => setForm(f => ({...f, event_type: v}))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[["conference","Conference"],["incentive","Incentive Travel"],["meeting","Meeting"],["exhibition","Exhibition"],["wedding","Wedding"],["tour_group","Tour Group"]].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Pax Count</Label><Input type="number" value={form.pax_count} onChange={e => setForm(f => ({...f, pax_count: e.target.value}))} /></div>
              <div><Label>Rooms Required</Label><Input type="number" value={form.rooms_required} onChange={e => setForm(f => ({...f, rooms_required: e.target.value}))} /></div>
              <div><Label>Rate/Room/Night (NGN)</Label><Input type="number" value={form.rate_per_room_per_night} onChange={e => setForm(f => ({...f, rate_per_room_per_night: e.target.value}))} /></div>
              <div><Label>Check-in</Label><Input type="date" value={form.check_in} onChange={e => setForm(f => ({...f, check_in: e.target.value}))} /></div>
              <div><Label>Check-out</Label><Input type="date" value={form.check_out} onChange={e => setForm(f => ({...f, check_out: e.target.value}))} /></div>
              <div><Label>Nights</Label><Input type="number" value={form.nights} onChange={e => setForm(f => ({...f, nights: e.target.value}))} /></div>
              <div><Label>Attrition %</Label><Input type="number" value={form.attrition_pct} onChange={e => setForm(f => ({...f, attrition_pct: e.target.value}))} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Special requirements..." /></div>
            <div className="flex gap-2">
              <Button onClick={() => createMut.mutate({ organizerId: user?.id ?? "", hotelId: user?.id ?? "", ...form, paxCount: parseInt(form.pax_count), roomsRequired: parseInt(form.rooms_required), nights: parseInt(form.nights), ratePerRoomPerNight: parseFloat(form.rate_per_room_per_night), attritionPct: parseInt(form.attrition_pct) })} disabled={createMut.isPending}>{createMut.isPending ? "Creating..." : "Create Booking"}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : !bookings?.length ? (
        <Card><CardContent className="py-12 text-center text-gray-500"><Users className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No group bookings yet</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {bookings.map((b: any) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div><p className="font-semibold">{b.group_name}</p><p className="text-sm text-gray-500 capitalize">{b.event_type.replace("_"," ")} · {b.pax_count} pax</p></div>
                  <Badge className={statusColor(b.status)}>{b.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-500">Total Value</p><p className="font-medium">{b.currency} {Number(b.total_amount).toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Deposit Paid</p><p className="font-medium">{b.currency} {Number(b.deposit_paid).toLocaleString()}</p></div>
                  <div><p className="text-gray-500">Attrition</p><p className="font-medium">{b.attrition_pct}%</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
