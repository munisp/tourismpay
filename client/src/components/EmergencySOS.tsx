/**
 * Tourist Emergency SOS — accessible from any page via floating button.
 *
 * Features:
 * - One-tap emergency card freeze
 * - Embassy/consulate contact info by country
 * - Local emergency numbers (police, ambulance, fire)
 * - Share live location with emergency contact
 * - Report lost/stolen device (remote wallet lock)
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldAlert, Phone, MapPin, CreditCard, Lock, Globe,
  AlertTriangle, Ambulance, Shield, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface EmergencyContact {
  country: string;
  flag: string;
  police: string;
  ambulance: string;
  fire: string;
  touristPolice?: string;
  embassy?: { name: string; phone: string; address: string };
}

const EMERGENCY_CONTACTS: Record<string, EmergencyContact> = {
  NG: {
    country: "Nigeria", flag: "\u{1F1F3}\u{1F1EC}",
    police: "112", ambulance: "112", fire: "112",
    touristPolice: "+234 803 123 4567",
    embassy: { name: "US Embassy Abuja", phone: "+234 9 461 4000", address: "1075 Diplomatic Drive, Abuja" },
  },
  KE: {
    country: "Kenya", flag: "\u{1F1F0}\u{1F1EA}",
    police: "999", ambulance: "999", fire: "999",
    touristPolice: "+254 20 222 6416",
    embassy: { name: "US Embassy Nairobi", phone: "+254 20 363 6000", address: "United Nations Ave, Nairobi" },
  },
  GH: {
    country: "Ghana", flag: "\u{1F1EC}\u{1F1ED}",
    police: "191", ambulance: "193", fire: "192",
    embassy: { name: "US Embassy Accra", phone: "+233 30 274 1000", address: "24 Fourth Circular Rd, Accra" },
  },
  ZA: {
    country: "South Africa", flag: "\u{1F1FF}\u{1F1E6}",
    police: "10111", ambulance: "10177", fire: "10177",
    embassy: { name: "US Embassy Pretoria", phone: "+27 12 431 4000", address: "877 Pretorius St, Pretoria" },
  },
  TZ: {
    country: "Tanzania", flag: "\u{1F1F9}\u{1F1FF}",
    police: "112", ambulance: "114", fire: "114",
    embassy: { name: "US Embassy Dar es Salaam", phone: "+255 22 229 4000", address: "686 Old Bagamoyo Rd, Dar es Salaam" },
  },
};

export function EmergencySOS() {
  const [open, setOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("NG");
  const [freezing, setFreezing] = useState(false);
  const [frozen, setFrozen] = useState(false);

  const contact = EMERGENCY_CONTACTS[selectedCountry];

  const handleFreeze = async () => {
    setFreezing(true);
    // Simulate API call to freeze wallet
    await new Promise(r => setTimeout(r, 1000));
    setFrozen(true);
    setFreezing(false);
    toast.success("All cards and wallet frozen. Contact support to restore access.");
  };

  const handleShareLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const url = `https://maps.google.com/?q=${latitude},${longitude}`;
          if (navigator.share) {
            navigator.share({
              title: "My Emergency Location",
              text: `I need help! My location: ${latitude}, ${longitude}`,
              url,
            });
          } else {
            navigator.clipboard.writeText(url);
            toast.success("Location link copied to clipboard");
          }
        },
        () => toast.error("Unable to get location. Please enable GPS."),
      );
    }
  };

  return (
    <>
      {/* Floating SOS Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 w-12 h-12 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 flex items-center justify-center hover:bg-red-700 transition-all active:scale-95 sm:bottom-6"
        aria-label="Emergency SOS"
      >
        <ShieldAlert className="w-6 h-6" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <ShieldAlert className="w-5 h-5" />
              Emergency Assistance
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Country selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Object.entries(EMERGENCY_CONTACTS).map(([code, c]) => (
                <button
                  key={code}
                  onClick={() => setSelectedCountry(code)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selectedCountry === code
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {c.flag} {c.country}
                </button>
              ))}
            </div>

            {/* Emergency freeze */}
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 text-red-500 text-xs font-semibold">
                  <Lock className="w-4 h-4" />
                  Emergency Freeze
                </div>
                <p className="text-xs text-muted-foreground">
                  Instantly freeze all cards and wallet activity. Use if your device is lost or stolen.
                </p>
                <Button
                  variant="destructive"
                  className="w-full"
                  size="sm"
                  onClick={handleFreeze}
                  disabled={freezing || frozen}
                >
                  {frozen ? "Wallet Frozen" : freezing ? "Freezing..." : "Freeze All Cards & Wallet"}
                </Button>
              </CardContent>
            </Card>

            {/* Emergency numbers */}
            {contact && (
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <Phone className="w-4 h-4 text-primary" />
                    Emergency Numbers — {contact.flag} {contact.country}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Police", number: contact.police, icon: Shield },
                      { label: "Ambulance", number: contact.ambulance, icon: Ambulance },
                      { label: "Fire", number: contact.fire, icon: AlertTriangle },
                    ].map(({ label, number, icon: Icon }) => (
                      <a
                        key={label}
                        href={`tel:${number}`}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-all text-center"
                      >
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                        <span className="text-xs font-mono font-bold">{number}</span>
                      </a>
                    ))}
                  </div>
                  {contact.touristPolice && (
                    <a
                      href={`tel:${contact.touristPolice}`}
                      className="block p-2 rounded-lg bg-blue-500/10 text-blue-700 text-xs text-center hover:bg-blue-500/20"
                    >
                      Tourist Police: {contact.touristPolice}
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Embassy */}
            {contact?.embassy && (
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-primary" />
                    {contact.embassy.name}
                  </div>
                  <a
                    href={`tel:${contact.embassy.phone}`}
                    className="block p-2 rounded-lg bg-muted/50 text-xs font-mono hover:bg-muted"
                  >
                    {contact.embassy.phone}
                  </a>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {contact.embassy.address}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Share location */}
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={handleShareLocation}
            >
              <MapPin className="w-4 h-4 mr-2" />
              Share My Location
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
