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
import { BookOpen, Calendar, Users, DollarSign, CheckCircle, XCircle } from "lucide-react";

export default function DirectBooking() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: bookings, isLoading, refetch } = trpc.directBooking.listHotelBookings.useQuery(
    { hotelId: user?.id ?? "", status: statusFilter === "all" ? undefined : statusFilter },
    { enabled: !!user?.id }
  );

  const confirmMut = trpc.directBooking.confirmBooking.useMutation({
    onSuccess: () => { toast.success("Booking confirmed"); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const cancelMut = trpc.directBooking.cancelBooking.useMutation({
    onSuccess: () => { toast.success("Booking cancelled"); refetch(); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const statusColor = (s: string) => ({ confirmed: "bg-green-100 text-green-800", pending: "bg-yellow-100 text-yellow-800", cancelled: "bg-red-100 text-red-800", checked_in: "bg-blue-100 text-blue-800" }[s] ?? "bg-gray-100 text-gray-800");

  const totalRevenue = bookings?.filter((b: any) => b.status === "confirmed").reduce((sum: number, b: any) => sum + Number(b.total_amount), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Direct Bookings</h1><p className="text-gray-500 mt-1">Manage bookings made directly through your TourismPay page</p></div>
        <Card className="border-green-200 bg-green-50"><CardContent className="p-3 text-center"><p className="text-lg font-bold text-green-900">NGN {totalRevenue.toLocaleString()}</p><p className="text-xs text-green-700">Confirmed Revenue</p></CardContent></Card>
      </div>

      <div className="flex gap-2">
        {["all","pending","confirmed","cancelled"].map(s => (
          <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="capitalize">{s}</Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />)}</div>
      ) : !bookings?.length ? (
        <Card><CardContent className="py-12 text-center text-gray-500"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No bookings found</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b: any) => (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-semibold">{b.guest_name}</p>
                    <p className="text-sm text-gray-500">{b.guest_email} · Code: <span className="font-mono font-bold">{b.confirmation_code}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColor(b.status)}>{b.status}</Badge>
                    {b.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => confirmMut.mutate({ bookingId: b.id })} disabled={confirmMut.isPending}><CheckCircle className="w-3 h-3 mr-1" />Confirm</Button>
                        <Button size="sm" variant="outline" onClick={() => cancelMut.mutate({ bookingId: b.id })}><XCircle className="w-3 h-3 mr-1" />Cancel</Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div><p className="text-gray-500">Room</p><p className="font-medium">{b.room_type}</p></div>
                  <div><p className="text-gray-500">Check-in</p><p className="font-medium">{new Date(b.check_in).toLocaleDateString()}</p></div>
                  <div><p className="text-gray-500">Nights</p><p className="font-medium">{b.nights}</p></div>
                  <div><p className="text-gray-500">Total</p><p className="font-medium">{b.currency} {Number(b.total_amount).toLocaleString()}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
