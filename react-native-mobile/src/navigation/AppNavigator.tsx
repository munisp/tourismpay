import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../hooks/useAuthStore";

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

// Settings & Offline
import SettingsScreen from "../screens/settings/SettingsScreen";
import SecurityScreen from "../screens/settings/SecurityScreen";
import NotificationPrefsScreen from "../screens/settings/NotificationPrefsScreen";
import OfflineQueueScreen from "../screens/offline/OfflineQueueScreen";

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  TouristTabs: undefined;
  MerchantTabs: undefined;
  AdminTabs: undefined;
  // Tourist detail screens
  Payment: { recipientId?: string };
  QRScan: undefined;
  Copilot: undefined;
  Remittance: undefined;
  Experiences: undefined;
  // Merchant detail screens
  KYBOnboarding: undefined;
  // Admin detail screens
  KYBReview: { applicationId: number };
  // Shared
  Settings: undefined;
  Security: undefined;
  NotificationPrefs: undefined;
  OfflineQueue: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const TouristTab = createBottomTabNavigator();
const MerchantTab = createBottomTabNavigator();
const AdminTab = createBottomTabNavigator();

function TouristTabs() {
  return (
    <TouristTab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: "home",
            Wallet: "wallet",
            Itinerary: "map",
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
      <TouristTab.Screen name="Home" component={TouristDashboard} />
      <TouristTab.Screen name="Wallet" component={WalletScreen} />
      <TouristTab.Screen name="Itinerary" component={ItineraryScreen} />
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
            Bookings: "calendar",
            QRCodes: "qr-code",
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
      <MerchantTab.Screen name="Bookings" component={BookingsScreen} />
      <MerchantTab.Screen name="QRCodes" component={QRCodesScreen} />
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

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  const getInitialRoute = (): keyof RootStackParamList => {
    if (isLoading) return "Splash";
    if (!isAuthenticated) return "Login";
    switch (user?.role) {
      case "merchant":
        return "MerchantTabs";
      case "admin":
        return "AdminTabs";
      default:
        return "TouristTabs";
    }
  };

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={getInitialRoute()}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="TouristTabs" component={TouristTabs} />
        <Stack.Screen name="MerchantTabs" component={MerchantTabs} />
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        {/* Tourist detail screens */}
        <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: true, title: "Send Payment" }} />
        <Stack.Screen name="QRScan" component={QRScanScreen} options={{ headerShown: true, title: "Scan QR" }} />
        <Stack.Screen name="Copilot" component={CopilotScreen} options={{ headerShown: true, title: "AI Co-Pilot" }} />
        <Stack.Screen name="Remittance" component={RemittanceScreen} options={{ headerShown: true, title: "Send Money" }} />
        <Stack.Screen name="Experiences" component={ExperiencesScreen} options={{ headerShown: true, title: "Experiences" }} />
        {/* Merchant detail screens */}
        <Stack.Screen name="KYBOnboarding" component={KYBOnboardingScreen} options={{ headerShown: true, title: "Business Verification" }} />
        {/* Admin detail screens */}
        <Stack.Screen name="KYBReview" component={KYBReviewScreen} options={{ headerShown: true, title: "Review Application" }} />
        {/* Shared screens */}
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: "Settings" }} />
        <Stack.Screen name="Security" component={SecurityScreen} options={{ headerShown: true, title: "Security" }} />
        <Stack.Screen name="NotificationPrefs" component={NotificationPrefsScreen} options={{ headerShown: true, title: "Notifications" }} />
        <Stack.Screen name="OfflineQueue" component={OfflineQueueScreen} options={{ headerShown: true, title: "Offline Queue" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
