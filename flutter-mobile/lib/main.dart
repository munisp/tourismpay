import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/auth_provider.dart';
import 'providers/wallet_provider.dart';
import 'providers/connectivity_provider.dart';
import 'providers/sync_provider.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/tourist/tourist_dashboard.dart';
import 'screens/tourist/wallet_screen.dart';
import 'screens/tourist/payment_screen.dart';
import 'screens/tourist/qr_scan_screen.dart';
import 'screens/tourist/booking_screen.dart';
import 'screens/tourist/itinerary_screen.dart';
import 'screens/tourist/remittance_screen.dart';
import 'screens/tourist/concierge_screen.dart';
import 'screens/tourist/ar_tourism_screen.dart';
import 'screens/tourist/loyalty_screen.dart';
import 'screens/merchant/merchant_dashboard.dart';
import 'screens/merchant/merchant_products.dart';
import 'screens/merchant/merchant_bookings.dart';
import 'screens/merchant/merchant_revenue.dart';
import 'screens/merchant/merchant_qr_codes.dart';
import 'screens/merchant/merchant_staff.dart';
import 'screens/merchant/kyb_onboarding.dart';
import 'screens/admin/admin_dashboard.dart';
import 'screens/admin/users_management.dart';
import 'screens/admin/kyb_review.dart';
import 'screens/admin/bis_management.dart';
import 'screens/admin/settlement_console.dart';
import 'screens/admin/ml_dashboard_screen.dart';
import 'screens/admin/payment_switch_screen.dart';
import 'screens/settings/settings_screen.dart';
import 'screens/settings/security_screen.dart';
import 'screens/settings/notification_prefs.dart';
import 'screens/offline/offline_queue_screen.dart';
import 'widgets/app_navigation.dart';
import 'utils/theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TourismPayApp());
}

class TourismPayApp extends StatelessWidget {
  const TourismPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => WalletProvider()),
        ChangeNotifierProvider(create: (_) => ConnectivityProvider()),
        ChangeNotifierProvider(create: (_) => SyncProvider()),
      ],
      child: MaterialApp(
        title: 'TourismPay',
        debugShowCheckedModeBanner: false,
        theme: TourismPayTheme.lightTheme,
        darkTheme: TourismPayTheme.darkTheme,
        themeMode: ThemeMode.system,
        initialRoute: '/',
        routes: {
          '/': (context) => const SplashScreen(),
          '/login': (context) => const LoginScreen(),
          // Main app shell with bottom nav + drawer (post-auth)
          '/home': (context) => const AppNavigation(),
          // Tourist routes (still accessible via Navigator.pushNamed from drawer)
          '/tourist/dashboard': (context) => const TouristDashboard(),
          '/tourist/wallet': (context) => const WalletScreen(),
          '/tourist/payment': (context) => const PaymentScreen(),
          '/tourist/qr-scan': (context) => const QrScanScreen(),
          '/tourist/bookings': (context) => const BookingScreen(),
          '/tourist/itinerary': (context) => const ItineraryScreen(),
          '/tourist/remittance': (context) => const RemittanceScreen(),
          '/tourist/concierge': (context) => const ConciergeScreen(),
          '/tourist/ar': (context) => const ARTourismScreen(),
          '/tourist/loyalty': (context) => const LoyaltyScreen(),
          // Merchant routes
          '/merchant/dashboard': (context) => const MerchantDashboard(),
          '/merchant/products': (context) => const MerchantProducts(),
          '/merchant/bookings': (context) => const MerchantBookings(),
          '/merchant/revenue': (context) => const MerchantRevenue(),
          '/merchant/qr-codes': (context) => const MerchantQrCodes(),
          '/merchant/staff': (context) => const MerchantStaff(),
          '/merchant/kyb': (context) => const KybOnboarding(),
          // Admin routes
          '/admin/dashboard': (context) => const AdminDashboard(),
          '/admin/users': (context) => const UsersManagement(),
          '/admin/kyb-review': (context) => const KybReview(),
          '/admin/bis': (context) => const BisManagement(),
          '/admin/settlement': (context) => const SettlementConsole(),
          '/admin/ml': (context) => const MLDashboardScreen(),
          '/admin/payment-switch': (context) => const PaymentSwitchScreen(),
          // Settings
          '/settings': (context) => const SettingsScreen(),
          '/settings/security': (context) => const SecurityScreen(),
          '/settings/notifications': (context) => const NotificationPrefsScreen(),
          // Offline
          '/offline/queue': (context) => const OfflineQueueScreen(),
        },
      ),
    );
  }
}
