import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, SafeAreaView, TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

interface ARExperience {
  id: string;
  name: string;
  description: string;
  category: string;
  country: string;
  city: string;
  difficulty: string;
  duration: number;
}

const categoryIcons: Record<string, string> = {
  landmark: "location",
  cultural_site: "color-palette",
  heritage_trail: "walk",
  wildlife: "paw",
  market: "storefront",
  restaurant: "restaurant",
};

export default function ARTourismScreen() {
  const [experiences, setExperiences] = useState<ARExperience[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const categories = ["all", "landmark", "cultural_site", "heritage_trail", "wildlife", "market"];

  const load = async () => {
    try {
      const data = await api.trpcQuery("arTourism.list");
      setExperiences(((data as Record<string, unknown>)?.experiences as ARExperience[]) || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = category === "all" ? experiences : experiences.filter((e) => e.category === category);

  const difficultyColor = (d: string) =>
    d === "easy" ? colors.success : d === "moderate" ? colors.warning : colors.error;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.title}>AR Tourism</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                {cat === "all" ? "All" : cat.replace(/_/g, " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filtered.length === 0 && <Text style={styles.emptyText}>No AR experiences found</Text>}
        {filtered.map((exp) => (
          <Card key={exp.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Ionicons name={(categoryIcons[exp.category] || "compass") as any} size={28} color={colors.primary} />
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.expName}>{exp.name}</Text>
                <Text style={styles.expLocation}>{exp.city}, {exp.country}</Text>
              </View>
              <View style={[styles.durationBadge]}>
                <Text style={styles.durationText}>{exp.duration} min</Text>
              </View>
            </View>
            <Text style={styles.description}>{exp.description}</Text>
            <View style={styles.cardFooter}>
              <View style={[styles.difficultyBadge, { backgroundColor: difficultyColor(exp.difficulty) + "22" }]}>
                <Text style={[styles.difficultyText, { color: difficultyColor(exp.difficulty) }]}>{exp.difficulty}</Text>
              </View>
              <TouchableOpacity style={styles.startButton} onPress={() => startExperience(exp.id)}>
                <Ionicons name="cube-outline" size={16} color="#fff" />
                <Text style={styles.startButtonText}>Start AR</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

async function startExperience(id: string) {
  try {
    await api.trpcMutation("arTourism.startExperience", { experienceId: id, deviceType: "arcore" });
  } catch { /* ignore */ }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: fontSize.xl, fontWeight: "700", padding: spacing.md, color: colors.text },
  chipRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.textSecondary, textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  card: { marginHorizontal: spacing.md, marginTop: spacing.sm, padding: spacing.md },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, marginLeft: spacing.sm },
  expName: { fontSize: fontSize.md, fontWeight: "600", color: colors.text },
  expLocation: { fontSize: fontSize.sm, color: colors.textSecondary },
  durationBadge: { backgroundColor: colors.info + "22", paddingHorizontal: 8, paddingVertical: 4, borderRadius: borderRadius.sm },
  durationText: { fontSize: fontSize.xs, color: colors.info, fontWeight: "600" },
  description: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 },
  cardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  difficultyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: borderRadius.sm },
  difficultyText: { fontSize: fontSize.xs, fontWeight: "600", textTransform: "capitalize" },
  startButton: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: borderRadius.md, gap: 4 },
  startButtonText: { color: "#fff", fontSize: fontSize.sm, fontWeight: "600" },
  emptyText: { textAlign: "center", padding: spacing.xl, color: colors.textSecondary },
});
