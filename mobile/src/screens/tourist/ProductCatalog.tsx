/**
 * ProductCatalog — Experience detail and booking from tRPC API.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { touristAPI } from "../../services/api";
import { offlineManager } from "../../services/offline";

export function ProductCatalog({ route, navigation }: any) {
  const { token, experienceId } = route.params ?? {};
  const [experience, setExperience] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  const loadData = useCallback(async () => {
    try {
      if (experienceId) {
        const data = await touristAPI.getEstablishmentDetail(experienceId);
        setExperience(data);
      }
    } catch {} finally { setLoading(false); }
  }, [experienceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBook = async () => {
    if (!experience) return;
    setBooking(true);
    try {
      const bookingData = { establishmentId: experience.id, productId: experience.id, date: new Date().toISOString(), guests: 1 };
      if (offlineManager.getConnectionStatus()) {
        await touristAPI.createBooking(bookingData);
        Alert.alert("Booked!", "Your booking is confirmed", [{ text: "OK", onPress: () => navigation.navigate("Itinerary") }]);
      } else {
        await offlineManager.enqueue("tourist.createBooking", "POST", bookingData);
        Alert.alert("Queued", "Booking will be confirmed when online");
      }
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Booking failed");
    } finally { setBooking(false); }
  };

  if (loading) return <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}><ActivityIndicator size="large" color="#6c63ff" /></View>;
  if (!experience) return <View style={s.container}><Text style={s.emptyText}>Experience not found</Text></View>;

  return (
    <ScrollView style={s.container}>
      <View style={s.imageArea}><Text style={s.imageEmoji}>{experience.emoji ?? "🏖"}</Text></View>
      <View style={s.content}>
        <Text style={s.name}>{experience.name}</Text>
        <View style={s.metaRow}>
          <Text style={s.rating}>★ {experience.rating?.toFixed(1) ?? "4.5"}</Text>
          <Text style={s.category}>{experience.category}</Text>
          <Text style={s.location}>{experience.location ?? experience.city}</Text>
        </View>
        <Text style={s.description}>{experience.description}</Text>
        <View style={s.priceRow}>
          <Text style={s.priceLabel}>From</Text>
          <Text style={s.price}>${experience.price?.toFixed(2) ?? "0"}</Text>
          <Text style={s.priceUnit}>/ person</Text>
        </View>

        {experience.amenities && experience.amenities.length > 0 && (
          <View style={s.amenities}>
            <Text style={s.sectionTitle}>Amenities</Text>
            <View style={s.amenityRow}>
              {experience.amenities.map((a: string, i: number) => (
                <View key={i} style={s.amenityChip}><Text style={s.amenityText}>{a}</Text></View>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity style={s.bookBtn} onPress={handleBook} disabled={booking}>
          <Text style={s.bookBtnText}>{booking ? "Booking..." : "Book Now"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  imageArea: { height: 200, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" },
  imageEmoji: { fontSize: 60 },
  content: { padding: 16 },
  name: { color: "#fff", fontSize: 22, fontWeight: "700" },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  rating: { color: "#f59e0b", fontSize: 13, fontWeight: "600" },
  category: { color: "#6c63ff", fontSize: 12 },
  location: { color: "#888", fontSize: 12 },
  description: { color: "#ccc", fontSize: 13, lineHeight: 20, marginTop: 16 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 20 },
  priceLabel: { color: "#888", fontSize: 12 },
  price: { color: "#fff", fontSize: 24, fontWeight: "700" },
  priceUnit: { color: "#888", fontSize: 12 },
  amenities: { marginTop: 20 },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  amenityRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  amenityChip: { backgroundColor: "#1a1a2e", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  amenityText: { color: "#888", fontSize: 11 },
  bookBtn: { backgroundColor: "#6c63ff", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  bookBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  emptyText: { color: "#888", fontSize: 14, textAlign: "center", marginTop: 60 },
});
