import React, { useState, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView,
  TextInput, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type Experience } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function ExperiencesScreen() {
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const data = await api.getTouristExperiences();
      if (Array.isArray(data)) setExperiences(data);
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = experiences.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Experiences</Text>
        <TextInput style={styles.searchInput} placeholder="Search experiences..."
          placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.expHeader}>
              <Text style={styles.expName}>{item.name}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={14} color={colors.warning} />
                <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
              </View>
            </View>
            <Text style={styles.expDesc} numberOfLines={2}>{item.description}</Text>
            <View style={styles.expFooter}>
              <View style={styles.locationRow}>
                <Ionicons name="location" size={14} color={colors.textMuted} />
                <Text style={styles.location}>{item.location}</Text>
              </View>
              <Text style={styles.price}>{item.currency} {item.price.toFixed(0)}</Text>
            </View>
            <TouchableOpacity style={styles.bookBtn}>
              <Text style={styles.bookText}>Book Now</Text>
            </TouchableOpacity>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No experiences found</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold", marginBottom: spacing.sm },
  searchInput: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  list: { padding: spacing.md },
  expHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  expName: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600", flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rating: { color: colors.warning, fontSize: fontSize.md, fontWeight: "600" },
  expDesc: { color: colors.textSecondary, fontSize: fontSize.md, marginVertical: spacing.xs },
  expFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  location: { color: colors.textMuted, fontSize: fontSize.sm },
  price: { color: colors.secondary, fontSize: fontSize.lg, fontWeight: "bold" },
  bookBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.sm, alignItems: "center", marginTop: spacing.sm },
  bookText: { color: colors.white, fontWeight: "600" },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
