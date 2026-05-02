import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../providers/sync_provider.dart';

class MerchantDashboard extends StatefulWidget {
  const MerchantDashboard({super.key});

  @override
  State<MerchantDashboard> createState() => _MerchantDashboardState();
}

class _MerchantDashboardState extends State<MerchantDashboard> {
  @override
  void initState() {
    super.initState();
    final sync = context.read<SyncProvider>();
    final connectivity = context.read<ConnectivityProvider>();
    sync.startAutoSync(connectivity.syncIntervalMs);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final connectivity = context.watch<ConnectivityProvider>();
    final sync = context.watch<SyncProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Merchant Dashboard'),
        actions: [
          if (sync.hasPending)
            Badge(
              label: Text('${sync.pendingCount}'),
              child: IconButton(
                icon: const Icon(Icons.cloud_off),
                onPressed: () => Navigator.pushNamed(context, '/offline/queue'),
              ),
            ),
          if (!connectivity.isOnline)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Icon(Icons.signal_wifi_off, color: Colors.orange),
            ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => Navigator.pushNamed(context, '/settings'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {},
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 28,
                        backgroundColor: Theme.of(context).primaryColor,
                        child: Text(
                          auth.userName.isNotEmpty ? auth.userName[0].toUpperCase() : '?',
                          style: const TextStyle(fontSize: 24, color: Colors.white),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Welcome, ${auth.userName}',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                            Text(auth.userEmail,
                              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              // Connectivity indicator
              if (!connectivity.isOnline || connectivity.quality == ConnectionQuality.critical)
                Card(
                  color: connectivity.isOnline ? Colors.orange.shade50 : Colors.red.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Icon(
                          connectivity.isOnline ? Icons.signal_wifi_bad : Icons.signal_wifi_off,
                          color: connectivity.isOnline ? Colors.orange : Colors.red,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            connectivity.isOnline
                              ? 'Low connectivity - operating in offline mode'
                              : 'No internet - transactions will sync when connected',
                            style: TextStyle(color: connectivity.isOnline ? Colors.orange.shade800 : Colors.red.shade800),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              // Feature grid
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                children: [
              _DashboardCard(
                title: 'Products',
                icon: Icons.inventory,
                onTap: () => Navigator.pushNamed(context, '/merchant/products'),
              ),
              _DashboardCard(
                title: 'Bookings',
                icon: Icons.calendar_today,
                onTap: () => Navigator.pushNamed(context, '/merchant/bookings'),
              ),
              _DashboardCard(
                title: 'Revenue',
                icon: Icons.bar_chart,
                onTap: () => Navigator.pushNamed(context, '/merchant/revenue'),
              ),
              _DashboardCard(
                title: 'QR Codes',
                icon: Icons.qr_code,
                onTap: () => Navigator.pushNamed(context, '/merchant/qr-codes'),
              ),
              _DashboardCard(
                title: 'Staff',
                icon: Icons.people,
                onTap: () => Navigator.pushNamed(context, '/merchant/staff'),
              ),
              _DashboardCard(
                title: 'KYB',
                icon: Icons.verified_user,
                onTap: () => Navigator.pushNamed(context, '/merchant/kyb'),
              ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashboardCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final VoidCallback onTap;

  const _DashboardCard({required this.title, required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 40, color: Theme.of(context).primaryColor),
              const SizedBox(height: 12),
              Text(title, textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}
