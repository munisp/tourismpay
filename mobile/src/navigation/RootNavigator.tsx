/**
 * Root Navigation — Full platform navigation matching PWA feature parity
 *
 * Structure:
 * - Bottom Tabs: Dashboard | Tourist | Merchant | Admin | More
 * - Each tab has its own native stack navigator
 * - Deep linking support for all routes
 */
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../hooks/useAuth";

// ─── Screen Imports ──────────────────────────────────────────────────────────

// Dashboard / Home
import { DashboardScreen } from "../screens/DashboardScreen";

// Tourist
import { TouristHome } from "../screens/tourist/TouristHome";
import { TouristPortal } from "../screens/tourist/TouristPortal";
import { ProductCatalog } from "../screens/tourist/ProductCatalog";
import { OrderConfirm } from "../screens/tourist/OrderConfirm";
import { PaymentReceipt } from "../screens/tourist/PaymentReceipt";
import { TouristOnboarding } from "../screens/tourist/TouristOnboarding";
import { Itinerary } from "../screens/tourist/Itinerary";
import { TripSummary } from "../screens/tourist/TripSummary";
import { MapExplore } from "../screens/tourist/MapExplore";

// Merchant
import { MerchantDashboard } from "../screens/merchant/MerchantDashboard";
import { MerchantRevenue } from "../screens/merchant/MerchantRevenue";
import { MerchantQRCodes } from "../screens/merchant/MerchantQRCodes";
import { MerchantProducts } from "../screens/merchant/MerchantProducts";
import { MerchantBookings } from "../screens/merchant/MerchantBookings";
import { MerchantCashier } from "../screens/merchant/MerchantCashier";
import { MerchantPayouts } from "../screens/merchant/MerchantPayouts";
import { MerchantStaff } from "../screens/merchant/MerchantStaff";
import { MerchantAvailability } from "../screens/merchant/MerchantAvailability";
import { MerchantStripeConnect } from "../screens/merchant/MerchantStripeConnect";
import { MerchantBISStatus } from "../screens/merchant/MerchantBISStatus";
import { MerchantDeals } from "../screens/merchant/MerchantDeals";
import { MerchantKPI } from "../screens/merchant/MerchantKPI";
import { MerchantEmployeeBIS } from "../screens/merchant/MerchantEmployeeBIS";

// Channels
import { ChannelManagerHome } from "../screens/channels/ChannelManagerHome";
import { ChannelConnect } from "../screens/channels/ChannelConnect";
import { ChannelSync } from "../screens/channels/ChannelSync";
import { InboundBookings } from "../screens/channels/InboundBookings";
import { ProductMapping } from "../screens/channels/ProductMapping";
import { RateParity } from "../screens/channels/RateParity";

// Wallet & Finance
import { WalletScreen } from "../screens/finance/WalletScreen";
import { LoyaltyScreen } from "../screens/finance/LoyaltyScreen";
import { EmbeddedFinance } from "../screens/finance/EmbeddedFinance";
import { MeshPayments } from "../screens/finance/MeshPayments";

// Security
import { FraudMonitor } from "../screens/security/FraudMonitor";
import { SOCDashboard } from "../screens/security/SOCDashboard";
import { BiometricAuth } from "../screens/security/BiometricAuth";

// Admin
import { AdminPanel } from "../screens/admin/AdminPanel";
import { KYBApplications } from "../screens/admin/KYBApplications";
import { KYBDocuments } from "../screens/admin/KYBDocuments";
import { BISDashboard } from "../screens/admin/BISDashboard";
import { UsersManagement } from "../screens/admin/UsersManagement";
import { AuditLog } from "../screens/admin/AuditLog";
import { AdminFinance } from "../screens/admin/AdminFinance";
import { ServiceHealth } from "../screens/admin/ServiceHealth";
import { ExchangeRates } from "../screens/admin/ExchangeRates";

// Payment Switch
import { PSDashboard } from "../screens/paymentswitch/PSDashboard";
import { PSGateway } from "../screens/paymentswitch/PSGateway";
import { PSDeveloper } from "../screens/paymentswitch/PSDeveloper";
import { PSRemittance } from "../screens/paymentswitch/PSRemittance";
import { PSRateAlerts } from "../screens/paymentswitch/PSRateAlerts";
import { PSSettlement } from "../screens/paymentswitch/PSSettlement";
import { PSNOC } from "../screens/paymentswitch/PSNOC";

// Settings
import { ProfileScreen } from "../screens/settings/ProfileScreen";
import { NotificationSettings } from "../screens/settings/NotificationSettings";
import { PrivacySettings } from "../screens/settings/PrivacySettings";
import { TwoFactorSettings } from "../screens/settings/TwoFactorSettings";
import { BiometricSettings } from "../screens/settings/BiometricSettings";

// Africa / KYB
import { AfricaRegistry } from "../screens/africa/AfricaRegistry";
import { KYBOnboarding } from "../screens/africa/KYBOnboarding";
import { RestaurantOnboarding } from "../screens/africa/RestaurantOnboarding";

// Other
import { CopilotScreen } from "../screens/other/CopilotScreen";
import { SustainabilityScreen } from "../screens/other/SustainabilityScreen";
import { IdentityScreen } from "../screens/other/IdentityScreen";
import { NotificationsScreen } from "../screens/other/NotificationsScreen";
import { SettlementConsole } from "../screens/other/SettlementConsole";
import { ComplianceScreen } from "../screens/other/ComplianceScreen";
import { AnalyticsScreen } from "../screens/other/AnalyticsScreen";

// ─── Navigation Type Definitions ─────────────────────────────────────────────

export type ChannelStackParams = {
  ChannelHome: undefined;
  ChannelConnect: { channelId?: string };
  ChannelSync: { channelId: string };
  InboundBookings: undefined;
  ProductMapping: undefined;
  RateParity: undefined;
};

export type TouristStackParams = {
  TouristHome: undefined;
  Portal: undefined;
  Catalog: { token?: string; experienceId?: number };
  OrderConfirm: { orderId?: string };
  Receipt: { token?: string };
  Onboarding: undefined;
  Itinerary: undefined;
  TripSummary: { shareToken?: string };
  MapExplore: undefined;
};

export type MerchantStackParams = {
  MerchantHome: undefined;
  Revenue: undefined;
  QRCodes: undefined;
  Products: undefined;
  Bookings: undefined;
  Cashier: undefined;
  Payouts: undefined;
  Staff: undefined;
  Availability: undefined;
  StripeConnect: undefined;
  BISStatus: undefined;
  Deals: undefined;
  KPI: undefined;
  EmployeeBIS: undefined;
  Channels: undefined;
};

export type AdminStackParams = {
  AdminHome: undefined;
  KYBApps: undefined;
  KYBDocs: undefined;
  BIS: undefined;
  Users: undefined;
  Audit: undefined;
  Finance: undefined;
  Health: undefined;
  Rates: undefined;
};

export type FinanceStackParams = {
  Wallet: undefined;
  Loyalty: undefined;
  EmbeddedFinance: undefined;
  Mesh: undefined;
};

export type PaymentSwitchStackParams = {
  PSHome: undefined;
  Gateway: undefined;
  Developer: undefined;
  Remittance: undefined;
  RateAlerts: undefined;
  Settlement: undefined;
  NOC: undefined;
};

export type SecurityStackParams = {
  Fraud: undefined;
  SOC: undefined;
  Biometric: undefined;
};

export type SettingsStackParams = {
  Profile: undefined;
  Notifications: undefined;
  Privacy: undefined;
  TwoFactor: undefined;
  BiometricSetting: undefined;
};

export type MoreStackParams = {
  MoreHome: undefined;
  Africa: undefined;
  KYB: undefined;
  Onboarding: undefined;
  Copilot: undefined;
  Sustainability: undefined;
  Identity: undefined;
  NotificationsList: undefined;
  SettlementConsole: undefined;
  Compliance: undefined;
  Analytics: undefined;
  Security: undefined;
  Settings: undefined;
};

// ─── Stack Navigators ────────────────────────────────────────────────────────

const headerOptions = {
  headerStyle: { backgroundColor: "#1a1a2e" },
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "600" as const },
};

// Tourist Stack
const TouristStack = createNativeStackNavigator<TouristStackParams>();
function TouristNavigator() {
  return (
    <TouristStack.Navigator screenOptions={headerOptions}>
      <TouristStack.Screen name="TouristHome" component={TouristHome} options={{ title: "Discover" }} />
      <TouristStack.Screen name="Portal" component={TouristPortal} options={{ title: "Tourist Portal" }} />
      <TouristStack.Screen name="Catalog" component={ProductCatalog} options={{ title: "Experiences" }} />
      <TouristStack.Screen name="OrderConfirm" component={OrderConfirm} options={{ title: "Confirm Order" }} />
      <TouristStack.Screen name="Receipt" component={PaymentReceipt} options={{ title: "Receipt" }} />
      <TouristStack.Screen name="Onboarding" component={TouristOnboarding} options={{ title: "Get Started" }} />
      <TouristStack.Screen name="Itinerary" component={Itinerary} options={{ title: "My Itinerary" }} />
      <TouristStack.Screen name="TripSummary" component={TripSummary} options={{ title: "Trip Summary" }} />
      <TouristStack.Screen name="MapExplore" component={MapExplore} options={{ title: "Map", headerShown: false }} />
    </TouristStack.Navigator>
  );
}

// Merchant Stack
const MerchantStack = createNativeStackNavigator<MerchantStackParams>();
function MerchantNavigator() {
  return (
    <MerchantStack.Navigator screenOptions={headerOptions}>
      <MerchantStack.Screen name="MerchantHome" component={MerchantDashboard} options={{ title: "Merchant" }} />
      <MerchantStack.Screen name="Revenue" component={MerchantRevenue} options={{ title: "Revenue" }} />
      <MerchantStack.Screen name="QRCodes" component={MerchantQRCodes} options={{ title: "QR Codes" }} />
      <MerchantStack.Screen name="Products" component={MerchantProducts} options={{ title: "Products" }} />
      <MerchantStack.Screen name="Bookings" component={MerchantBookings} options={{ title: "Bookings" }} />
      <MerchantStack.Screen name="Cashier" component={MerchantCashier} options={{ title: "Cashier" }} />
      <MerchantStack.Screen name="Payouts" component={MerchantPayouts} options={{ title: "Payouts" }} />
      <MerchantStack.Screen name="Staff" component={MerchantStaff} options={{ title: "Staff" }} />
      <MerchantStack.Screen name="Availability" component={MerchantAvailability} options={{ title: "Availability" }} />
      <MerchantStack.Screen name="StripeConnect" component={MerchantStripeConnect} options={{ title: "Stripe Connect" }} />
      <MerchantStack.Screen name="BISStatus" component={MerchantBISStatus} options={{ title: "BIS Status" }} />
      <MerchantStack.Screen name="Deals" component={MerchantDeals} options={{ title: "Deal Leaderboard" }} />
      <MerchantStack.Screen name="KPI" component={MerchantKPI} options={{ title: "KPI Leaderboard" }} />
      <MerchantStack.Screen name="EmployeeBIS" component={MerchantEmployeeBIS} options={{ title: "Employee BIS" }} />
      <MerchantStack.Screen name="Channels" component={ChannelManagerHome} options={{ title: "Channel Manager" }} />
    </MerchantStack.Navigator>
  );
}

// Admin Stack
const AdminStack = createNativeStackNavigator<AdminStackParams>();
function AdminNavigator() {
  return (
    <AdminStack.Navigator screenOptions={headerOptions}>
      <AdminStack.Screen name="AdminHome" component={AdminPanel} options={{ title: "Admin" }} />
      <AdminStack.Screen name="KYBApps" component={KYBApplications} options={{ title: "KYB Applications" }} />
      <AdminStack.Screen name="KYBDocs" component={KYBDocuments} options={{ title: "KYB Documents" }} />
      <AdminStack.Screen name="BIS" component={BISDashboard} options={{ title: "BIS" }} />
      <AdminStack.Screen name="Users" component={UsersManagement} options={{ title: "Users" }} />
      <AdminStack.Screen name="Audit" component={AuditLog} options={{ title: "Audit Log" }} />
      <AdminStack.Screen name="Finance" component={AdminFinance} options={{ title: "Finance" }} />
      <AdminStack.Screen name="Health" component={ServiceHealth} options={{ title: "Service Health" }} />
      <AdminStack.Screen name="Rates" component={ExchangeRates} options={{ title: "Exchange Rates" }} />
    </AdminStack.Navigator>
  );
}

// More Stack (catches remaining features)
const MoreStack = createNativeStackNavigator<MoreStackParams>();
function MoreNavigator() {
  return (
    <MoreStack.Navigator screenOptions={headerOptions}>
      <MoreStack.Screen name="MoreHome" component={MoreHomeScreen} options={{ title: "More" }} />
      <MoreStack.Screen name="Africa" component={AfricaRegistry} options={{ title: "Africa Registry" }} />
      <MoreStack.Screen name="KYB" component={KYBOnboarding} options={{ title: "KYB Onboarding" }} />
      <MoreStack.Screen name="Onboarding" component={RestaurantOnboarding} options={{ title: "Merchant Setup" }} />
      <MoreStack.Screen name="Copilot" component={CopilotScreen} options={{ title: "AI Copilot" }} />
      <MoreStack.Screen name="Sustainability" component={SustainabilityScreen} options={{ title: "Sustainability" }} />
      <MoreStack.Screen name="Identity" component={IdentityScreen} options={{ title: "Digital Identity" }} />
      <MoreStack.Screen name="NotificationsList" component={NotificationsScreen} options={{ title: "Notifications" }} />
      <MoreStack.Screen name="SettlementConsole" component={SettlementConsole} options={{ title: "Settlement" }} />
      <MoreStack.Screen name="Compliance" component={ComplianceScreen} options={{ title: "Compliance" }} />
      <MoreStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: "Analytics" }} />
      <MoreStack.Screen name="Security" component={SecurityHome} options={{ title: "Security" }} />
      <MoreStack.Screen name="Settings" component={SettingsHome} options={{ title: "Settings" }} />
    </MoreStack.Navigator>
  );
}

// ─── Helper Screens ──────────────────────────────────────────────────────────

import { MoreHomeScreen } from "../screens/MoreHomeScreen";
import { SecurityHome } from "../screens/security/SecurityHome";
import { SettingsHome } from "../screens/settings/SettingsHome";

// ─── Bottom Tab Navigator ────────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export function RootNavigator() {
  const { user } = useAuth();
  const role = user?.role ?? "tourist";

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1a1a2e",
          borderTopColor: "#2d2d44",
          paddingBottom: 8,
          paddingTop: 8,
          height: 65,
        },
        tabBarActiveTintColor: "#6c63ff",
        tabBarInactiveTintColor: "#666",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      {role === "tourist" ? (
        <>
          <Tab.Screen name="Discover" component={TouristNavigator} options={{ tabBarLabel: "Discover" }} />
          <Tab.Screen name="Wallet" component={WalletScreen} options={{ tabBarLabel: "Wallet" }} />
          <Tab.Screen name="Loyalty" component={LoyaltyScreen} options={{ tabBarLabel: "Rewards" }} />
          <Tab.Screen name="More" component={MoreNavigator} options={{ tabBarLabel: "More" }} />
        </>
      ) : role === "merchant" ? (
        <>
          <Tab.Screen name="Home" component={MerchantNavigator} options={{ tabBarLabel: "Home" }} />
          <Tab.Screen name="Channels" component={ChannelManagerNavigator} options={{ tabBarLabel: "Channels" }} />
          <Tab.Screen name="Wallet" component={WalletScreen} options={{ tabBarLabel: "Wallet" }} />
          <Tab.Screen name="More" component={MoreNavigator} options={{ tabBarLabel: "More" }} />
        </>
      ) : (
        <>
          <Tab.Screen name="Home" component={AdminNavigator} options={{ tabBarLabel: "Admin" }} />
          <Tab.Screen name="PaySwitch" component={PaymentSwitchNavigator} options={{ tabBarLabel: "Switch" }} />
          <Tab.Screen name="Merchant" component={MerchantNavigator} options={{ tabBarLabel: "Merchant" }} />
          <Tab.Screen name="More" component={MoreNavigator} options={{ tabBarLabel: "More" }} />
        </>
      )}
    </Tab.Navigator>
  );
}

// Channel Manager Navigator (reused in tab)
const ChannelStackNav = createNativeStackNavigator<ChannelStackParams>();
function ChannelManagerNavigator() {
  return (
    <ChannelStackNav.Navigator screenOptions={headerOptions}>
      <ChannelStackNav.Screen name="ChannelHome" component={ChannelManagerHome} options={{ title: "Channel Manager" }} />
      <ChannelStackNav.Screen name="ChannelConnect" component={ChannelConnect} options={{ title: "Connect" }} />
      <ChannelStackNav.Screen name="ChannelSync" component={ChannelSync} options={{ title: "Sync Status" }} />
      <ChannelStackNav.Screen name="InboundBookings" component={InboundBookings} options={{ title: "Bookings" }} />
      <ChannelStackNav.Screen name="ProductMapping" component={ProductMapping} options={{ title: "Mapping" }} />
      <ChannelStackNav.Screen name="RateParity" component={RateParity} options={{ title: "Rate Parity" }} />
    </ChannelStackNav.Navigator>
  );
}

// Payment Switch Navigator
const PSStack = createNativeStackNavigator<PaymentSwitchStackParams>();
function PaymentSwitchNavigator() {
  return (
    <PSStack.Navigator screenOptions={headerOptions}>
      <PSStack.Screen name="PSHome" component={PSDashboard} options={{ title: "Payment Switch" }} />
      <PSStack.Screen name="Gateway" component={PSGateway} options={{ title: "Gateway" }} />
      <PSStack.Screen name="Developer" component={PSDeveloper} options={{ title: "Developer" }} />
      <PSStack.Screen name="Remittance" component={PSRemittance} options={{ title: "Remittance" }} />
      <PSStack.Screen name="RateAlerts" component={PSRateAlerts} options={{ title: "Rate Alerts" }} />
      <PSStack.Screen name="Settlement" component={PSSettlement} options={{ title: "Settlement" }} />
      <PSStack.Screen name="NOC" component={PSNOC} options={{ title: "NOC" }} />
    </PSStack.Navigator>
  );
}
