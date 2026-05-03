import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl,
  SafeAreaView, TextInput, Alert, FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import StatusBadge from "../../components/StatusBadge";
import { api, type Itinerary } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function ItineraryScreen() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", destination: "", startDate: "", endDate: "" });

  const load = async () => {
    try {
      const data = await api.getItineraries();
      if (Array.isArray(data)) setItineraries(data);
    } catch { /* offline */ }
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleCreate = async () => {
    if (!form.name || !form.destination) { Alert.alert("Error", "Fill in name and destination"); return; }
    try {
      await api.createItinerary(form);
      setShowCreate(false);
      setForm({ name: "", destination: "", startDate: "", endDate: "" });
      load();
    } catch { Alert.alert("Error", "Could not create itinerary"); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trip Itineraries</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(!showCreate)}>
          <Ionicons name={showCreate ? "close" : "add"} size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showCreate && (
        <Card>
          <Text style={styles.formTitle}>New Itinerary</Text>
          {(["name", "destination", "startDate", "endDate"] as const).map((field) => (
            <TextInput
              key={field}
              style={styles.input}
              placeholder={field === "startDate" ? "Start Date (YYYY-MM-DD)" : field === "endDate" ? "End Date (YYYY-MM-DD)" : field.charAt(0).toUpperCase() + field.slice(1)}
              placeholderTextColor={colors.textMuted}
              value={form[field]}
              onChangeText={(val) => setForm({ ...form, [field]: val })}
            />
          ))}
          <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
            <Text style={styles.createText}>Create Itinerary</Text>
          </TouchableOpacity>
        </Card>
      )}

      <FlatList
        data={itineraries}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDest}>{item.destination}</Text>
                <Text style={styles.itemDate}>{item.startDate} → {item.endDate}</Text>
              </View>
              <StatusBadge status={`${item.activities.length} stops`} variant="info" />
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No itineraries yet. Create one to start planning!</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold" },
  addBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.full, width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  formTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600", marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  createBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  createText: { color: colors.white, fontWeight: "600" },
  list: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center" },
  itemName: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  itemDest: { color: colors.textSecondary, fontSize: fontSize.md },
  itemDate: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
