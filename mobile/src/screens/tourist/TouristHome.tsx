import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from "react-native";

export function TouristHome({ navigation }: any) {
  const categories = [
    { emoji: "🏨", label: "Hotels", count: 245 },
    { emoji: "🎯", label: "Activities", count: 180 },
    { emoji: "🍽️", label: "Dining", count: 320 },
    { emoji: "🚐", label: "Transport", count: 95 },
    { emoji: "🏖️", label: "Beach", count: 67 },
    { emoji: "🦁", label: "Safari", count: 42 },
  ];

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Discover Africa</Text>
      <Text style={s.subtitle}>Find amazing experiences across the continent</Text>

      {/* Search Bar */}
      <TouchableOpacity style={s.searchBar}>
        <Text style={s.searchText}>🔍 Search destinations, activities...</Text>
      </TouchableOpacity>

      {/* Categories */}
      <Text style={s.section}>Categories</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
        {categories.map((cat) => (
          <TouchableOpacity key={cat.label} style={s.catCard}>
            <Text style={s.catEmoji}>{cat.emoji}</Text>
            <Text style={s.catLabel}>{cat.label}</Text>
            <Text style={s.catCount}>{cat.count}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Featured */}
      <Text style={s.section}>Featured Experiences</Text>
      {[
        { name: "Safari at Masai Mara", emoji: "🦁", price: "$280/night", rating: "4.9" },
        { name: "Cape Town Wine Tour", emoji: "🍷", price: "$95/person", rating: "4.8" },
        { name: "Zanzibar Beach Resort", emoji: "🏖️", price: "$180/night", rating: "4.7" },
        { name: "Victoria Falls Adventure", emoji: "🌊", price: "$150/person", rating: "4.9" },
      ].map((item) => (
        <TouchableOpacity key={item.name} style={s.featCard}>
          <View style={s.featImage}><Text style={s.featEmoji}>{item.emoji}</Text></View>
          <View style={s.featInfo}>
            <Text style={s.featTitle}>{item.name}</Text>
            <View style={s.featMeta}>
              <Text style={s.featPrice}>From {item.price}</Text>
              <Text style={s.featRating}>⭐ {item.rating}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginTop: 12 },
  subtitle: { fontSize: 14, color: "#888", marginTop: 4, marginBottom: 16 },
  searchBar: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 20 },
  searchText: { color: "#666", fontSize: 14 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 20, marginBottom: 12 },
  catScroll: { marginBottom: 8 },
  catCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginRight: 10, alignItems: "center", width: 90 },
  catEmoji: { fontSize: 28 },
  catLabel: { fontSize: 12, color: "#fff", marginTop: 6, fontWeight: "500" },
  catCount: { fontSize: 10, color: "#888", marginTop: 2 },
  featCard: { flexDirection: "row", backgroundColor: "#1a1a2e", borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  featImage: { width: 80, height: 80, backgroundColor: "#2d2d44", alignItems: "center", justifyContent: "center" },
  featEmoji: { fontSize: 30 },
  featInfo: { flex: 1, padding: 12, justifyContent: "center" },
  featTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  featMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 },
  featPrice: { fontSize: 12, color: "#6c63ff" },
  featRating: { fontSize: 11, color: "#fbbf24" },
});
