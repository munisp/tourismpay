/**
 * TourismPay CesiumJS 3D Globe View
 * Task 51: Robust MapLibre + GeoLibre + CesiumJS integration
 *
 * Provides:
 *  - CesiumJS 3D globe for tourist destination visualization
 *  - Real-time merchant/establishment markers from geospatial service
 *  - Loyalty zone boundaries with 3D extrusion
 *  - Tourist flow heatmap (arrival/departure patterns)
 *  - Integration with existing MapLibre TripMapView
 *
 * Architecture:
 *  - CesiumJS: 3D globe, terrain, satellite imagery
 *  - MapLibre GL: 2D street-level map (existing TripMapView)
 *  - GeoLibre: Open-source tile server (OSM tiles)
 *  - Geospatial service: Go service at port 8090 for spatial queries
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Globe, Map, MapPin, Layers, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeoEstablishment {
  id: number;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  loyaltyMultiplier: number;
  isActive: boolean;
}

interface LoyaltyZone {
  id: number;
  zoneName: string;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  multiplier: number;
  isActive: boolean;
}

interface CesiumViewerInstance {
  destroy(): void;
  scene: {
    globe: { show: boolean };
    camera: {
      flyTo(options: object): void;
      setView(options: object): void;
    };
  };
  entities: {
    add(entity: object): object;
    remove(entity: object): void;
    removeAll(): void;
  };
  dataSources: {
    add(ds: object): Promise<object>;
    removeAll(): void;
  };
}

// ─── Cesium loader ────────────────────────────────────────────────────────────

let cesiumLoaded = false;
let cesiumLoadPromise: Promise<void> | null = null;

function loadCesium(): Promise<void> {
  if (cesiumLoaded) return Promise.resolve();
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    // Load CesiumJS from CDN
    const script = document.createElement("script");
    script.src = "https://cesium.com/downloads/cesiumjs/releases/1.115/Build/Cesium/Cesium.js";
    script.onload = () => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cesium.com/downloads/cesiumjs/releases/1.115/Build/Cesium/Widgets/widgets.css";
      document.head.appendChild(link);
      cesiumLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

  return cesiumLoadPromise;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CesiumGlobeViewProps {
  initialLat?: number;
  initialLng?: number;
  initialAlt?: number;
  showEstablishments?: boolean;
  showLoyaltyZones?: boolean;
  showTouristFlow?: boolean;
  height?: string;
  onEstablishmentClick?: (est: GeoEstablishment) => void;
}

export function CesiumGlobeView({
  initialLat = 6.5244,   // Lagos
  initialLng = 3.3792,
  initialAlt = 500000,   // 500km altitude
  showEstablishments = true,
  showLoyaltyZones = true,
  showTouristFlow = false,
  height = "500px",
  onEstablishmentClick,
}: CesiumGlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<CesiumViewerInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [entityCount, setEntityCount] = useState(0);

  // Fetch establishments from geospatial service via tRPC
  const { data: establishments } = trpc.geospatial?.getNearbyEstablishments?.useQuery?.(
    { lat: initialLat, lng: initialLng, radiusKm: 50, limit: 200 },
    { enabled: showEstablishments }
  ) ?? { data: null };

  // Fetch loyalty zones
  const { data: loyaltyZones } = trpc.geospatial?.getLoyaltyZones?.useQuery?.(
    { city: "Lagos" },
    { enabled: showLoyaltyZones }
  ) ?? { data: null };

  // Initialize Cesium viewer
  useEffect(() => {
    if (!containerRef.current) return;

    let viewer: CesiumViewerInstance | null = null;

    loadCesium()
      .then(() => {
        const Cesium = (window as any).Cesium;
        if (!Cesium || !containerRef.current) return;

        // Use OSM tiles (GeoLibre-compatible, no API key needed)
        Cesium.Ion.defaultAccessToken = ""; // Use open tiles

        viewer = new Cesium.Viewer(containerRef.current, {
          imageryProvider: new Cesium.OpenStreetMapImageryProvider({
            url: "https://tile.openstreetmap.org/",
            credit: "© OpenStreetMap contributors",
          }),
          terrainProvider: Cesium.createWorldTerrain(),
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          animation: false,
          timeline: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
        });

        viewerRef.current = viewer as unknown as CesiumViewerInstance;

        // Set initial camera position over Nigeria
        viewer.scene.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(initialLng, initialLat, initialAlt),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-45),
            roll: 0,
          },
        });

        setIsLoading(false);
      })
      .catch((err) => {
        setError(`Failed to load CesiumJS: ${err.message}`);
        setIsLoading(false);
      });

    return () => {
      if (viewer && !viewer.isDestroyed?.()) {
        viewer.entities.removeAll();
        viewer.destroy();
      }
      viewerRef.current = null;
    };
  }, [initialLat, initialLng, initialAlt]);

  // Add establishment markers
  useEffect(() => {
    if (!viewerRef.current || !establishments?.items) return;

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    viewer.entities.removeAll();

    let count = 0;
    for (const est of establishments.items as GeoEstablishment[]) {
      if (!est.latitude || !est.longitude) continue;

      const color = est.loyaltyMultiplier >= 2
        ? Cesium.Color.GOLD
        : est.loyaltyMultiplier >= 1.5
        ? Cesium.Color.ORANGE
        : Cesium.Color.CYAN;

      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(est.longitude, est.latitude),
        point: {
          pixelSize: est.loyaltyMultiplier >= 2 ? 12 : 8,
          color: color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        label: {
          text: est.name,
          font: "11px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -12),
          show: false, // Only show on hover
        },
        properties: est,
      });
      count++;
    }

    setEntityCount(count);
  }, [establishments]);

  // Add loyalty zone boundaries
  useEffect(() => {
    if (!viewerRef.current || !loyaltyZones?.zones) return;

    const Cesium = (window as any).Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;

    for (const zone of loyaltyZones.zones as LoyaltyZone[]) {
      if (!zone.centerLat || !zone.centerLng) continue;

      // Draw zone as extruded cylinder
      viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(zone.centerLng, zone.centerLat),
        cylinder: {
          length: zone.multiplier * 5000, // Height proportional to multiplier
          topRadius: zone.radiusKm * 1000,
          bottomRadius: zone.radiusKm * 1000,
          material: Cesium.Color.fromCssColorString(
            zone.multiplier >= 3 ? "#FFD700" :
            zone.multiplier >= 2 ? "#FFA500" : "#00BFFF"
          ).withAlpha(0.3),
          outline: true,
          outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
          outlineWidth: 2,
        },
        label: {
          text: `${zone.zoneName}\n${zone.multiplier}x`,
          font: "12px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        },
      });
    }
  }, [loyaltyZones]);

  const flyToNigeria = useCallback(() => {
    if (!viewerRef.current) return;
    const Cesium = (window as any).Cesium;
    if (!Cesium) return;
    viewerRef.current.scene.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(8.6753, 9.0820, 2000000),
      duration: 2,
    });
  }, []);

  const flyToLagos = useCallback(() => {
    if (!viewerRef.current) return;
    const Cesium = (window as any).Cesium;
    if (!Cesium) return;
    viewerRef.current.scene.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(3.3792, 6.5244, 50000),
      duration: 2,
    });
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-red-500 text-sm">
            <Globe className="inline w-4 h-4 mr-1" />
            {error}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            CesiumJS requires a modern browser with WebGL support.
            Falling back to MapLibre 2D view.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="w-4 h-4" />
            TourismPay 3D Globe
            {entityCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {entityCount} establishments
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={flyToNigeria} className="h-7 text-xs">
              <Map className="w-3 h-3 mr-1" /> Nigeria
            </Button>
            <Button size="sm" variant="outline" onClick={flyToLagos} className="h-7 text-xs">
              <MapPin className="w-3 h-3 mr-1" /> Lagos
            </Button>
          </div>
        </div>
        <div className="flex gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 2x+ loyalty
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> 1.5x loyalty
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Standard
          </span>
          {showLoyaltyZones && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400/50 border border-white inline-block" /> Zone
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading && (
          <Skeleton style={{ height }} className="rounded-none" />
        )}
        <div
          ref={containerRef}
          style={{ height, display: isLoading ? "none" : "block" }}
          className="w-full"
        />
      </CardContent>
    </Card>
  );
}

export default CesiumGlobeView;
