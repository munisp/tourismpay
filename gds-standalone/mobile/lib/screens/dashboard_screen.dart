import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Africa GDS'),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () {},
          ),
          PopupMenuButton(
            itemBuilder: (context) => [
              PopupMenuItem(child: Text(auth.agentName ?? 'Agent')),
              PopupMenuItem(
                onTap: () => auth.logout(),
                child: const Text('Logout'),
              ),
            ],
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Welcome
            Text('Welcome, ${auth.agentName ?? "Agent"}',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text('Tenant: ${auth.tenantId ?? "—"}',
                style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 24),

            // Stats Row
            Row(
              children: [
                _StatCard(title: 'Active PNRs', value: '24', icon: Icons.receipt_long, color: Colors.blue),
                const SizedBox(width: 12),
                _StatCard(title: 'Queue Items', value: '8', icon: Icons.queue, color: Colors.orange),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _StatCard(title: 'Groups', value: '3', icon: Icons.groups, color: Colors.purple),
                const SizedBox(width: 12),
                _StatCard(title: 'Revenue', value: '\$48K', icon: Icons.trending_up, color: Colors.green),
              ],
            ),
            const SizedBox(height: 24),

            // Quick Actions
            Text('Quick Actions', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            _QuickActionGrid(),

            const SizedBox(height: 24),

            // Recent Activity
            Text('Recent Activity', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            _ActivityList(),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          final routes = ['/dashboard', '/search', '/pnr', '/queues', '/profiles'];
          if (index < routes.length) {
            Navigator.pushReplacementNamed(context, routes[index]);
          }
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(icon: Icon(Icons.receipt_long), label: 'PNRs'),
          NavigationDestination(icon: Icon(Icons.queue), label: 'Queues'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profiles'),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({required this.title, required this.value, required this.icon, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: color, size: 28),
              const SizedBox(height: 8),
              Text(value, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
              Text(title, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickActionGrid extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final actions = [
      {'icon': Icons.add_circle, 'label': 'New PNR', 'route': '/pnr'},
      {'icon': Icons.search, 'label': 'Search', 'route': '/search'},
      {'icon': Icons.queue, 'label': 'My Queue', 'route': '/queues'},
      {'icon': Icons.groups, 'label': 'Groups', 'route': '/dashboard'},
      {'icon': Icons.person_add, 'label': 'New Guest', 'route': '/profiles'},
      {'icon': Icons.analytics, 'label': 'Revenue', 'route': '/dashboard'},
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
        childAspectRatio: 1.2,
      ),
      itemCount: actions.length,
      itemBuilder: (context, index) {
        final action = actions[index];
        return Card(
          child: InkWell(
            onTap: () => Navigator.pushNamed(context, action['route'] as String),
            borderRadius: BorderRadius.circular(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(action['icon'] as IconData, size: 32, color: Theme.of(context).colorScheme.primary),
                const SizedBox(height: 4),
                Text(action['label'] as String, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _ActivityList extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final activities = [
      {'title': 'PNR ABC123 ticketed', 'time': '5 min ago', 'icon': Icons.check_circle, 'color': Colors.green},
      {'title': 'Queue item assigned', 'time': '12 min ago', 'icon': Icons.assignment_ind, 'color': Colors.blue},
      {'title': 'Group "Safari Conf" washdown', 'time': '1h ago', 'icon': Icons.warning, 'color': Colors.orange},
      {'title': 'New guest profile created', 'time': '2h ago', 'icon': Icons.person_add, 'color': Colors.purple},
    ];

    return Column(
      children: activities.map((a) => ListTile(
        leading: Icon(a['icon'] as IconData, color: a['color'] as Color),
        title: Text(a['title'] as String),
        trailing: Text(a['time'] as String, style: Theme.of(context).textTheme.bodySmall),
      )).toList(),
    );
  }
}
