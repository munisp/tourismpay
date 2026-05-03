import React, { useState, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, RefreshControl, SafeAreaView,
  TouchableOpacity, TextInput, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { api, type QRCode } from "../../services/api";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

export default function QRCodesScreen() {
  const [codes, setCodes] = useState<QRCode[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const load = async () => {
    try { const data = await api.getMerchantQRCodes(); if (Array.isArray(data)) setCodes(data); } catch {}
  };
  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleGenerate = async () => {
    if (!amount) { Alert.alert("Error", "Enter an amount"); return; }
    try {
      await api.generateQRCode({ amount: parseFloat(amount), currency: "USD", description });
      setShowCreate(false); setAmount(""); setDescription(""); load();
    } catch { Alert.alert("Error", "Could not generate QR code"); }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>QR Codes</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowCreate(!showCreate)}>
          <Ionicons name={showCreate ? "close" : "add"} size={24} color={colors.white} />
        </TouchableOpacity>
      </View>

      {showCreate && (
        <Card>
          <TextInput style={styles.input} placeholder="Amount (USD)" placeholderTextColor={colors.textMuted}
            value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
          <TextInput style={styles.input} placeholder="Description (optional)" placeholderTextColor={colors.textMuted}
            value={description} onChangeText={setDescription} />
          <TouchableOpacity style={styles.genBtn} onPress={handleGenerate}>
            <Ionicons name="qr-code" size={20} color={colors.white} />
            <Text style={styles.genText}>Generate QR Code</Text>
          </TouchableOpacity>
        </Card>
      )}

      <FlatList
        data={codes}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <Ionicons name="qr-code" size={40} color={colors.primary} />
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.codeAmount}>{item.currency} {item.amount.toFixed(2)}</Text>
                <Text style={styles.codeDate}>{item.createdAt}</Text>
              </View>
              <Text style={styles.scans}>{item.scans} scans</Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No QR codes yet</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "bold" },
  addBtn: { backgroundColor: colors.primary, borderRadius: 20, width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  genBtn: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center", justifyContent: "center" },
  genText: { color: colors.white, fontWeight: "600" },
  list: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center" },
  codeAmount: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600" },
  codeDate: { color: colors.textMuted, fontSize: fontSize.sm },
  scans: { color: colors.textSecondary, fontSize: fontSize.md },
  empty: { color: colors.textMuted, textAlign: "center", padding: spacing.xl },
});
