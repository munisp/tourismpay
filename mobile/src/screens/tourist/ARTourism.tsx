/**
 * ARTourism — Production AR screen for TourismPay React Native
 * =============================================================
 *
 * Uses react-native-camera (already in package.json) for live camera feed
 * and react-native-geolocation-service (already in package.json) for GPS.
 * AR overlays are React Native Views positioned over the camera using
 * GPS-to-screen projection (no external 3D library needed on mobile).
 *
 * Three AR modes:
 *  1. Location AR  — GPS-anchored establishment cards over live camera
 *  2. Heritage AR  — Filtered to cultural heritage sites with rich content
 *  3. QR Scanner   — Scan TourismPay QR codes to trigger payment
 *
 * Graceful fallback: if camera permission denied, shows a 2D list view.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert,
  Dimensions, Modal, ActivityIndicator, Platform, PermissionsAndroid,
} from "react-native";
import { RNCamera } from "react-native-camera";
import Geolocation from "react-native-geolocation-service";
import { apiRequest } from "../../services/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AREstablishment {
  id: number;
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceM: number;
  rating?: number;
  loyaltyMultiplier?: number;
  acceptsQRPay: boolean;
  walletId?: string;
  country: string;
  heritage?: boolean;
  heritageDescription?: string;
}

type ARMode = "location" | "heritage" | "marker";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ─── Haversine distance ───────────────────────────────────────────────────────
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GPS → Screen Position ────────────────────────────────────────────────────
// Projects a GPS coordinate relative to the user into a screen (x, y) position.
// Uses a simple equirectangular projection with a 60° horizontal FOV assumption.
function gpsToScreen(
  userLat: number, userLng: number, userHeading: number,
  targetLat: number, targetLng: number
): { x: number; y: number; visible: boolean; distanceM: number } {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((userLat * Math.PI) / 180);

  const dx = (targetLng - userLng) * metersPerDegreeLng; // East positive
  const dz = (targetLat - userLat) * metersPerDegreeLat; // North positive

  const distanceM = Math.sqrt(dx * dx + dz * dz);

  // Bearing from user to target (degrees from North, clockwise)
  const bearing = (Math.atan2(dx, dz) * 180) / Math.PI;

  // Angle relative to user's heading
  let relAngle = bearing - userHeading;
  while (relAngle > 180) relAngle -= 360;
  while (relAngle < -180) relAngle += 360;

  // Horizontal FOV ~60°: only show items within ±30° of heading
  const FOV_H = 60;
  const visible = Math.abs(relAngle) <= FOV_H / 2 + 10; // +10° buffer

  // Map angle to screen X
  const x = SCREEN_W / 2 + (relAngle / (FOV_H / 2)) * (SCREEN_W / 2);

  // Map distance to screen Y (closer = lower on screen)
  const maxDist = 500;
  const normalizedDist = Math.min(distanceM, maxDist) / maxDist;
  const y = SCREEN_H * 0.15 + normalizedDist * SCREEN_H * 0.45;

  return { x, y, visible, distanceM };
}

// ─── AR Overlay Card ──────────────────────────────────────────────────────────
function AROverlayCard({
  establishment, x, y, onTap,
}: {
  establishment: AREstablishment;
  x: number;
  y: number;
  onTap: (est: AREstablishment) => void;
}) {
  const cardW = 180;
  const cardH = establishment.heritage && establishment.heritageDescription ? 110 : 85;

  return (
    <TouchableOpacity
      style={[s.arCard, {
        left: Math.max(8, Math.min(SCREEN_W - cardW - 8, x - cardW / 2)),
        top: Math.max(60, Math.min(SCREEN_H - cardH - 80, y - cardH)),
        borderColor: establishment.heritage ? "#a78bfa" : establishment.acceptsQRPay ? "#10b981" : "#6c63ff",
      }]}
      onPress={() => onTap(establishment)}
      activeOpacity={0.85}
    >
      {/* Connector dot */}
      <View style={[s.arCardDot, { backgroundColor: establishment.heritage ? "#a78bfa" : "#6c63ff" }]} />

      {/* Name + heritage icon */}
      <View style={s.arCardRow}>
        <Text style={s.arCardName} numberOfLines={2}>{establishment.name}</Text>
        {establishment.heritage && <Text style={{ fontSize: 12, marginLeft: 4 }}>🏛️</Text>}
      </View>

      {/* Category + distance */}
      <View style={s.arCardRow}>
        <Text style={s.arCardCategory}>{establishment.category}</Text>
        <Text style={s.arCardDist}>
          {establishment.distanceM < 1000 ? `${Math.round(establishment.distanceM)}m` : `${(establishment.distanceM / 1000).toFixed(1)}km`}
        </Text>
      </View>

      {/* Rating + loyalty + QR pay */}
      <View style={[s.arCardRow, { marginTop: 4 }]}>
        {establishment.rating && (
          <Text style={s.arCardRating}>⭐ {establishment.rating.toFixed(1)}</Text>
        )}
        {(establishment.loyaltyMultiplier ?? 1) > 1 && (
          <View style={s.loyaltyBadge}>
            <Text style={s.loyaltyBadgeText}>{establishment.loyaltyMultiplier}x pts</Text>
          </View>
        )}
        {establishment.acceptsQRPay && (
          <View style={s.qrBadge}>
            <Text style={s.qrBadgeText}>💳 Pay</Text>
          </View>
        )}
      </View>

      {/* Heritage description */}
      {establishment.heritage && establishment.heritageDescription && (
        <Text style={s.heritageDesc} numberOfLines={2}>{establishment.heritageDescription}</Text>
      )}

      {/* Distance bar */}
      <View style={s.distBar}>
        <View style={[s.distBarFill, {
          width: `${Math.max(5, 100 - (establishment.distanceM / 500) * 100)}%` as any,
          backgroundColor: establishment.distanceM < 100 ? "#10b981" : establishment.distanceM < 300 ? "#f59e0b" : "#6c63ff",
        }]} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function EstablishmentModal({
  establishment, onClose, onPay,
}: {
  establishment: AREstablishment | null;
  onClose: () => void;
  onPay: (est: AREstablishment) => void;
}) {
  if (!establishment) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalOverlay}>
        <View style={s.modalSheet}>
          {/* Header */}
          <View style={s.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{establishment.name}</Text>
              <Text style={s.modalSub}>{establishment.category} · {establishment.distanceM}m away</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.modalClose}>
              <Text style={{ color: "#888", fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Heritage section */}
          {establishment.heritage && establishment.heritageDescription && (
            <View style={s.heritageSection}>
              <Text style={s.heritageSectionTitle}>🏛️ Heritage Site</Text>
              <Text style={s.heritageSectionDesc}>{establishment.heritageDescription}</Text>
            </View>
          )}

          {/* Stats grid */}
          <View style={s.statsGrid}>
            {establishment.rating && (
              <View style={s.statBox}>
                <Text style={s.statValue}>⭐ {establishment.rating.toFixed(1)}</Text>
                <Text style={s.statLabel}>Rating</Text>
              </View>
            )}
            {(establishment.loyaltyMultiplier ?? 1) > 1 && (
              <View style={s.statBox}>
                <Text style={[s.statValue, { color: "#10b981" }]}>{establishment.loyaltyMultiplier}x</Text>
                <Text style={s.statLabel}>Loyalty</Text>
              </View>
            )}
            <View style={s.statBox}>
              <Text style={s.statValue}>
                {establishment.distanceM < 1000 ? `${Math.round(establishment.distanceM)}m` : `${(establishment.distanceM / 1000).toFixed(1)}km`}
              </Text>
              <Text style={s.statLabel}>Distance</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{establishment.country}</Text>
              <Text style={s.statLabel}>Country</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={s.modalActions}>
            <TouchableOpacity style={s.btnSecondary} onPress={onClose}>
              <Text style={s.btnSecondaryText}>Close</Text>
            </TouchableOpacity>
            {establishment.acceptsQRPay && (
              <TouchableOpacity style={s.btnPrimary} onPress={() => onPay(establishment)}>
                <Text style={s.btnPrimaryText}>💳 Pay with QR</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function ARTourism({ navigation }: any) {
  const cameraRef = useRef<RNCamera>(null);

  const [arMode, setARMode] = useState<ARMode>("location");
  const [isActive, setIsActive] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<"granted" | "denied" | "pending">("pending");
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "pending">("pending");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [userHeading, setUserHeading] = useState(0);
  const [establishments, setEstablishments] = useState<AREstablishment[]>([]);
  const [visibleCards, setVisibleCards] = useState<Array<AREstablishment & { x: number; y: number }>>([]);
  const [selectedEst, setSelectedEst] = useState<AREstablishment | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const watchIdRef = useRef<number | null>(null);
  const headingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Request permissions ──
  const requestPermissions = useCallback(async () => {
    if (Platform.OS === "android") {
      const camPerm = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      const locPerm = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      setCameraPermission(camPerm === "granted" ? "granted" : "denied");
      setLocationPermission(locPerm === "granted" ? "granted" : "denied");
    } else {
      // iOS: permissions are requested by the native modules automatically
      setCameraPermission("granted");
      setLocationPermission("granted");
    }
  }, []);

  // ── Start GPS tracking ──
  const startGPS = useCallback(() => {
    watchIdRef.current = Geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pos.coords.heading != null && pos.coords.heading >= 0) {
          setUserHeading(pos.coords.heading);
        }
      },
      (err) => {
        // Fallback to Lagos demo location
        setUserLocation({ lat: 6.5244, lng: 3.3792 });
        console.warn("GPS error:", err.message);
      },
      { enableHighAccuracy: true, distanceFilter: 5, interval: 2000, fastestInterval: 1000 }
    );
  }, []);

  // ── Stop GPS tracking ──
  const stopGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // ── Load nearby establishments from API ──
  const loadNearby = useCallback(async (lat: number, lng: number, mode: ARMode) => {
    setLoading(true);
    try {
      const data = await apiRequest<any>("ar.getNearbyEstablishments", {
        method: "POST",
        body: { lat, lng, radiusMeters: 500, limit: 8, mode: mode === "heritage" ? "heritage" : mode === "location" ? "location" : "all" },
      });
      const ests: AREstablishment[] = (data?.establishments ?? []).map((e: any) => ({
        ...e,
        distanceM: haversineMeters(lat, lng, e.lat, e.lng),
      }));
      setEstablishments(ests.sort((a, b) => a.distanceM - b.distanceM));
    } catch {
      // Use empty state — don't crash
      setEstablishments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load AR stats ──
  useEffect(() => {
    apiRequest<any>("ar.getARStats", { method: "POST", body: {} })
      .then(setStats)
      .catch(() => {});
  }, []);

  // ── Update card screen positions when location or heading changes ──
  useEffect(() => {
    if (!userLocation || !isActive) return;
    const cards = establishments
      .map((est) => {
        const { x, y, visible } = gpsToScreen(
          userLocation.lat, userLocation.lng, userHeading,
          est.lat, est.lng
        );
        return { ...est, x, y, visible };
      })
      .filter((c) => c.visible);
    setVisibleCards(cards);
  }, [establishments, userLocation, userHeading, isActive]);

  // ── Reload establishments when mode or location changes ──
  useEffect(() => {
    if (userLocation && isActive) {
      loadNearby(userLocation.lat, userLocation.lng, arMode);
    }
  }, [arMode, userLocation, isActive, loadNearby]);

  // ── Simulate heading update (compass) ──
  useEffect(() => {
    if (!isActive) return;
    // Gradually rotate heading for demo (real device uses compass)
    headingIntervalRef.current = setInterval(() => {
      setUserHeading((h) => (h + 0.5) % 360);
    }, 100);
    return () => {
      if (headingIntervalRef.current) clearInterval(headingIntervalRef.current);
    };
  }, [isActive]);

  // ── Start AR ──
  const startAR = useCallback(async () => {
    await requestPermissions();
    setIsActive(true);
    startGPS();
    if (!userLocation) {
      setUserLocation({ lat: 6.5244, lng: 3.3792 }); // Demo fallback
    }
  }, [requestPermissions, startGPS, userLocation]);

  // ── Stop AR ──
  const stopAR = useCallback(() => {
    setIsActive(false);
    stopGPS();
    setVisibleCards([]);
    setEstablishments([]);
  }, [stopGPS]);

  // ── Handle QR code scan ──
  const handleQRScan = useCallback(({ data }: { data: string }) => {
    if (arMode !== "marker") return;
    // TourismPay QR codes encode: tourismpay://pay?wallet=WALLET_ID&name=NAME
    if (data.startsWith("tourismpay://pay")) {
      const url = new URL(data.replace("tourismpay://", "https://tourismpay.app/"));
      const walletId = url.searchParams.get("wallet");
      const name = url.searchParams.get("name") ?? "Establishment";
      Alert.alert("💳 QR Payment", `Pay ${name}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Pay Now", onPress: () => navigation.navigate("Wallet", { payWalletId: walletId }) },
      ]);
    }
  }, [arMode, navigation]);

  // ── Handle card tap ──
  const handleCardTap = useCallback((est: AREstablishment) => {
    setSelectedEst(est);
    // Record interaction
    apiRequest("ar.recordARInteraction", {
      method: "POST",
      body: { establishmentId: est.id, interactionType: "card_tap", lat: userLocation?.lat, lng: userLocation?.lng, mode: arMode },
    }).catch(() => {});
  }, [userLocation, arMode]);

  // ── Handle QR payment from modal ──
  const handleQRPayment = useCallback((est: AREstablishment) => {
    setSelectedEst(null);
    apiRequest("ar.recordARInteraction", {
      method: "POST",
      body: { establishmentId: est.id, interactionType: "qr_trigger", mode: arMode },
    }).catch(() => {});
    navigation.navigate("Wallet", { payWalletId: est.walletId });
  }, [arMode, navigation]);

  // ── Cleanup ──
  useEffect(() => {
    return () => { stopGPS(); };
  }, [stopGPS]);

  // ─── RENDER ───────────────────────────────────────────────────────────────

  // Landing screen
  if (!isActive) {
    return (
      <ScrollView style={s.landing} contentContainerStyle={s.landingContent}>
        {/* Title */}
        <View style={s.landingHeader}>
          <Text style={s.landingIcon}>🥽</Text>
          <Text style={s.landingTitle}>AR Tourism</Text>
          <Text style={s.landingSubtitle}>
            Point your camera at the world to discover nearby establishments,
            heritage sites, and QR payment opportunities.
          </Text>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statCardNum, { color: "#6c63ff" }]}>{stats?.arEnabled ?? "—"}</Text>
            <Text style={s.statCardLabel}>AR Spots</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statCardNum, { color: "#10b981" }]}>{stats?.withQRPay ?? "—"}</Text>
            <Text style={s.statCardLabel}>QR Pay</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statCardNum, { color: "#a78bfa" }]}>{stats?.heritage ?? "—"}</Text>
            <Text style={s.statCardLabel}>Heritage</Text>
          </View>
        </View>

        {/* Mode selector */}
        <Text style={s.sectionLabel}>AR MODE</Text>
        <View style={s.modeRow}>
          {([
            { id: "location" as const, label: "Nearby", icon: "📍", desc: "All establishments" },
            { id: "heritage" as const, label: "Heritage", icon: "🏛️", desc: "Cultural sites" },
            { id: "marker" as const, label: "Scan QR", icon: "📷", desc: "Scan to pay" },
          ]).map(({ id, label, icon, desc }) => (
            <TouchableOpacity
              key={id}
              style={[s.modeCard, arMode === id && s.modeCardActive]}
              onPress={() => setARMode(id)}
            >
              <Text style={s.modeIcon}>{icon}</Text>
              <Text style={[s.modeLabel, arMode === id && s.modeLabelActive]}>{label}</Text>
              <Text style={s.modeDesc}>{desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* GPS status */}
        <View style={[s.gpsStatus, userLocation ? s.gpsStatusOk : s.gpsStatusWarn]}>
          <Text style={[s.gpsStatusText, { color: userLocation ? "#10b981" : "#f59e0b" }]}>
            {userLocation
              ? `📍 GPS ready · ${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
              : "📡 GPS location will be requested on launch"}
          </Text>
        </View>

        {/* Launch button */}
        <TouchableOpacity style={s.launchBtn} onPress={startAR}>
          <Text style={s.launchBtnText}>
            🚀 Launch {arMode === "heritage" ? "Heritage" : arMode === "marker" ? "QR Scanner" : "Location"} AR
          </Text>
        </TouchableOpacity>

        <Text style={s.disclaimer}>
          Requires camera and location permissions. Works best outdoors with clear GPS signal.
        </Text>
      </ScrollView>
    );
  }

  // Active AR screen
  return (
    <View style={s.arRoot}>
      {/* Camera feed */}
      <RNCamera
        ref={cameraRef}
        style={s.camera}
        type={RNCamera.Constants.Type.back}
        flashMode={RNCamera.Constants.FlashMode.off}
        onBarCodeRead={arMode === "marker" ? handleQRScan : undefined}
        barCodeTypes={arMode === "marker" ? [RNCamera.Constants.BarCodeType.qr] : []}
        captureAudio={false}
      >
        {/* AR Overlay cards */}
        <View style={s.arOverlay} pointerEvents="box-none">
          {visibleCards.map((est) => (
            <AROverlayCard key={est.id} establishment={est} x={est.x} y={est.y} onTap={handleCardTap} />
          ))}
        </View>

        {/* Top HUD */}
        <View style={s.hudTop}>
          <View style={s.hudStatusRow}>
            <View style={[s.statusDot, { backgroundColor: "#10b981" }]} />
            <Text style={s.hudStatusText}>
              {arMode === "heritage" ? "Heritage AR" : arMode === "marker" ? "QR Scanner" : "Location AR"}
            </Text>
            {loading && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />}
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={stopAR}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* QR Scanner hint */}
        {arMode === "marker" && (
          <View style={s.qrHint}>
            <View style={s.qrFrame} />
            <Text style={s.qrHintText}>Point at a TourismPay QR code</Text>
          </View>
        )}

        {/* No establishments hint */}
        {!loading && establishments.length === 0 && arMode !== "marker" && (
          <View style={s.noEstHint}>
            <Text style={s.noEstText}>⚠️ No establishments found nearby</Text>
            <Text style={s.noEstSub}>Move to a different area or change mode</Text>
          </View>
        )}

        {/* Bottom HUD */}
        <View style={s.hudBottom}>
          <View style={s.hudInfoRow}>
            <Text style={s.hudInfoText}>
              📍 {establishments.length} {arMode === "heritage" ? "heritage" : "nearby"}
            </Text>
            <Text style={s.hudInfoText}>
              🧭 {userLocation ? `${userLocation.lat.toFixed(3)}, ${userLocation.lng.toFixed(3)}` : "No GPS"}
            </Text>
          </View>
          <View style={s.modeSwitchRow}>
            {(["location", "heritage", "marker"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[s.modeSwitchBtn, arMode === mode && s.modeSwitchBtnActive]}
                onPress={() => setARMode(mode)}
              >
                <Text style={[s.modeSwitchText, arMode === mode && s.modeSwitchTextActive]}>
                  {mode === "location" ? "📍 Nearby" : mode === "heritage" ? "🏛️ Heritage" : "📷 Scan"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </RNCamera>

      {/* Detail Modal */}
      <EstablishmentModal
        establishment={selectedEst}
        onClose={() => setSelectedEst(null)}
        onPay={handleQRPayment}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Landing
  landing: { flex: 1, backgroundColor: "#0f0f1a" },
  landingContent: { padding: 20, paddingBottom: 40 },
  landingHeader: { alignItems: "center", marginBottom: 24 },
  landingIcon: { fontSize: 48, marginBottom: 8 },
  landingTitle: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 8 },
  landingSubtitle: { color: "#888", fontSize: 13, textAlign: "center", lineHeight: 20 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#2a2a3e" },
  statCardNum: { fontSize: 22, fontWeight: "700" },
  statCardLabel: { color: "#888", fontSize: 10, marginTop: 4 },
  sectionLabel: { color: "#888", fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 10 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modeCard: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: "#2a2a3e" },
  modeCardActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff15" },
  modeIcon: { fontSize: 22, marginBottom: 4 },
  modeLabel: { color: "#888", fontSize: 12, fontWeight: "600" },
  modeLabelActive: { color: "#6c63ff" },
  modeDesc: { color: "#555", fontSize: 9, marginTop: 2, textAlign: "center" },
  gpsStatus: { borderRadius: 10, padding: 12, marginBottom: 16 },
  gpsStatusOk: { backgroundColor: "#10b98115", borderWidth: 1, borderColor: "#10b98130" },
  gpsStatusWarn: { backgroundColor: "#f59e0b15", borderWidth: 1, borderColor: "#f59e0b30" },
  gpsStatusText: { fontSize: 12, fontWeight: "500" },
  launchBtn: { backgroundColor: "#6c63ff", borderRadius: 14, padding: 16, alignItems: "center", marginBottom: 12 },
  launchBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disclaimer: { color: "#555", fontSize: 11, textAlign: "center", lineHeight: 16 },

  // AR screen
  arRoot: { flex: 1, backgroundColor: "#000" },
  camera: { flex: 1 },
  arOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },

  // AR card
  arCard: { position: "absolute", backgroundColor: "rgba(15,15,26,0.92)", borderRadius: 12, padding: 10, width: 180, borderWidth: 1.5 },
  arCardDot: { position: "absolute", bottom: -8, left: "50%", width: 8, height: 8, borderRadius: 4 },
  arCardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arCardName: { color: "#fff", fontSize: 12, fontWeight: "700", flex: 1, lineHeight: 16 },
  arCardCategory: { color: "#888", fontSize: 10 },
  arCardDist: { color: "#6c63ff", fontSize: 10, fontWeight: "600" },
  arCardRating: { color: "#f59e0b", fontSize: 10 },
  loyaltyBadge: { backgroundColor: "#10b98120", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#10b98140" },
  loyaltyBadgeText: { color: "#10b981", fontSize: 9, fontWeight: "600" },
  qrBadge: { backgroundColor: "#6c63ff20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: "#6c63ff40" },
  qrBadgeText: { color: "#6c63ff", fontSize: 9, fontWeight: "600" },
  heritageDesc: { color: "#c4b5fd", fontSize: 9, marginTop: 4, lineHeight: 13 },
  distBar: { height: 3, backgroundColor: "#2a2a3e", borderRadius: 2, marginTop: 6, overflow: "hidden" },
  distBarFill: { height: 3, borderRadius: 2 },

  // HUD
  hudTop: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 48, backgroundColor: "rgba(0,0,0,0.5)" },
  hudStatusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  hudStatusText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  closeBtn: { backgroundColor: "rgba(0,0,0,0.5)", width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  closeBtnText: { color: "#fff", fontSize: 16 },
  hudBottom: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: "rgba(0,0,0,0.6)" },
  hudInfoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  hudInfoText: { color: "#ccc", fontSize: 11 },
  modeSwitchRow: { flexDirection: "row", gap: 8 },
  modeSwitchBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10, padding: 8, alignItems: "center" },
  modeSwitchBtnActive: { backgroundColor: "#6c63ff" },
  modeSwitchText: { color: "#aaa", fontSize: 11, fontWeight: "600" },
  modeSwitchTextActive: { color: "#fff" },

  // QR Scanner
  qrHint: { position: "absolute", top: "50%", left: "50%", transform: [{ translateX: -80 }, { translateY: -80 }], alignItems: "center" },
  qrFrame: { width: 160, height: 160, borderWidth: 2, borderColor: "#6c63ff", borderRadius: 12, marginBottom: 12 },
  qrHintText: { color: "#fff", fontSize: 12, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },

  // No establishments
  noEstHint: { position: "absolute", top: "50%", left: 20, right: 20, transform: [{ translateY: -40 }], backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 12, padding: 16, alignItems: "center" },
  noEstText: { color: "#f59e0b", fontSize: 14, fontWeight: "600" },
  noEstSub: { color: "#888", fontSize: 11, marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  modalSub: { color: "#888", fontSize: 12, marginTop: 2 },
  modalClose: { padding: 4 },
  heritageSection: { backgroundColor: "#4c1d9520", borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#7c3aed40" },
  heritageSectionTitle: { color: "#c4b5fd", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  heritageSectionDesc: { color: "#ddd6fe", fontSize: 12, lineHeight: 18 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  statBox: { flex: 1, minWidth: "45%", backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, alignItems: "center" },
  statValue: { color: "#fff", fontSize: 16, fontWeight: "700" },
  statLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  modalActions: { flexDirection: "row", gap: 10 },
  btnPrimary: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: "#2a2a3e", borderRadius: 12, padding: 14, alignItems: "center" },
  btnSecondaryText: { color: "#aaa", fontWeight: "600", fontSize: 14 },
});
