import React, { useState } from "react";
import { View, Text, SafeAreaView, ScrollView, StyleSheet, Switch } from "react-native";
import Card from "../../components/Card";
import { colors, spacing, fontSize } from "../../theme";

const PREFS = [
  { key: "payments", label: "Payment Notifications", desc: "Receive alerts for payments" },
  { key: "bookings", label: "Booking Updates", desc: "New bookings and changes" },
  { key: "promotions", label: "Promotions & Offers", desc: "Deals and discounts" },
  { key: "security", label: "Security Alerts", desc: "Login attempts and suspicious activity" },
  { key: "settlement", label: "Settlement Updates", desc: "Payout processing status" },
  { key: "compliance", label: "Compliance Notifications", desc: "KYB review status changes" },
] as const;

export default function NotificationPrefsScreen() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    payments: true, bookings: true, promotions: false,
    security: true, settlement: true, compliance: true,
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card>
          <Text style={styles.section}>Notifications</Text>
          {PREFS.map((p) => (
            <View key={p.key} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{p.label}</Text>
                <Text style={styles.desc}>{p.desc}</Text>
              </View>
              <Switch value={prefs[p.key] ?? false}
                onValueChange={(v) => setPrefs({ ...prefs, [p.key]: v })}
                trackColor={{ true: colors.primary }} />
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  section: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "600", marginBottom: spacing.md, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.text, fontSize: fontSize.md, fontWeight: "600" },
  desc: { color: colors.textMuted, fontSize: fontSize.sm },
});
