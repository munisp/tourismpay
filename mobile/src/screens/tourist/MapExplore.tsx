/**
 * MapExplore — Interactive map view showing nearby establishments using react-native-maps.
 * Fetches establishments from API and renders markers with callouts.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import MapView, { Marker, Callout, Region, PROVIDER_GOOGLE } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import { touristAPI, Establishment } from "../../services/api";

const DEFAULT_REGION: Region = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export function MapExplore({ navigation }: any) {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      Geolocation.getCurrentPosition(
        (position: any) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          const newRegion = { latitude, longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 };
          setRegion(newRegion);
          loadEstablishments(latitude, longitude);
        },
        () => {
          // Permission denied or unavailable — use default (Lagos)
          loadEstablishments(DEFAULT_REGION.latitude, DEFAULT_REGION.longitude);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    } catch {
      loadEstablishments(DEFAULT_REGION.latitude, DEFAULT_REGION.longitude);
    }
  };

  const loadEstablishments = useCallback(async (lat: number, lng: number) => {
    try {
      const data = await touristAPI.getEstablishments({
        lat,
        lng,
        radius: 5000,
      });
      setEstablishments(data);
    } catch {
      // Show empty map
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMarkerPress = (est: Establishment) => {
    navigation.navigate("Catalog", { experienceId: est.id });
  };

  const recenterMap = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.lat,
        longitude: userLocation.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    }
  };

  const markerColor = (category: string): string => {
    const colors: Record<string, string> = {
      hotel: "#6c63ff",
      restaurant: "#f59e0b",
      activity: "#22c55e",
      transport: "#3b82f6",
      default: "#ef4444",
    };
    return colors[category.toLowerCase()] ?? colors.default;
  };

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={s.map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        mapType="standard"
        customMapStyle={darkMapStyle}
      >
        {establishments.map((est) => (
          <Marker
            key={est.id}
            coordinate={{ latitude: est.lat, longitude: est.lng }}
            pinColor={markerColor(est.category)}
            onPress={() => handleMarkerPress(est)}
          >
            <Callout>
              <View style={s.callout}>
                <Text style={s.calloutTitle}>{est.name}</Text>
                <Text style={s.calloutSubtitle}>{est.category} | {est.priceRange}</Text>
                {est.rating > 0 && <Text style={s.calloutRating}>★ {est.rating.toFixed(1)}</Text>}
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      {/* Controls Overlay */}
      <View style={s.controls}>
        <TouchableOpacity style={s.controlBtn} onPress={recenterMap}>
          <Text style={s.controlText}>📍</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.controlBtn} onPress={() => navigation.navigate("TouristHome")}>
          <Text style={s.controlText}>📋</Text>
        </TouchableOpacity>
      </View>

      {/* Info Bar */}
      <View style={s.infoBar}>
        <Text style={s.infoText}>{establishments.length} places nearby</Text>
        {loading && <ActivityIndicator size="small" color="#6c63ff" />}
      </View>
    </View>
  );
}

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
];

const s = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  controls: { position: "absolute", top: 60, right: 16, gap: 10 },
  controlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  controlText: { fontSize: 20 },
  infoBar: { position: "absolute", bottom: 30, left: 16, right: 16, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  infoText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  callout: { padding: 8, minWidth: 120 },
  calloutTitle: { fontSize: 13, fontWeight: "600", color: "#333" },
  calloutSubtitle: { fontSize: 11, color: "#666", marginTop: 2 },
  calloutRating: { fontSize: 11, color: "#f59e0b", marginTop: 4 },
});
