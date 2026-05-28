import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../hooks/useAuthStore";
// API client available for badge count fetching in production
// import { api } from "../services/api";

// Auth
import LoginScreen from "../screens/auth/LoginScreen";
import SplashScreen from "../screens/auth/SplashScreen";

// Tourist
import TouristDashboard from "../screens/tourist/TouristDashboard";
import WalletScreen from "../screens/tourist/WalletScreen";
import ItineraryScreen from "../screens/tourist/ItineraryScreen";
import PaymentScreen from "../screens/tourist/PaymentScreen";
import QRScanScreen from "../screens/tourist/QRScanScreen";
import LoyaltyScreen from "../screens/tourist/LoyaltyScreen";
import CopilotScreen from "../screens/tourist/CopilotScreen";
import RemittanceScreen from "../screens/tourist/RemittanceScreen";
import ExperiencesScreen from "../screens/tourist/ExperiencesScreen";
import ARTourismScreen from "../screens/tourist/ARTourismScreen";

// Merchant
import MerchantDashboard from "../screens/merchant/MerchantDashboard";
import RevenueScreen from "../screens/merchant/RevenueScreen";
import ProductsScreen from "../screens/merchant/ProductsScreen";
import BookingsScreen from "../screens/merchant/BookingsScreen";
import QRCodesScreen from "../screens/merchant/QRCodesScreen";
import StaffScreen from "../screens/merchant/StaffScreen";
import PayoutsScreen from "../screens/merchant/PayoutsScreen";
import KYBOnboardingScreen from "../screens/merchant/KYBOnboardingScreen";

// Admin
import AdminDashboard from "../screens/admin/AdminDashboard";
import UsersScreen from "../screens/admin/UsersScreen";
import AuditLogScreen from "../screens/admin/AuditLogScreen";
import KYBReviewScreen from "../screens/admin/KYBReviewScreen";
import ServiceHealthScreen from "../screens/admin/ServiceHealthScreen";
import SettlementScreen from "../screens/admin/SettlementScreen";
import ComplianceScreen from "../screens/admin/ComplianceScreen";
import MLDashboardScreen from "../screens/admin/MLDashboardScreen";
import PaymentSwitchScreen from "../screens/admin/PaymentSwitchScreen";
import BISInvestigationScreen from "../screens/admin/BISInvestigationScreen";

// Settings & Offline
import SettingsScreen from "../screens/settings/SettingsScreen";
import SecurityScreen from "../screens/settings/SecurityScreen";
import NotificationPrefsScreen from "../screens/settings/NotificationPrefsScreen";
import OfflineQueueScreen from "../screens/offline/OfflineQueueScreen";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  MainDrawer: undefined;
  // Detail screens
  Payment: { recipientId?: string };
  QRScan: undefined;
  Copilot: undefined;
  Remittance: undefined;
  Experiences: undefined;
  ARTourism: undefined;
  KYBOnboarding: undefined;
  KYBReview: { applicationId: number };
  BISInvestigation: undefined;
  AuditLog: undefined;
  MLDashboard: undefined;
  PaymentSwitch: undefined;
  Settlement: undefined;
  // Shared
  Settings: undefined;
  Security: undefined;
  NotificationPrefs: undefined;
  OfflineQueue: undefined;
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAV ITEM CONFIG (mirrors PWA AppShell.tsx)
// ═══════════════════════════════════════════════════════════════════════════════

interface NavSection {
  title: string;
  items: NavItem[];
}

interface NavItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: string;
  roles: string[];
  badge?: string;
}

const navSections: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", icon: "grid", screen: "DashboardTab", roles: [] },
      { label: "Analytics", icon: "bar-chart", screen: "Analytics", roles: ["admin", "compliance_officer", "noc_operator"] },
    ],
  },
  {
    title: "TOURIST SERVICES",
    items: [
      { label: "Tourist Experience", icon: "compass", screen: "TouristDashboard", roles: ["tourist", "admin"] },
      { label: "Trip Itinerary", icon: "map", screen: "Itinerary", roles: ["tourist", "admin"] },
      { label: "Digital Wallet", icon: "wallet", screen: "Wallet", roles: ["tourist", "admin"] },
      { label: "Loyalty & Rewards", icon: "star", screen: "Loyalty", roles: ["tourist", "admin"] },
      { label: "AI Co-Pilot", icon: "chatbubbles", screen: "Copilot", roles: ["tourist", "admin"] },
      { label: "AR Tourism", icon: "glasses", screen: "ARTourism", roles: ["tourist", "admin"] },
      { label: "QR Scan & Pay", icon: "qr-code", screen: "QRScan", roles: ["tourist", "admin"] },
      { label: "Bookings", icon: "calendar", screen: "TouristBookings", roles: ["tourist", "admin"] },
      { label: "Remittance", icon: "send", screen: "Remittance", roles: ["tourist", "admin"] },
      { label: "Experiences", icon: "earth", screen: "Experiences", roles: ["tourist", "admin"] },
    ],
  },
  {
    title: "MERCHANT SERVICES",
    items: [
      { label: "Revenue Dashboard", icon: "trending-up", screen: "MerchantDashboard", roles: ["merchant", "admin"] },
      { label: "Product Catalog", icon: "pricetag", screen: "Products", roles: ["merchant", "admin"] },
      { label: "Booking Inbox", icon: "mail", screen: "MerchantBookings", roles: ["merchant", "admin"] },
      { label: "QR Codes", icon: "qr-code", screen: "QRCodes", roles: ["merchant", "admin"] },
      { label: "Payout History", icon: "cash", screen: "Payouts", roles: ["merchant", "admin"] },
      { label: "Staff Management", icon: "people", screen: "Staff", roles: ["merchant", "admin"] },
      { label: "Business Onboarding", icon: "business", screen: "KYBOnboarding", roles: ["merchant", "admin"] },
    ],
  },
  {
    title: "ADMINISTRATION",
    items: [
      { label: "Admin Panel", icon: "settings", screen: "AdminDashboard", roles: ["admin"] },
      { label: "Users", icon: "people-circle", screen: "Users", roles: ["admin"] },
      { label: "KYB Review", icon: "document-text", screen: "KYBReview", roles: ["admin", "compliance_officer"] },
      { label: "BIS Investigations", icon: "shield-checkmark", screen: "BISInvestigation", roles: ["admin", "bis_analyst"] },
      { label: "Settlement Console", icon: "receipt", screen: "Settlement", roles: ["admin", "settlement_officer"] },
      { label: "ML / AI Services", icon: "hardware-chip", screen: "MLDashboard", roles: ["admin"] },
      { label: "Payment Switch", icon: "swap-horizontal", screen: "PaymentSwitch", roles: ["admin", "noc_operator"] },
      { label: "Compliance", icon: "shield", screen: "Compliance", roles: ["admin", "compliance_officer"] },
      { label: "Audit Log", icon: "list", screen: "AuditLog", roles: ["admin", "compliance_officer"] },
      { label: "Service Health", icon: "pulse", screen: "ServiceHealth", roles: ["admin", "noc_operator"] },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { label: "Settings", icon: "cog", screen: "Settings", roles: [] },
      { label: "Security", icon: "finger-print", screen: "Security", roles: [] },
      { label: "Notifications", icon: "notifications", screen: "NotificationPrefs", roles: [] },
      { label: "Offline Queue", icon: "cloud-offline", screen: "OfflineQueue", roles: [] },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM DRAWER CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

function CustomDrawerContent({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const role = user?.role ?? "tourist";
  const [searchQuery, setSearchQuery] = useState("");
  const [badges, setBadges] = useState<{ kybPending: number; bisActive: number; unread: number }>({ kybPending: 0, bisActive: 0, unread: 0 });

  // Fetch live badge counts
  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const kybPending = 0; // Would come from kybApplications.stats
        const unread = 0; // Would come from notifications.unreadCount
        setBadges({ kybPending, bisActive: 0, unread });
      } catch {
        // Silently fail
      }
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 30000);
    return () => clearInterval(interval);
  }, []);

  const visibleSections = navSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.roles.length === 0) return true;
      return item.roles.includes(role);
    }),
  })).filter((section) => section.items.length > 0);

  const filteredSections = searchQuery
    ? visibleSections.map((s) => ({
        ...s,
        items: s.items.filter((i) => i.label.toLowerCase().includes(searchQuery.toLowerCase())),
      })).filter((s) => s.items.length > 0)
    : visibleSections;

  return (
    <SafeAreaView style={styles.drawerContainer}>
      {/* User header */}
      <View style={styles.drawerHeader}>
        <View style={styles.avatarRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name ?? "U")[0].toUpperCase()}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.name ?? "User"}</Text>
            <Text style={styles.userEmail}>{user?.email ?? ""}</Text>
          </View>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{role.replace(/_/g, " ").toUpperCase()}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color="#9ca3af" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search features..."
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery("")}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Navigation items */}
      <ScrollView style={styles.navScroll} showsVerticalScrollIndicator={false}>
        {filteredSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item) => {
              // Compute live badge
              let badge = item.badge;
              if (item.screen === "KYBReview" && badges.kybPending > 0) badge = String(badges.kybPending);
              if (item.screen === "NotificationPrefs" && badges.unread > 0) badge = String(badges.unread);

              return (
                <TouchableOpacity
                  key={item.screen}
                  style={styles.navItem}
                  onPress={() => navigation.navigate(item.screen)}
                >
                  <Ionicons name={item.icon} size={18} color="#6b7280" style={{ marginRight: 12 }} />
                  <Text style={styles.navItemLabel}>{item.label}</Text>
                  {badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Logout */}
      <View style={styles.drawerFooter}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            logout();
            navigation.reset({ index: 0, routes: [{ name: "Login" }] });
          }}
        >
          <Ionicons name="log-out" size={18} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB NAVIGATORS (per role)
// ═══════════════════════════════════════════════════════════════════════════════

const Stack = createNativeStackNavigator<RootStackParamList>();
const TouristTab = createBottomTabNavigator();
const MerchantTab = createBottomTabNavigator();
const AdminTab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

function TouristTabs() {
  return (
    <TouristTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Discover: "compass",
            Wallet: "wallet",
            Scan: "qr-code",
            Loyalty: "star",
            More: "ellipsis-horizontal",
          };
          return <Ionicons name={icons[route.name] ?? "help"} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#9ca3af",
        headerShown: false,
      })}
    >
      <TouristTab.Screen name="Discover" component={TouristDashboard} />
      <TouristTab.Screen name="Wallet" component={WalletScreen} />
      <TouristTab.Screen name="Scan" component={QRScanScreen} />
      <TouristTab.Screen name="Loyalty" component={LoyaltyScreen} />
      <TouristTab.Screen name="More" component={SettingsScreen} />
    </TouristTab.Navigator>
  );
}

function MerchantTabs() {
  return (
    <MerchantTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Dashboard: "stats-chart",
            Products: "pricetag",
            QRCodes: "qr-code",
            Payouts: "cash",
            More: "ellipsis-horizontal",
          };
          return <Ionicons name={icons[route.name] ?? "help"} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#9ca3af",
        headerShown: false,
      })}
    >
      <MerchantTab.Screen name="Dashboard" component={MerchantDashboard} />
      <MerchantTab.Screen name="Products" component={ProductsScreen} />
      <MerchantTab.Screen name="QRCodes" component={QRCodesScreen} />
      <MerchantTab.Screen name="Payouts" component={PayoutsScreen} />
      <MerchantTab.Screen name="More" component={SettingsScreen} />
    </MerchantTab.Navigator>
  );
}

function AdminTabs() {
  return (
    <AdminTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Overview: "grid",
            Users: "people",
            Compliance: "shield-checkmark",
            Health: "pulse",
            More: "ellipsis-horizontal",
          };
          return <Ionicons name={icons[route.name] ?? "help"} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#6366f1",
        tabBarInactiveTintColor: "#9ca3af",
        headerShown: false,
      })}
    >
      <AdminTab.Screen name="Overview" component={AdminDashboard} />
      <AdminTab.Screen name="Users" component={UsersScreen} />
      <AdminTab.Screen name="Compliance" component={ComplianceScreen} />
      <AdminTab.Screen name="Health" component={ServiceHealthScreen} />
      <AdminTab.Screen name="More" component={SettingsScreen} />
    </AdminTab.Navigator>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAWER NAVIGATOR (wraps tabs + all feature screens)
// ═══════════════════════════════════════════════════════════════════════════════

function MainDrawerNavigator() {
  const { user } = useAuthStore();
  const role = user?.role ?? "tourist";

  const TabsComponent = role === "merchant" ? MerchantTabs : role === "admin" ? AdminTabs : TouristTabs;

  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerTitle: "TourismPay",
        headerTitleStyle: { fontWeight: "600", fontSize: 16 },
        headerRight: () => <HeaderActions />,
        drawerType: "front",
        drawerStyle: { width: 300 },
      }}
    >
      <Drawer.Screen name="DashboardTab" component={TabsComponent} options={{ title: "Dashboard" }} />
      {/* Tourist screens */}
      <Drawer.Screen name="TouristDashboard" component={TouristDashboard} options={{ title: "Tourist Experience" }} />
      <Drawer.Screen name="Itinerary" component={ItineraryScreen} options={{ title: "Trip Itinerary" }} />
      <Drawer.Screen name="Wallet" component={WalletScreen} options={{ title: "Digital Wallet" }} />
      <Drawer.Screen name="Loyalty" component={LoyaltyScreen} options={{ title: "Loyalty & Rewards" }} />
      <Drawer.Screen name="Copilot" component={CopilotScreen} options={{ title: "AI Co-Pilot" }} />
      <Drawer.Screen name="ARTourism" component={ARTourismScreen} options={{ title: "AR Tourism" }} />
      <Drawer.Screen name="QRScan" component={QRScanScreen} options={{ title: "QR Scan & Pay" }} />
      <Drawer.Screen name="TouristBookings" component={ExperiencesScreen} options={{ title: "Bookings" }} />
      <Drawer.Screen name="Remittance" component={RemittanceScreen} options={{ title: "Remittance" }} />
      <Drawer.Screen name="Experiences" component={ExperiencesScreen} options={{ title: "Experiences" }} />
      {/* Merchant screens */}
      <Drawer.Screen name="MerchantDashboard" component={MerchantDashboard} options={{ title: "Revenue Dashboard" }} />
      <Drawer.Screen name="Products" component={ProductsScreen} options={{ title: "Product Catalog" }} />
      <Drawer.Screen name="MerchantBookings" component={BookingsScreen} options={{ title: "Booking Inbox" }} />
      <Drawer.Screen name="QRCodes" component={QRCodesScreen} options={{ title: "QR Codes" }} />
      <Drawer.Screen name="Payouts" component={PayoutsScreen} options={{ title: "Payout History" }} />
      <Drawer.Screen name="Staff" component={StaffScreen} options={{ title: "Staff Management" }} />
      <Drawer.Screen name="KYBOnboarding" component={KYBOnboardingScreen} options={{ title: "Business Onboarding" }} />
      {/* Admin screens */}
      <Drawer.Screen name="AdminDashboard" component={AdminDashboard} options={{ title: "Admin Panel" }} />
      <Drawer.Screen name="Users" component={UsersScreen} options={{ title: "Users" }} />
      <Drawer.Screen name="KYBReview" component={KYBReviewScreen} options={{ title: "KYB Review" }} />
      <Drawer.Screen name="BISInvestigation" component={BISInvestigationScreen} options={{ title: "BIS Investigations" }} />
      <Drawer.Screen name="Settlement" component={SettlementScreen} options={{ title: "Settlement Console" }} />
      <Drawer.Screen name="MLDashboard" component={MLDashboardScreen} options={{ title: "ML / AI Services" }} />
      <Drawer.Screen name="PaymentSwitch" component={PaymentSwitchScreen} options={{ title: "Payment Switch" }} />
      <Drawer.Screen name="Compliance" component={ComplianceScreen} options={{ title: "Compliance" }} />
      <Drawer.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} />
      <Drawer.Screen name="ServiceHealth" component={ServiceHealthScreen} options={{ title: "Service Health" }} />
      <Drawer.Screen name="Analytics" component={AdminDashboard} options={{ title: "Analytics" }} />
      {/* Settings */}
      <Drawer.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Drawer.Screen name="Security" component={SecurityScreen} options={{ title: "Security" }} />
      <Drawer.Screen name="NotificationPrefs" component={NotificationPrefsScreen} options={{ title: "Notifications" }} />
      <Drawer.Screen name="OfflineQueue" component={OfflineQueueScreen} options={{ title: "Offline Queue" }} />
    </Drawer.Navigator>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER ACTIONS (notification bell + theme)
// ═══════════════════════════════════════════════════════════════════════════════

function HeaderActions() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Notification count would be fetched from API in production
    const interval = setInterval(() => {}, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
      <TouchableOpacity style={{ position: "relative", marginRight: 12 }}>
        <Ionicons name="notifications-outline" size={22} color="#374151" />
        {unreadCount > 0 && (
          <View style={styles.notifBadge}>
            <Text style={styles.notifBadgeText}>{unreadCount > 9 ? "9+" : String(unreadCount)}</Text>
          </View>
        )}
      </TouchableOpacity>
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT NAVIGATOR
// ═══════════════════════════════════════════════════════════════════════════════

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  // Onboarding redirect: if user hasn't completed onboarding, redirect
  const needsOnboarding = isAuthenticated && user && !(user as any).onboardingComplete;

  const getInitialRoute = (): keyof RootStackParamList => {
    if (isLoading) return "Splash";
    if (!isAuthenticated) return "Login";
    return "MainDrawer";
  };

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={getInitialRoute()}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainDrawer" component={MainDrawerNavigator} />
        {/* Detail screens that push on top */}
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: true, title: "Send Payment" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  drawerContainer: { flex: 1, backgroundColor: "#ffffff" },
  drawerHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  avatarRow: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6366f1",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  userInfo: { marginLeft: 12, flex: 1 },
  userName: { fontWeight: "600", fontSize: 14, color: "#111827" },
  userEmail: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  roleBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
  },
  roleBadgeText: { fontSize: 10, fontWeight: "700", color: "#6366f1", letterSpacing: 1 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111827", padding: 0 },
  navScroll: { flex: 1 },
  section: { marginBottom: 8, paddingHorizontal: 8 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#9ca3af",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  navItemLabel: { flex: 1, fontSize: 13, color: "#374151" },
  badge: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#ef4444" },
  drawerFooter: { borderTopWidth: 1, borderTopColor: "#e5e7eb", padding: 12 },
  logoutButton: { flexDirection: "row", alignItems: "center", padding: 12 },
  logoutText: { fontSize: 14, color: "#ef4444", fontWeight: "500" },
  notifBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  notifBadgeText: { fontSize: 9, color: "#fff", fontWeight: "700" },
  liveIndicator: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#dcfce7",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e", marginRight: 4 },
  liveText: { fontSize: 9, fontWeight: "700", color: "#22c55e", letterSpacing: 0.5 },
});
