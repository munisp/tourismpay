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
// PaymentSwitch pages
import PSNOCDashboard from "./pages/paymentswitch/NOCDashboard";
import PSPortal from "./pages/paymentswitch/PaymentSwitchPortal";
import PSServiceStatus from "./pages/paymentswitch/ServiceStatus";
import PSKillSwitch from "./pages/paymentswitch/KillSwitch";
import PSWebhooks from "./pages/paymentswitch/Webhooks";
import PSAdminDashboard from "./pages/paymentswitch/AdminDashboard";
import PSDashboard from "./pages/paymentswitch/Dashboard";
import PSAnalytics from "./pages/paymentswitch/Analytics";
import PSPaymentGateway from "./pages/paymentswitch/PaymentGateway";
import PSDeveloperPortal from "./pages/paymentswitch/DeveloperPortal";
import PSRemittanceAdmin from "./pages/paymentswitch/RemittanceAdminDashboard";
import PSRemittanceDemo from "./pages/paymentswitch/RemittanceDemo";
import PSRateAlerts from "./pages/paymentswitch/RateAlerts";
import PSRateLimits from "./pages/paymentswitch/RateLimits";
import PSRateAlertAnalytics from "./pages/paymentswitch/RateAlertAnalytics";
import PSBrandingSettings from "./pages/paymentswitch/BrandingSettings";
import PSTrustedDevices from "./pages/paymentswitch/TrustedDevices";
import PSTwoFactorSettings from "./pages/paymentswitch/TwoFactorSettings";
import PSAccountActivity from "./pages/paymentswitch/AccountActivity";
import PSNotificationSettings from "./pages/paymentswitch/NotificationSettings";
import PSCorrectionPatternsAdmin from "./pages/paymentswitch/admin/CorrectionPatternsAdmin";
import PSNotificationPreferences from "./pages/paymentswitch/admin/NotificationPreferences";
import PSRecoveryRequests from "./pages/paymentswitch/admin/RecoveryRequests";
import PSReminderEmailManagement from "./pages/paymentswitch/admin/ReminderEmailManagement";
import PSTechnicalOnboardingReview from "./pages/paymentswitch/admin/TechnicalOnboardingReview";
import HAStatus from "./pages/admin/HAStatus";
import ProviderOnboarding from "./pages/admin/ProviderOnboarding";
import ApiHealthDashboard from "./pages/admin/ApiHealthDashboard";
import PSOnboardingPortal from "./pages/paymentswitch/onboarding/OnboardingPortal";
import PSProductionGoLive from "./pages/paymentswitch/onboarding/ProductionGoLive";
import PSTechnicalOnboarding from "./pages/paymentswitch/onboarding/TechnicalOnboarding";
import PSTestingCertification from "./pages/paymentswitch/onboarding/TestingCertification";
import PSIntegrationDevelopment from "./pages/paymentswitch/onboarding/IntegrationDevelopment";
import PSSharedComparisonView from "./pages/paymentswitch/onboarding/SharedComparisonView";
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
import GDSAgentPortal from "@/pages/gds/GDSAgentPortal";
import GDSPropertyManager from "@/pages/gds/GDSPropertyManager";
import EmailPreview from "@/pages/admin/EmailPreview";
import SettlementConsole from "@/pages/settlement/SettlementConsole";
import StablecoinSwap from "@/pages/tier2/StablecoinSwap";
import LiquidityProvider from "@/pages/tier2/LiquidityProvider";
import WalletLoading from "@/pages/tourist/WalletLoading";
import LocalPayments from "@/pages/tourist/LocalPayments";
import PreTravelReadiness from "@/pages/tourist/PreTravelReadiness";
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
            {/* Africa Expansion */}
            <Route path="/africa/registry" component={AfricaRegistry} />
            <Route path="/africa/kyb" component={KYBOnboarding} />
            {/* Background Investigation Service */}
            <Route path="/bis" component={BISDashboard} />
            <Route path="/bis/new" component={BISInvestigation} />
            <Route path="/bis/report/:id" component={BISReport} />
            <Route path="/bis/auto-flag-history" component={BISAutoFlagHistory} />
            <Route path="/bis/:id" component={BISInvestigationDetail} />
            {/* Tier 1 — Security */}
            <Route path="/security/fraud" component={FraudMonitor} />
            <Route path="/security/soc" component={SOCDashboard} />
            <Route path="/security/biometric" component={BiometricAuth} />
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
            {/* Admin */}
            <Route path="/admin" component={AdminPanel} />
            <Route path="/admin/kyb-documents" component={KybDocumentReview} />
            <Route path="/admin/kyb-applications" component={KybApplicationsDashboard} />
            <Route path="/admin/exchange-rates" component={ExchangeRateOverrides} />
            <Route path="/notifications" component={Notifications} />
            <Route path="/settings/notifications" component={NotificationSettings} />
            <Route path="/settings/biometric" component={BiometricSettings} />
            <Route path="/settings/privacy" component={PrivacySettings} />
            <Route path="/admin/bis-queue" component={BISQueueManagement} />
            <Route path="/admin/audit-log" component={AuditLog} />
            <Route path="/admin/users" component={UsersManagement} />
            <Route path="/admin/finance" component={AdminFinanceDashboard} />
            <Route path="/admin/service-health" component={ServiceHealth} />
            <Route path="/admin/ml-services" component={MLServicesDashboard} />
            <Route path="/admin/loyalty-rewards" component={LoyaltyRewardsAdmin} />
            <Route path="/admin/bis-settings" component={BISSettings} />
            <Route path="/admin/bis-auto-flag-settings" component={BISAutoFlagSettings} />
            <Route path="/admin/ha-status" component={HAStatus} />
            <Route path="/admin/provider-onboarding" component={ProviderOnboarding} />
            <Route path="/admin/api-health" component={ApiHealthDashboard} />
            <Route path="/admin/email-preview" component={EmailPreview} />
            {/* PaymentSwitch — Core */}
            <Route path="/paymentswitch" component={PSDashboard} />
            <Route path="/paymentswitch/noc" component={PSNOCDashboard} />
            <Route path="/paymentswitch/admin" component={PSAdminDashboard} />
            <Route path="/paymentswitch/analytics">{() => <PSAnalytics merchantId={0} />}</Route>
            <Route path="/paymentswitch/gateway" component={PSPaymentGateway} />
            <Route path="/paymentswitch/developer" component={PSDeveloperPortal} />
            <Route path="/paymentswitch/remittance" component={PSRemittanceAdmin} />
            <Route path="/paymentswitch/remittance/demo" component={PSRemittanceDemo} />
            <Route path="/paymentswitch/rate-alerts" component={PSRateAlerts} />
            <Route path="/paymentswitch/rate-alerts/analytics" component={PSRateAlertAnalytics} />
            {/* PaymentSwitch — Account Settings */}
            <Route path="/paymentswitch/settings/branding" component={PSBrandingSettings} />
            <Route path="/paymentswitch/settings/trusted-devices" component={PSTrustedDevices} />
            <Route path="/paymentswitch/settings/2fa" component={PSTwoFactorSettings} />
            <Route path="/paymentswitch/settings/activity" component={PSAccountActivity} />
            <Route path="/paymentswitch/settings/notifications" component={PSNotificationSettings} />
            {/* PaymentSwitch — Admin */}
            <Route path="/paymentswitch/admin/correction-patterns" component={PSCorrectionPatternsAdmin} />
            <Route path="/paymentswitch/admin/notification-preferences" component={PSNotificationPreferences} />
            <Route path="/paymentswitch/admin/recovery-requests" component={PSRecoveryRequests} />
            <Route path="/paymentswitch/admin/reminder-emails" component={PSReminderEmailManagement} />
            <Route path="/paymentswitch/admin/onboarding-review" component={PSTechnicalOnboardingReview} />
            {/* PaymentSwitch — Onboarding */}
            <Route path="/paymentswitch/onboarding" component={PSOnboardingPortal} />
            <Route path="/paymentswitch/onboarding/production">{() => <PSProductionGoLive applicationId={0} />}</Route>
            <Route path="/paymentswitch/onboarding/technical">{() => <PSTechnicalOnboarding applicationId={0} />}</Route>
            <Route path="/paymentswitch/onboarding/testing">{() => <PSTestingCertification credentialId={0} />}</Route>
            <Route path="/paymentswitch/onboarding/integration" component={PSIntegrationDevelopment} />
            <Route path="/paymentswitch/onboarding/comparison/:id" component={PSSharedComparisonView} />
            {/* Alias routes for shorter paths */}
            <Route path="/paymentswitch/go-live">{() => <PSProductionGoLive applicationId={0} />}</Route>
            <Route path="/paymentswitch/testing">{() => <PSTestingCertification credentialId={0} />}</Route>
            <Route path="/paymentswitch/settlement" component={PSRemittanceAdmin} />
            <Route path="/paymentswitch/service-status" component={PSServiceStatus} />
            <Route path="/paymentswitch/kill-switch" component={PSKillSwitch} />
            <Route path="/paymentswitch/webhooks" component={PSWebhooks} />
            <Route path="/paymentswitch/rate-limits" component={PSRateLimits} />
            <Route path="/paymentswitch/portal" component={PSPortal} />
            <Route path="/analytics" component={CrossPlatformAnalytics} />
            <Route path="/integration-overview" component={IntegrationOverview} />
            <Route path="/tourist" component={TouristExperience} />
            <Route path="/tourist-portal" component={TouristPortal} />
            <Route path="/tourist/onboarding" component={TouristOnboarding} />
            <Route path="/tourist/itinerary" component={ItineraryBuilder} />
            {/* Public shared trip itinerary — no auth required */}
            <Route path="/trip/:shareToken" component={SharedItinerary} />
            <Route path="/restaurant-onboarding" component={RestaurantOnboarding} />
            {/* Merchant */}
            <Route path="/merchant/revenue" component={MerchantRevenue} />
            <Route path="/merchant/qr" component={MerchantQRCodes} />
            <Route path="/merchant/payouts" component={MerchantPayouts} />
            <Route path="/merchant/stripe-connect" component={StripeConnectOnboarding} />
            <Route path="/merchant/products" component={MerchantProducts} />
            <Route path="/merchant/employee-bis" component={MerchantEmployeeBIS} />
            <Route path="/merchant/staff" component={MerchantStaff} />
            <Route path="/merchant/cashier" component={MerchantCashier} />
            <Route path="/merchant/bookings" component={MerchantBookings} />
            <Route path="/merchant/deals/leaderboard" component={DealLeaderboard} />
            <Route path="/merchant/leaderboard" component={MerchantKpiLeaderboard} />
            <Route path="/merchant/availability" component={ServiceAvailabilityCalendar} />
            <Route path="/merchant/bis-status" component={MerchantBisStatus} />
            <Route path="/merchant/channels" component={ChannelManager} />
            {/* Compliance */}
            <Route path="/compliance" component={ComplianceDashboard} />
            {/* GDS */}
            <Route path="/gds/agent" component={GDSAgentPortal} />
            <Route path="/gds/property" component={GDSPropertyManager} />
            {/* Settlement */}
            <Route path="/settlement" component={SettlementConsole} />
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
