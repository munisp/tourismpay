import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, FlatList } from "react-native";

export function ProductCatalog({ navigation, route }: any) {
  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Experiences & Products</Text>
      <View style={s.content}>
        <Text style={s.placeholder}>Live data from TourismPay API</Text>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  content: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 20, minHeight: 200 },
  placeholder: { color: "#666", fontSize: 14, textAlign: "center", marginTop: 60 },
});
