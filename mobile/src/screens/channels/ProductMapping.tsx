/**
 * Product Mapping — Map local products to GDS/OTA channel room type and rate plan codes.
 */
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

export function ProductMapping() {
  return (
    <ScrollView style={s.container}>
      <Text style={s.desc}>Map your products to channel-specific codes so GDS/OTA platforms can display them correctly.</Text>

      {/* Channel Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.channelRow}>
        {["Sabre", "Amadeus", "Expedia", "Booking.com", "Little Emperors", "Travelport"].map((ch) => (
          <TouchableOpacity key={ch} style={s.channelPill}>
            <Text style={s.channelText}>{ch}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Mapping Guide */}
      <View style={s.guideCard}>
        <Text style={s.guideTitle}>How Mapping Works</Text>
        <Text style={s.guideText}>1. Select a channel above</Text>
        <Text style={s.guideText}>2. Choose a product from your catalog</Text>
        <Text style={s.guideText}>3. Enter the channel's room type code (e.g., STD, DLX, STE)</Text>
        <Text style={s.guideText}>4. Optionally set a rate plan code (e.g., BAR, PROMO)</Text>
      </View>

      {/* Empty Mappings */}
      <Text style={s.section}>Current Mappings</Text>
      <View style={s.empty}>
        <Text style={s.emptyEmoji}>🔗</Text>
        <Text style={s.emptyTitle}>No mappings configured</Text>
        <Text style={s.emptySubtext}>Connect a channel and map your products to start distributing</Text>
      </View>

      <TouchableOpacity style={s.addBtn}>
        <Text style={s.addBtnText}>+ Add Product Mapping</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  desc: { color: "#888", fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 16 },
  channelRow: { marginBottom: 16, maxHeight: 36 },
  channelPill: { backgroundColor: "#1a1a2e", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, marginRight: 8 },
  channelText: { color: "#ccc", fontSize: 12 },
  guideCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: "#6c63ff30" },
  guideTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 8 },
  guideText: { color: "#888", fontSize: 12, lineHeight: 22 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  empty: { alignItems: "center", marginTop: 20 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  addBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
