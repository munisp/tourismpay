/**
 * MoreHomeScreen — Navigation hub for all additional features.
 * Role-aware: shows relevant sections based on user role.
 */
import React from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from "react-native";
import { useApiData } from "../hooks/useApiData";
import { useAuth } from "../hooks/useAuth";

interface NavItem {
  label: string;
  screen: string;
  icon: string;
  roles?: string[];
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Tourist",
    items: [
      { label: "Discover Experiences", screen: "TouristExperience", icon: "🌍", roles: ["tourist", "admin"] },
      { label: "Local Payments", screen: "LocalPayments", icon: "💳", roles: ["tourist", "admin"] },
      { label: "Pre-Travel Readiness", screen: "PreTravel", icon: "✈️", roles: ["tourist", "admin"] },
      { label: "Trip Planner", screen: "TripPlanner", icon: "🗺️", roles: ["tourist", "admin"] },
      { label: "Stablecoin Swap", screen: "StablecoinSwap", icon: "🔄", roles: ["tourist", "admin"] },
      { label: "Tipping & Tax", screen: "TippingTax", icon: "💰", roles: ["tourist", "merchant", "admin"] },
      { label: "AI Co-Pilot", screen: "Copilot", icon: "🤖", roles: ["tourist", "admin"] },
      { label: "AR Tourism", screen: "ARTourism", icon: "🥽", roles: ["tourist", "admin"] },
      { label: "Wallet Tools", screen: "WalletExtras", icon: "🔧", roles: ["tourist", "admin"] },
    ],
  },
  {
    title: "Compliance & Security",
    items: [
      { label: "Compliance Dashboard", screen: "Compliance", icon: "✅", roles: ["admin", "compliance_officer"] },
      { label: "Fraud Monitor", screen: "FraudMonitor", icon: "🛡️", roles: ["admin", "compliance_officer", "bis_analyst"] },
      { label: "SOC Dashboard", screen: "SOCDashboard", icon: "🔐", roles: ["admin", "noc_operator"] },
      { label: "BIS Dashboard", screen: "BISDashboard", icon: "🔍", roles: ["admin", "bis_analyst"] },
      { label: "New Investigation", screen: "NewBISInvestigation", icon: "📋", roles: ["admin", "bis_analyst"] },
      { label: "BIS Queue", screen: "BISQueue", icon: "📂", roles: ["admin", "bis_analyst"] },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "ML Services", screen: "MLServices", icon: "🧠", roles: ["admin"] },
      { label: "BIS Settings", screen: "BISSettings", icon: "⚙️", roles: ["admin"] },
      { label: "HA Status", screen: "HAStatus", icon: "🔄", roles: ["admin", "noc_operator"] },
      { label: "API Health", screen: "ApiHealth", icon: "🌐", roles: ["admin", "noc_operator"] },
      { label: "Loyalty Admin", screen: "LoyaltyAdmin", icon: "🏆", roles: ["admin"] },
      { label: "Provider Onboarding", screen: "ProviderOnboarding", icon: "🏢", roles: ["admin"] },
      { label: "KYB Documents", screen: "KYBDocuments", icon: "📄", roles: ["admin", "compliance_officer"] },
      { label: "Analytics", screen: "Analytics", icon: "📊", roles: ["admin", "compliance_officer", "noc_operator"] },
    ],
  },
  {
    title: "Finance & Settlement",
    items: [
      { label: "Settlement Console", screen: "Settlement", icon: "💹", roles: ["admin", "settlement_officer"] },
      { label: "Africa Registry", screen: "AfricaRegistry", icon: "🌍", roles: ["admin", "compliance_officer"] },
      { label: "KYB Onboarding", screen: "KYBOnboarding", icon: "📝", roles: ["admin", "compliance_officer"] },
      { label: "Sustainability", screen: "Sustainability", icon: "🌱", roles: ["tourist", "admin"] },
      { label: "Mesh Payments", screen: "MeshPayments", icon: "🕸️", roles: ["admin"] },
    ],
  },
  {
    title: "Settings",
    items: [
      { label: "Profile", screen: "Profile", icon: "👤" },
      { label: "Notifications", screen: "Notifications", icon: "🔔" },
      { label: "Notification Settings", screen: "NotificationSettings", icon: "⚙️" },
      { label: "Privacy Settings", screen: "PrivacySettings", icon: "🔒" },
      { label: "Biometric Auth", screen: "BiometricSettings", icon: "🔑" },
      { label: "Two-Factor Auth", screen: "TwoFactor", icon: "📱" },
    ],
  },
];

export function MoreHomeScreen({ navigation }: any) {
  const { user } = useAuth();
  const role = (user as any)?.role ?? "tourist";

  const { data, loading, error, refresh, refreshing } = useApiData<any>({
    endpoint: "auth.getProfile",
    defaultValue: { name: "", email: "", role: "" },
  });

  if (loading && !error) return (
    <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>
  );

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#6c63ff" />}
    >
      <View style={s.profileCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{((data?.name ?? "U") as string)[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.profileName}>{data?.name ?? "User"}</Text>
          <Text style={s.profileEmail}>{data?.email ?? ""}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleText}>{String(role).replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}</Text>
          </View>
        </View>
      </View>

      {NAV_SECTIONS.map((section) => {
        const visibleItems = section.items.filter(
          (item) => !item.roles || item.roles.includes(role)
        );
        if (visibleItems.length === 0) return null;
        return (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {visibleItems.map((item) => (
              <TouchableOpacity
                key={item.screen}
                style={s.navItem}
                onPress={() => navigation.navigate(item.screen)}
              >
                <Text style={s.navIcon}>{item.icon}</Text>
                <Text style={s.navLabel}>{item.label}</Text>
                <Text style={s.navArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: "#1a1a2e", borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: "#6c63ff30",
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "#6c63ff", alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  profileName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  profileEmail: { color: "#888", fontSize: 12, marginTop: 2 },
  roleBadge: {
    marginTop: 6, backgroundColor: "#6c63ff20", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start",
  },
  roleText: { color: "#6c63ff", fontSize: 11, fontWeight: "600" },
  section: { marginBottom: 20 },
  sectionTitle: { color: "#888", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" },
  navItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 6,
  },
  navIcon: { fontSize: 20, width: 28, textAlign: "center" },
  navLabel: { flex: 1, color: "#e5e7eb", fontSize: 14, fontWeight: "500" },
  navArrow: { color: "#444", fontSize: 20 },
});
