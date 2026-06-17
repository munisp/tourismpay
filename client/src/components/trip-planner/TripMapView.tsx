/**
 * TripMapView — MapLibre GL JS map showing merchant locations from itinerary.
 * Uses OpenStreetMap tiles (no API key required), inspired by GeoLibre architecture.
 */
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Map, Layers, MapPin, X } from "lucide-react";

// MapLibre is loaded dynamically to avoid SSR issues
let maplibregl: typeof import("maplibre-gl") | null = null;

interface MerchantMarker {
  id: number;
  name: string;
  type: string;
  lat: number;
  lng: number;
  cost_usd: number;
  day_number: number;
  time_slot: string;
  bookable: boolean;
}

interface TripMapViewProps {
  merchants: MerchantMarker[];
  country: string;
  onClose?: () => void;
}

// Country center coordinates for initial map position
const COUNTRY_CENTERS: Record<string, [number, number, number]> = {
  NG: [7.4951, 3.3792, 10], // Lagos
  KE: [-1.2864, 36.8172, 11], // Nairobi
  GH: [5.6037, -0.1870, 11], // Accra
  ZA: [-33.9249, 18.4241, 11], // Cape Town
  TZ: [-6.1630, 35.7516, 6], // Tanzania
  EG: [30.0444, 31.2357, 10], // Cairo
  MA: [31.6295, -7.9811, 10], // Marrakech
  RW: [-1.9403, 29.8739, 11], // Kigali
  SN: [14.7167, -17.4677, 11], // Dakar
};

const TYPE_COLORS: Record<string, string> = {
  accommodation: "#3b82f6",
  meal: "#f97316",
  transport: "#a855f7",
  activity: "#22c55e",
  nightlife: "#ec4899",
  nature: "#10b981",
  beach: "#06b6d4",
  free_time: "#6b7280",
};

export function TripMapView({ merchants, country, onClose }: TripMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<InstanceType<typeof import("maplibre-gl").Map> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<MerchantMarker | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapContainer.current) return;

      // Dynamic import of maplibre-gl
      if (!maplibregl) {
        maplibregl = await import("maplibre-gl");
        // Import CSS
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css";
        document.head.appendChild(link);
      }

      if (cancelled) return;

      const ml = maplibregl!;
      const center = COUNTRY_CENTERS[country] ?? [0, 20, 3];

      const map = new ml.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [
            {
              id: "osm-tiles",
              type: "raster",
              source: "osm",
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [center[1], center[0]],
        zoom: center[2],
      });

      map.addControl(new ml.NavigationControl(), "top-right");
      map.addControl(new ml.ScaleControl(), "bottom-left");

      map.on("load", () => {
        if (cancelled) return;
        setMapLoaded(true);

        // Add markers for each merchant
        for (const merchant of merchants) {
          if (!merchant.lat || !merchant.lng) continue;

          const color = TYPE_COLORS[merchant.type] ?? "#6b7280";

          // Create custom marker element
          const el = document.createElement("div");
          el.className = "trip-marker";
          el.style.cssText = `
            width: 32px; height: 32px; border-radius: 50%;
            background: ${color}; border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            color: white; font-weight: bold; font-size: 11px;
            cursor: pointer; transition: transform 0.2s;
          `;
          el.textContent = `D${merchant.day_number}`;
          el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.3)"; });
          el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)"; });
          el.addEventListener("click", () => { setSelectedMarker(merchant); });

          new ml.Marker({ element: el })
            .setLngLat([merchant.lng, merchant.lat])
            .addTo(map);
        }

        // Fit bounds if there are multiple markers
        if (merchants.length > 1) {
          const validMerchants = merchants.filter(m => m.lat && m.lng);
          if (validMerchants.length > 1) {
            const bounds = new ml.LngLatBounds();
            for (const m of validMerchants) {
              bounds.extend([m.lng, m.lat]);
            }
            map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
          }
        }
      });

      mapInstance.current = map;
    }

    initMap();

    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [merchants, country]);

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Map className="w-4 h-4 text-primary" /> Merchant Map
          <Badge variant="secondary" className="text-[10px]">{merchants.length} locations</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0 relative">
        <div ref={mapContainer} className="w-full h-[350px] md:h-[450px]" />

        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <div className="flex flex-col items-center gap-2">
              <Layers className="w-6 h-6 animate-pulse text-primary" />
              <span className="text-xs text-muted-foreground">Loading map...</span>
            </div>
          </div>
        )}

        {/* Selected marker popup */}
        {selectedMarker && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-72 bg-card border border-border rounded-lg p-3 shadow-xl z-10">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{selectedMarker.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{selectedMarker.type} • Day {selectedMarker.day_number}</p>
                <p className="text-sm font-bold text-primary mt-1">${selectedMarker.cost_usd.toFixed(2)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {selectedMarker.bookable && (
                  <Badge className="text-[10px] bg-green-600">TourismPay</Badge>
                )}
                <button onClick={() => setSelectedMarker(null)} className="text-xs text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-2 left-2 bg-card/90 backdrop-blur-sm border border-border rounded-md p-2 text-[10px] space-y-1">
          {Object.entries(TYPE_COLORS).slice(0, 5).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="capitalize">{type}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
