/**
 * Tourist Home — discover experiences with real data from API, search, and map integration.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, ActivityIndicator,
} from "react-native";
import { touristAPI, Experience } from "../../services/api";

export function TouristHome({ navigation }: any) {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = [
    { emoji: "🏨", label: "Hotels" },
    { emoji: "🎯", label: "Activities" },
    { emoji: "🍽️", label: "Dining" },
    { emoji: "🚐", label: "Transport" },
    { emoji: "🏖️", label: "Beach" },
    { emoji: "🦁", label: "Safari" },
  ];

  const loadExperiences = useCallback(async (category?: string) => {
    try {
      const data = await touristAPI.discoverExperiences({
        category: category ?? undefined,
        limit: 20,
      });
      setExperiences(data);
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadExperiences(); }, [loadExperiences]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExperiences(activeCategory ?? undefined);
    setRefreshing(false);
  };

  const handleCategoryPress = (label: string) => {
    const newCategory = activeCategory === label ? null : label;
    setActiveCategory(newCategory);
    setLoading(true);
    loadExperiences(newCategory ?? undefined);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const results = await touristAPI.searchDestinations(searchQuery);
      setExperiences(results.map(r => ({
        id: r.id,
        name: r.name,
        category: r.type,
        price: 0,
        currency: "USD",
        rating: r.rating ?? 0,
        reviewCount: 0,
        location: r.location,
      })));
    } catch {
      // Keep existing results
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}
    >
      <Text style={s.title}>Discover Africa</Text>
      <Text style={s.subtitle}>Find amazing experiences across the continent</Text>

      {/* Search Bar */}
      <View style={s.searchBar}>
        <TextInput
          style={s.searchInput}
          placeholder="Search destinations, activities..."
          placeholderTextColor="#666"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
      </View>

      {/* Categories */}
      <Text style={s.section}>Categories</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.label}
            style={[s.catCard, activeCategory === cat.label && s.catActive]}
            onPress={() => handleCategoryPress(cat.label)}
          >
            <Text style={s.catEmoji}>{cat.emoji}</Text>
            <Text style={[s.catLabel, activeCategory === cat.label && s.catLabelActive]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Experiences */}
      <Text style={s.section}>
        {activeCategory ? `${activeCategory}` : "Featured Experiences"}
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#6c63ff" style={{ marginTop: 20 }} />
      ) : experiences.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>🔍</Text>
          <Text style={s.emptyText}>No experiences found</Text>
          <Text style={s.emptySubtext}>Try a different category or search term</Text>
        </View>
      ) : (
        experiences.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={s.featCard}
            onPress={() => navigation.navigate("Catalog", { experienceId: item.id })}
          >
            <View style={s.featImage}>
              <Text style={s.featEmoji}>
                {item.category === "Hotels" ? "🏨" :
                 item.category === "Dining" ? "🍽️" :
                 item.category === "Safari" ? "🦁" :
                 item.category === "Beach" ? "🏖️" : "🎯"}
              </Text>
            </View>
            <View style={s.featInfo}>
              <Text style={s.featTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={s.featLocation} numberOfLines={1}>{item.location}</Text>
              <View style={s.featMeta}>
                {item.price > 0 && <Text style={s.featPrice}>From {item.currency} {item.price}</Text>}
                {item.rating > 0 && <Text style={s.featRating}>⭐ {item.rating.toFixed(1)}</Text>}
                {item.reviewCount > 0 && <Text style={s.featReviews}>({item.reviewCount})</Text>}
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginTop: 12 },
  subtitle: { fontSize: 14, color: "#888", marginTop: 4, marginBottom: 16 },
  searchBar: { marginBottom: 20 },
  searchInput: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, color: "#fff", fontSize: 14 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 20, marginBottom: 12 },
  catScroll: { marginBottom: 8 },
  catCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginRight: 10, alignItems: "center", width: 90 },
  catActive: { backgroundColor: "#6c63ff20", borderWidth: 1, borderColor: "#6c63ff" },
  catEmoji: { fontSize: 28 },
  catLabel: { fontSize: 12, color: "#fff", marginTop: 6, fontWeight: "500" },
  catLabelActive: { color: "#6c63ff" },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4 },
  featCard: { flexDirection: "row", backgroundColor: "#1a1a2e", borderRadius: 12, marginBottom: 10, overflow: "hidden" },
  featImage: { width: 80, height: 80, backgroundColor: "#2d2d44", alignItems: "center", justifyContent: "center" },
  featEmoji: { fontSize: 30 },
  featInfo: { flex: 1, padding: 12, justifyContent: "center" },
  featTitle: { fontSize: 14, fontWeight: "600", color: "#fff" },
  featLocation: { fontSize: 11, color: "#888", marginTop: 2 },
  featMeta: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 },
  featPrice: { fontSize: 12, color: "#6c63ff" },
  featRating: { fontSize: 11, color: "#fbbf24" },
  featReviews: { fontSize: 10, color: "#888" },
});
