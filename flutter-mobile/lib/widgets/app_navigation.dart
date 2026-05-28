import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../screens/tourist/tourist_dashboard.dart';
import '../screens/tourist/wallet_screen.dart';
import '../screens/tourist/loyalty_screen.dart';
import '../screens/tourist/itinerary_screen.dart';
import '../screens/tourist/booking_screen.dart';
import '../screens/tourist/qr_scan_screen.dart';
import '../screens/tourist/payment_screen.dart';
import '../screens/tourist/remittance_screen.dart';
import '../screens/tourist/concierge_screen.dart';
import '../screens/tourist/ar_tourism_screen.dart' as ar;
import '../screens/merchant/merchant_dashboard.dart';
import '../screens/merchant/merchant_products.dart';
import '../screens/merchant/merchant_bookings.dart';
import '../screens/merchant/merchant_revenue.dart';
import '../screens/merchant/merchant_qr_codes.dart';
import '../screens/merchant/merchant_staff.dart';
import '../screens/merchant/kyb_onboarding.dart';
import '../screens/admin/admin_dashboard.dart';
import '../screens/admin/users_management.dart';
import '../screens/admin/kyb_review.dart';
import '../screens/admin/bis_management.dart';
import '../screens/admin/settlement_console.dart';
import '../screens/admin/ml_dashboard_screen.dart' as ml;
import '../screens/admin/payment_switch_screen.dart' as ps;
import '../screens/settings/settings_screen.dart' as settings;
import '../screens/settings/security_screen.dart' as security;
import '../screens/settings/notification_prefs.dart' as notif;
import '../screens/offline/offline_queue_screen.dart' as offline;

/// Navigation item model
class NavItem {
  final String label;
  final IconData icon;
  final String route;
  final String section;
  final List<String> roles;
  final String? badge;

  const NavItem({
    required this.label,
    required this.icon,
    required this.route,
    required this.section,
    this.roles = const [],
    this.badge,
  });
}

/// All navigation items matching PWA AppShell.tsx
const List<NavItem> allNavItems = [
  // Overview
  NavItem(label: 'Dashboard', icon: Icons.dashboard, route: '/dashboard', section: 'Overview'),
  NavItem(label: 'Analytics', icon: Icons.bar_chart, route: '/analytics', section: 'Overview', roles: ['admin', 'compliance_officer', 'noc_operator']),

  // Tourist Services
  NavItem(label: 'Tourist Experience', icon: Icons.explore, route: '/tourist/dashboard', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'Trip Itinerary', icon: Icons.map, route: '/tourist/itinerary', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'Digital Wallet', icon: Icons.account_balance_wallet, route: '/tourist/wallet', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'Loyalty & Rewards', icon: Icons.stars, route: '/tourist/loyalty', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'AI Co-Pilot', icon: Icons.smart_toy, route: '/tourist/concierge', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'AR Tourism', icon: Icons.view_in_ar, route: '/tourist/ar', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'QR Scan & Pay', icon: Icons.qr_code_scanner, route: '/tourist/qr-scan', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'Bookings', icon: Icons.calendar_month, route: '/tourist/bookings', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'Remittance', icon: Icons.send, route: '/tourist/remittance', section: 'Tourist Services', roles: ['tourist', 'admin']),
  NavItem(label: 'Payments', icon: Icons.payment, route: '/tourist/payment', section: 'Tourist Services', roles: ['tourist', 'admin']),

  // Merchant Services
  NavItem(label: 'Revenue Dashboard', icon: Icons.trending_up, route: '/merchant/dashboard', section: 'Merchant Services', roles: ['merchant', 'admin']),
  NavItem(label: 'Product Catalog', icon: Icons.inventory_2, route: '/merchant/products', section: 'Merchant Services', roles: ['merchant', 'admin']),
  NavItem(label: 'Booking Inbox', icon: Icons.inbox, route: '/merchant/bookings', section: 'Merchant Services', roles: ['merchant', 'admin']),
  NavItem(label: 'QR Codes', icon: Icons.qr_code, route: '/merchant/qr-codes', section: 'Merchant Services', roles: ['merchant', 'admin']),
  NavItem(label: 'Payout History', icon: Icons.account_balance, route: '/merchant/revenue', section: 'Merchant Services', roles: ['merchant', 'admin']),
  NavItem(label: 'Staff Management', icon: Icons.people, route: '/merchant/staff', section: 'Merchant Services', roles: ['merchant', 'admin']),
  NavItem(label: 'Business Onboarding', icon: Icons.business, route: '/merchant/kyb', section: 'Merchant Services', roles: ['merchant', 'admin']),

  // Administration
  NavItem(label: 'Admin Panel', icon: Icons.admin_panel_settings, route: '/admin/dashboard', section: 'Administration', roles: ['admin']),
  NavItem(label: 'Users', icon: Icons.manage_accounts, route: '/admin/users', section: 'Administration', roles: ['admin']),
  NavItem(label: 'KYB Review', icon: Icons.fact_check, route: '/admin/kyb-review', section: 'Administration', roles: ['admin', 'compliance_officer']),
  NavItem(label: 'BIS Investigations', icon: Icons.shield, route: '/admin/bis', section: 'Administration', roles: ['admin', 'bis_analyst']),
  NavItem(label: 'Settlement Console', icon: Icons.receipt_long, route: '/admin/settlement', section: 'Administration', roles: ['admin', 'settlement_officer']),
  NavItem(label: 'ML / AI Services', icon: Icons.psychology, route: '/admin/ml', section: 'Administration', roles: ['admin']),
  NavItem(label: 'Payment Switch', icon: Icons.swap_horiz, route: '/admin/payment-switch', section: 'Administration', roles: ['admin', 'noc_operator']),

  // Settings
  NavItem(label: 'Settings', icon: Icons.settings, route: '/settings', section: 'Settings'),
  NavItem(label: 'Security', icon: Icons.fingerprint, route: '/settings/security', section: 'Settings'),
  NavItem(label: 'Notifications', icon: Icons.notifications, route: '/settings/notifications', section: 'Settings'),
  NavItem(label: 'Offline Queue', icon: Icons.cloud_off, route: '/offline/queue', section: 'Settings'),
];

/// Main app shell with bottom navigation + drawer
class AppNavigation extends StatefulWidget {
  const AppNavigation({super.key});

  @override
  State<AppNavigation> createState() => _AppNavigationState();
}

class _AppNavigationState extends State<AppNavigation> {
  int _currentIndex = 0;
  String _searchQuery = '';
  final TextEditingController _searchController = TextEditingController();

  /// Get bottom tab items based on role
  List<_TabConfig> _getTabsForRole(String role) {
    switch (role) {
      case 'tourist':
        return [
          _TabConfig('Discover', Icons.explore, '/tourist/dashboard'),
          _TabConfig('Wallet', Icons.account_balance_wallet, '/tourist/wallet'),
          _TabConfig('Scan', Icons.qr_code_scanner, '/tourist/qr-scan'),
          _TabConfig('Loyalty', Icons.stars, '/tourist/loyalty'),
          _TabConfig('Profile', Icons.person, '/settings'),
        ];
      case 'merchant':
        return [
          _TabConfig('Dashboard', Icons.dashboard, '/merchant/dashboard'),
          _TabConfig('QR Codes', Icons.qr_code, '/merchant/qr-codes'),
          _TabConfig('Payouts', Icons.account_balance, '/merchant/revenue'),
          _TabConfig('Products', Icons.inventory_2, '/merchant/products'),
          _TabConfig('Profile', Icons.person, '/settings'),
        ];
      case 'admin':
      case 'noc_operator':
      case 'settlement_officer':
      case 'bis_analyst':
      case 'compliance_officer':
        return [
          _TabConfig('Dashboard', Icons.dashboard, '/admin/dashboard'),
          _TabConfig('Users', Icons.people, '/admin/users'),
          _TabConfig('BIS', Icons.shield, '/admin/bis'),
          _TabConfig('Health', Icons.monitor_heart, '/admin/ml'),
          _TabConfig('More', Icons.menu, '/settings'),
        ];
      default:
        return [
          _TabConfig('Home', Icons.home, '/dashboard'),
          _TabConfig('Wallet', Icons.account_balance_wallet, '/tourist/wallet'),
          _TabConfig('Explore', Icons.explore, '/tourist/dashboard'),
          _TabConfig('Settings', Icons.settings, '/settings'),
        ];
    }
  }

  /// Get visible nav items for the drawer based on user role
  List<NavItem> _getVisibleItems(String role) {
    return allNavItems.where((item) {
      if (item.roles.isEmpty) return true;
      return item.roles.contains(role);
    }).toList();
  }

  /// Group items by section
  Map<String, List<NavItem>> _groupBySection(List<NavItem> items) {
    final Map<String, List<NavItem>> groups = {};
    for (final item in items) {
      groups.putIfAbsent(item.section, () => []);
      groups[item.section]!.add(item);
    }
    return groups;
  }

  Widget _getScreenForRoute(String route) {
    switch (route) {
      case '/tourist/dashboard': return const TouristDashboard();
      case '/tourist/wallet': return const WalletScreen();
      case '/tourist/loyalty': return const LoyaltyScreen();
      case '/tourist/itinerary': return const ItineraryScreen();
      case '/tourist/bookings': return const BookingScreen();
      case '/tourist/qr-scan': return const QrScanScreen();
      case '/tourist/payment': return const PaymentScreen();
      case '/tourist/remittance': return const RemittanceScreen();
      case '/tourist/concierge': return const ConciergeScreen();
      case '/tourist/ar': return const ar.ARTourismScreen();
      case '/merchant/dashboard': return const MerchantDashboard();
      case '/merchant/products': return const MerchantProducts();
      case '/merchant/bookings': return const MerchantBookings();
      case '/merchant/revenue': return const MerchantRevenue();
      case '/merchant/qr-codes': return const MerchantQrCodes();
      case '/merchant/staff': return const MerchantStaff();
      case '/merchant/kyb': return const KybOnboarding();
      case '/admin/dashboard': return const AdminDashboard();
      case '/admin/users': return const UsersManagement();
      case '/admin/kyb-review': return const KybReview();
      case '/admin/bis': return const BisManagement();
      case '/admin/settlement': return const SettlementConsole();
      case '/admin/ml': return const ml.MLDashboardScreen();
      case '/admin/payment-switch': return const ps.PaymentSwitchScreen();
      case '/settings': return const settings.SettingsScreen();
      case '/settings/security': return const security.SecurityScreen();
      case '/settings/notifications': return const notif.NotificationPrefsScreen();
      case '/offline/queue': return const offline.OfflineQueueScreen();
      default: return const TouristDashboard();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final role = auth.currentUser?['role'] as String? ?? 'tourist';
    final tabs = _getTabsForRole(role);
    final visibleItems = _getVisibleItems(role);
    final sections = _groupBySection(visibleItems);
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;

    // Current screen based on selected tab
    final currentRoute = _currentIndex < tabs.length ? tabs[_currentIndex].route : tabs[0].route;

    return Scaffold(
      // ─── Drawer (full navigation) ─────────────────────────────────────────
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              // Header with user info
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: colorScheme.primaryContainer.withOpacity(0.3),
                  border: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: colorScheme.primary,
                          child: Text(
                            (auth.currentUser?['name'] as String? ?? 'U')[0].toUpperCase(),
                            style: TextStyle(color: colorScheme.onPrimary, fontWeight: FontWeight.bold),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                auth.currentUser?['name'] as String? ?? 'User',
                                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                              ),
                              Text(
                                auth.currentUser?['email'] as String? ?? '',
                                style: theme.textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    // Role badge
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: colorScheme.primary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        role.replaceAll('_', ' ').toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: colorScheme.primary,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Search bar
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  controller: _searchController,
                  onChanged: (v) => setState(() => _searchQuery = v),
                  decoration: InputDecoration(
                    hintText: 'Search features...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    suffixIcon: _searchQuery.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear, size: 18),
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = '');
                            },
                          )
                        : null,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),
              ),

              // Navigation sections
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  children: sections.entries.map((entry) {
                    final filteredItems = _searchQuery.isEmpty
                        ? entry.value
                        : entry.value.where((i) => i.label.toLowerCase().contains(_searchQuery.toLowerCase())).toList();
                    if (filteredItems.isEmpty) return const SizedBox.shrink();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(left: 12, top: 12, bottom: 4),
                          child: Text(
                            entry.key,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 1.2,
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                        ...filteredItems.map((item) => ListTile(
                          dense: true,
                          leading: Icon(item.icon, size: 20, color: currentRoute == item.route ? colorScheme.primary : colorScheme.onSurfaceVariant),
                          title: Text(
                            item.label,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: currentRoute == item.route ? FontWeight.w600 : FontWeight.normal,
                              color: currentRoute == item.route ? colorScheme.primary : colorScheme.onSurface,
                            ),
                          ),
                          trailing: item.badge != null
                              ? Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: colorScheme.error.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(item.badge!, style: TextStyle(fontSize: 10, color: colorScheme.error, fontWeight: FontWeight.bold)),
                                )
                              : null,
                          selected: currentRoute == item.route,
                          selectedTileColor: colorScheme.primary.withOpacity(0.08),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                          onTap: () {
                            Navigator.pop(context); // Close drawer
                            // Find the tab index or navigate directly
                            final tabIdx = tabs.indexWhere((t) => t.route == item.route);
                            if (tabIdx >= 0) {
                              setState(() => _currentIndex = tabIdx);
                            } else {
                              Navigator.pushNamed(context, item.route);
                            }
                          },
                        )),
                      ],
                    );
                  }).toList(),
                ),
              ),

              // Logout
              const Divider(height: 1),
              ListTile(
                leading: Icon(Icons.logout, color: colorScheme.error),
                title: Text('Logout', style: TextStyle(color: colorScheme.error)),
                onTap: () {
                  auth.logout();
                  Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
                },
              ),
            ],
          ),
        ),
      ),

      // ─── App Bar ──────────────────────────────────────────────────────────
      appBar: AppBar(
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu),
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: Text(tabs[_currentIndex].label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        actions: [
          // Notification bell with badge
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                onPressed: () => Navigator.pushNamed(context, '/settings/notifications'),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: colorScheme.error,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ],
          ),
          // Theme toggle
          IconButton(
            icon: Icon(theme.brightness == Brightness.dark ? Icons.light_mode : Icons.dark_mode),
            onPressed: () {
              // Theme toggle would be handled by a theme provider
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Theme toggle — handled by system settings'), duration: Duration(seconds: 1)),
              );
            },
          ),
        ],
      ),

      // ─── Body ─────────────────────────────────────────────────────────────
      body: _getScreenForRoute(currentRoute),

      // ─── Bottom Navigation Bar ────────────────────────────────────────────
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        height: 65,
        destinations: tabs.map((tab) {
          // Elevated QR scan button for tourist
          if (tab.label == 'Scan' && role == 'tourist') {
            return NavigationDestination(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: colorScheme.primary,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(tab.icon, color: colorScheme.onPrimary, size: 22),
              ),
              label: tab.label,
            );
          }
          return NavigationDestination(
            icon: Icon(tab.icon),
            selectedIcon: Icon(tab.icon, color: colorScheme.primary),
            label: tab.label,
          );
        }).toList(),
      ),
    );
  }
}

class _TabConfig {
  final String label;
  final IconData icon;
  final String route;
  _TabConfig(this.label, this.icon, this.route);
}
