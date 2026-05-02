import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, MapPin, Star, Loader2, Globe } from "lucide-react";

export default function ARTourism() {
  const { data: countries, isLoading: countriesLoading } = trpc.africa.countries.useQuery();
  const { data: events, isLoading: eventsLoading } = trpc.africa.events.useQuery();

  const handleLaunchAR = () => {
    toast.info("AR Camera", { description: "Launching AR experience — camera permission required on a real device." });
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Camera className="w-6 h-6 text-primary" />AR Tourism</h1>
          <p className="text-muted-foreground text-sm mt-1">Augmented reality experiences for African destinations</p>
        </div>
        <Button onClick={handleLaunchAR} className="gap-2"><Camera className="w-4 h-4" />Launch AR</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Registered Destinations</CardTitle>
          <CardDescription>Countries with AR-enabled tourism experiences</CardDescription>
        </CardHeader>
        <CardContent>
          {countriesLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !countries?.length ? (
            <div className="text-center py-8 text-muted-foreground"><Globe className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No destinations registered yet.</p></div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {countries.slice(0, 8).map((c) => (
                <div key={c.code} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.code}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto text-xs">AR Ready</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Featured Events</CardTitle>
          <CardDescription>Live tourism events with AR overlays</CardDescription>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !events?.length ? (
            <div className="text-center py-8 text-muted-foreground"><Star className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No events available.</p></div>
          ) : (
            <div className="space-y-3">
              {events.map((e: any) => (
                <div key={e.id} className="flex items-start justify-between p-3 rounded-lg border bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.city ?? e.country ?? "—"} · {e.startDate ? new Date(e.startDate).toLocaleDateString() : "TBD"}</p>
                    {e.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>}
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 ml-2" onClick={handleLaunchAR}>
                    <Camera className="w-3 h-3 mr-1" />AR
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
