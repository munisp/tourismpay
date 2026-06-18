/* =============================================================================
   TOURISMPAY APP — OBSIDIAN INTELLIGENCE DESIGN SYSTEM
   Route structure: Sidebar layout wrapping all authenticated pages
   ============================================================================= */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppShell from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Pages
import Dashboard from "./pages/Dashboard";
import AfricaRegistry from "./pages/africa/AfricaRegistry";
import KYBOnboarding from "./pages/africa/KYBOnboarding";
import BISDashboard from "./pages/bis/BISDashboard";
import BISInvestigation from "./pages/bis/BISInvestigation";
import BISReport from "./pages/bis/BISReport";
import FraudMonitor from "./pages/tier1/FraudMonitor";
import SOCDashboard from "./pages/tier1/SOCDashboard";
import BiometricAuth from "./pages/tier1/BiometricAuth";
import AICopilot from "./pages/tier2/AICopilot";
import DigitalWallet from "./pages/tier2/DigitalWallet";
import EmbeddedFinance from "./pages/tier2/EmbeddedFinance";
import LoyaltyRewards from "./pages/tier2/LoyaltyRewards";
import DIDWallet from "./pages/tier3/DIDWallet";
import ARTourism from "./pages/tier3/ARTourism";
import Sustainability from "./pages/tier3/Sustainability";
import MeshPayments from "./pages/tier3/MeshPayments";
import Login from "./pages/Login";
import AdminPanel from "./pages/admin/AdminPanel";
import KybDocumentReview from "./pages/admin/KybDocumentReview";
import KybApplicationsDashboard from "./pages/admin/KybApplicationsDashboard";
import ExchangeRateOverrides from "./pages/admin/ExchangeRateOverrides";
import BISQueueManagement from "./pages/admin/BISQueueManagement";
import Notifications from "./pages/Notifications";
import NotificationSettings from "./pages/settings/NotificationSettings";
import BiometricSettings from "./pages/settings/BiometricSettings";
import PrivacySettings from "./pages/settings/PrivacySettings";
import BISInvestigationDetail from "./pages/bis/BISInvestigationDetail";
import AuditLog from "./pages/admin/AuditLog";
import UsersManagement from "./pages/admin/UsersManagement";
import AdminFinanceDashboard from "./pages/admin/AdminFinanceDashboard";
import ServiceHealth from "./pages/admin/ServiceHealth";
import MLServicesDashboard from "./pages/admin/MLServicesDashboard";
import LoyaltyRewardsAdmin from "./pages/admin/LoyaltyRewardsAdmin";
import BISSettings from "./pages/admin/BISSettings";
import BISAutoFlagSettings from "./pages/admin/BISAutoFlagSettings";
import BISAutoFlagHistory from "./pages/bis/BISAutoFlagHistory";
import HAStatus from "./pages/admin/HAStatus";
import ProviderOnboarding from "./pages/admin/ProviderOnboarding";
import ApiHealthDashboard from "./pages/admin/ApiHealthDashboard";
import CrossPlatformAnalytics from "@/pages/CrossPlatformAnalytics";
import IntegrationOverview from "@/pages/IntegrationOverview";
import TouristExperience from "@/pages/TouristExperience";
import TouristPortal from "@/pages/TouristPortal";
import RestaurantOnboarding from "@/pages/RestaurantOnboarding";
import TouristOnboarding from "@/pages/tourist/TouristOnboarding";
import ItineraryBuilder from "@/pages/tourist/ItineraryBuilder";
import SharedItinerary from "@/pages/tourist/SharedItinerary";
import MerchantRevenue from "@/pages/merchant/MerchantRevenue";
import MerchantQRCodes from "@/pages/merchant/MerchantQRCodes";
import MerchantPayouts from "@/pages/merchant/MerchantPayouts";
import StripeConnectOnboarding from "@/pages/merchant/StripeConnectOnboarding";
import MerchantProducts from "@/pages/merchant/MerchantProducts";
import MerchantEmployeeBIS from "@/pages/merchant/MerchantEmployeeBIS";
import MerchantStaff from "@/pages/merchant/MerchantStaff";
import MerchantCashier from "@/pages/merchant/MerchantCashier";
import MerchantBookings from "@/pages/merchant/MerchantBookings";
import MerchantBisStatus from "@/pages/merchant/MerchantBisStatus";
import DealLeaderboard from "@/pages/merchant/DealLeaderboard";
import MerchantKpiLeaderboard from "@/pages/merchant/MerchantKpiLeaderboard";
import ServiceAvailabilityCalendar from "@/pages/merchant/ServiceAvailabilityCalendar";
import ChannelManager from "@/pages/merchant/ChannelManager";
import InviteAccept from "@/pages/InviteAccept";
import TouristProductCatalog from "@/pages/tourist/TouristProductCatalog";
import TouristOrderConfirm from "@/pages/tourist/TouristOrderConfirm";
import ComplianceDashboard from "@/pages/compliance/ComplianceDashboard";
import EmailPreview from "@/pages/admin/EmailPreview";
import SettlementConsole from "@/pages/settlement/SettlementConsole";
import StablecoinSwap from "@/pages/tier2/StablecoinSwap";
import LiquidityProvider from "@/pages/tier2/LiquidityProvider";
import WalletLoading from "@/pages/tourist/WalletLoading";
import LocalPayments from "@/pages/tourist/LocalPayments";
import PreTravelReadiness from "@/pages/tourist/PreTravelReadiness";
import TripPlanner from "@/pages/tourist/TripPlanner";
import TippingTaxPage from "@/pages/TippingTax";
import PaymentReceipt from "@/pages/tourist/PaymentReceipt";
import { InstallPrompt } from "@/components/InstallPrompt";
import { OfflinePaymentBanner } from "@/components/OfflinePaymentBanner";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" nest>
        <AppShell>
          <Switch>
            <Route path="/" component={Dashboard} />
            {/* Africa Expansion — merchant + admin */}
            <Route path="/africa/registry">{() => <ProtectedRoute roles={["merchant", "admin"]}><AfricaRegistry /></ProtectedRoute>}</Route>
            <Route path="/africa/kyb">{() => <ProtectedRoute roles={["merchant", "admin"]}><KYBOnboarding /></ProtectedRoute>}</Route>
            {/* Background Investigation Service — bis_analyst + admin */}
            <Route path="/bis">{() => <ProtectedRoute roles={["bis_analyst", "admin"]}><BISDashboard /></ProtectedRoute>}</Route>
            <Route path="/bis/new">{() => <ProtectedRoute roles={["bis_analyst", "admin"]}><BISInvestigation /></ProtectedRoute>}</Route>
            <Route path="/bis/report/:id">{() => <ProtectedRoute roles={["bis_analyst", "admin"]}><BISReport /></ProtectedRoute>}</Route>
            <Route path="/bis/auto-flag-history">{() => <ProtectedRoute roles={["bis_analyst", "admin"]}><BISAutoFlagHistory /></ProtectedRoute>}</Route>
            <Route path="/bis/:id">{() => <ProtectedRoute roles={["bis_analyst", "admin"]}><BISInvestigationDetail /></ProtectedRoute>}</Route>
            {/* Tier 1 — Security — admin only */}
            <Route path="/security/fraud">{() => <ProtectedRoute roles={["admin", "bis_analyst"]}><FraudMonitor /></ProtectedRoute>}</Route>
            <Route path="/security/soc">{() => <ProtectedRoute roles={["admin", "bis_analyst"]}><SOCDashboard /></ProtectedRoute>}</Route>
            <Route path="/security/biometric">{() => <ProtectedRoute roles={["admin"]}><BiometricAuth /></ProtectedRoute>}</Route>
            {/* Tier 2 — Digital Finance */}
            <Route path="/copilot" component={AICopilot} />
            <Route path="/wallet" component={DigitalWallet} />
            <Route path="/wallet/stablecoin" component={StablecoinSwap} />
            <Route path="/wallet/liquidity" component={LiquidityProvider} />
            <Route path="/wallet/loading" component={WalletLoading} />
            <Route path="/wallet/local-payments" component={LocalPayments} />
            <Route path="/wallet/pre-travel" component={PreTravelReadiness} />
            <Route path="/finance" component={EmbeddedFinance} />
            <Route path="/loyalty" component={LoyaltyRewards} />
            {/* Tier 3 — Visionary */}
            <Route path="/identity" component={DIDWallet} />
            <Route path="/ar" component={ARTourism} />
            <Route path="/sustainability" component={Sustainability} />
            <Route path="/mesh" component={MeshPayments} />
            {/* Admin — admin + compliance_officer for KYB */}
            <Route path="/admin">{() => <ProtectedRoute roles={["admin"]}><AdminPanel /></ProtectedRoute>}</Route>
            <Route path="/admin/kyb-documents">{() => <ProtectedRoute roles={["admin", "compliance_officer"]}><KybDocumentReview /></ProtectedRoute>}</Route>
            <Route path="/admin/kyb-applications">{() => <ProtectedRoute roles={["admin", "compliance_officer"]}><KybApplicationsDashboard /></ProtectedRoute>}</Route>
            <Route path="/admin/exchange-rates">{() => <ProtectedRoute roles={["admin", "settlement_officer"]}><ExchangeRateOverrides /></ProtectedRoute>}</Route>
            <Route path="/notifications" component={Notifications} />
            <Route path="/settings/notifications" component={NotificationSettings} />
            <Route path="/settings/biometric" component={BiometricSettings} />
            <Route path="/settings/privacy" component={PrivacySettings} />
            <Route path="/admin/bis-queue">{() => <ProtectedRoute roles={["admin", "bis_analyst"]}><BISQueueManagement /></ProtectedRoute>}</Route>
            <Route path="/admin/audit-log">{() => <ProtectedRoute roles={["admin", "compliance_officer"]}><AuditLog /></ProtectedRoute>}</Route>
            <Route path="/admin/users">{() => <ProtectedRoute roles={["admin"]}><UsersManagement /></ProtectedRoute>}</Route>
            <Route path="/admin/finance">{() => <ProtectedRoute roles={["admin", "settlement_officer"]}><AdminFinanceDashboard /></ProtectedRoute>}</Route>
            <Route path="/admin/service-health">{() => <ProtectedRoute roles={["admin", "noc_operator"]}><ServiceHealth /></ProtectedRoute>}</Route>
            <Route path="/admin/ml-services">{() => <ProtectedRoute roles={["admin"]}><MLServicesDashboard /></ProtectedRoute>}</Route>
            <Route path="/admin/loyalty-rewards">{() => <ProtectedRoute roles={["admin"]}><LoyaltyRewardsAdmin /></ProtectedRoute>}</Route>
            <Route path="/admin/bis-settings">{() => <ProtectedRoute roles={["admin"]}><BISSettings /></ProtectedRoute>}</Route>
            <Route path="/admin/bis-auto-flag-settings">{() => <ProtectedRoute roles={["admin"]}><BISAutoFlagSettings /></ProtectedRoute>}</Route>
            <Route path="/admin/ha-status">{() => <ProtectedRoute roles={["admin", "noc_operator"]}><HAStatus /></ProtectedRoute>}</Route>
            <Route path="/admin/provider-onboarding">{() => <ProtectedRoute roles={["admin"]}><ProviderOnboarding /></ProtectedRoute>}</Route>
            <Route path="/admin/api-health">{() => <ProtectedRoute roles={["admin", "noc_operator"]}><ApiHealthDashboard /></ProtectedRoute>}</Route>
            <Route path="/admin/email-preview">{() => <ProtectedRoute roles={["admin"]}><EmailPreview /></ProtectedRoute>}</Route>

            <Route path="/analytics">{() => <ProtectedRoute roles={["admin", "compliance_officer", "noc_operator", "settlement_officer", "bis_analyst"]}><CrossPlatformAnalytics /></ProtectedRoute>}</Route>
            <Route path="/integration-overview">{() => <ProtectedRoute roles={["admin", "noc_operator"]}><IntegrationOverview /></ProtectedRoute>}</Route>
            <Route path="/tourist">{() => <ProtectedRoute roles={["tourist", "admin"]}><TouristExperience /></ProtectedRoute>}</Route>
            <Route path="/tourist-portal">{() => <ProtectedRoute roles={["tourist", "admin"]}><TouristPortal /></ProtectedRoute>}</Route>
            <Route path="/tourist/onboarding">{() => <ProtectedRoute roles={["tourist", "admin"]}><TouristOnboarding /></ProtectedRoute>}</Route>
            <Route path="/tourist/itinerary">{() => <ProtectedRoute roles={["tourist", "admin"]}><ItineraryBuilder /></ProtectedRoute>}</Route>
            <Route path="/tourist/trip-planner">{() => <ProtectedRoute roles={["tourist", "admin"]}><TripPlanner /></ProtectedRoute>}</Route>
            <Route path="/wallet/tipping-tax">{() => <ProtectedRoute roles={["tourist", "merchant", "admin", "settlement_officer"]}><TippingTaxPage /></ProtectedRoute>}</Route>
            {/* Public shared trip itinerary — no auth required */}
            <Route path="/trip/:shareToken" component={SharedItinerary} />
            <Route path="/restaurant-onboarding">{() => <ProtectedRoute roles={["merchant", "admin"]}><RestaurantOnboarding /></ProtectedRoute>}</Route>
            {/* Merchant — merchant + admin */}
            <Route path="/merchant/revenue">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantRevenue /></ProtectedRoute>}</Route>
            <Route path="/merchant/qr">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantQRCodes /></ProtectedRoute>}</Route>
            <Route path="/merchant/payouts">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantPayouts /></ProtectedRoute>}</Route>
            <Route path="/merchant/stripe-connect">{() => <ProtectedRoute roles={["merchant", "admin"]}><StripeConnectOnboarding /></ProtectedRoute>}</Route>
            <Route path="/merchant/products">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantProducts /></ProtectedRoute>}</Route>
            <Route path="/merchant/employee-bis">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantEmployeeBIS /></ProtectedRoute>}</Route>
            <Route path="/merchant/staff">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantStaff /></ProtectedRoute>}</Route>
            <Route path="/merchant/cashier">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantCashier /></ProtectedRoute>}</Route>
            <Route path="/merchant/bookings">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantBookings /></ProtectedRoute>}</Route>
            <Route path="/merchant/deals/leaderboard">{() => <ProtectedRoute roles={["merchant", "admin"]}><DealLeaderboard /></ProtectedRoute>}</Route>
            <Route path="/merchant/leaderboard">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantKpiLeaderboard /></ProtectedRoute>}</Route>
            <Route path="/merchant/availability">{() => <ProtectedRoute roles={["merchant", "admin"]}><ServiceAvailabilityCalendar /></ProtectedRoute>}</Route>
            <Route path="/merchant/bis-status">{() => <ProtectedRoute roles={["merchant", "admin"]}><MerchantBisStatus /></ProtectedRoute>}</Route>
            <Route path="/merchant/channels">{() => <ProtectedRoute roles={["merchant", "admin"]}><ChannelManager /></ProtectedRoute>}</Route>
            {/* Compliance — compliance_officer + admin */}
            <Route path="/compliance">{() => <ProtectedRoute roles={["admin", "compliance_officer"]}><ComplianceDashboard /></ProtectedRoute>}</Route>
            {/* Settlement — settlement_officer + admin */}
            <Route path="/settlement">{() => <ProtectedRoute roles={["admin", "settlement_officer"]}><SettlementConsole /></ProtectedRoute>}</Route>
            {/* QR Payment Receipt — public-ish, auth required for data */}
            <Route path="/receipt/:token" component={PaymentReceipt} />
            {/* Staff Invite Accept — public, auth required to accept */}
            <Route path="/invite/:token" component={InviteAccept} />
            {/* Tourist product catalog for QR-based itemised payment */}
            <Route path="/pay/:token/catalog" component={TouristProductCatalog} />
            {/* Tourist order confirmation screen */}
            <Route path="/pay/:token" component={TouristOrderConfirm} />
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <ImpersonationBanner />
          <Router />
          <InstallPrompt />
          <OfflinePaymentBanner />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
