import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Guest Profiles'),
        actions: [
          IconButton(icon: const Icon(Icons.filter_list), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          // Search
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search guests by name, email, corporate...',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                isDense: true,
              ),
            ),
          ),
          // Filters
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _FilterChip(label: 'All', selected: true),
                _FilterChip(label: 'VIP'),
                _FilterChip(label: 'Corporate'),
                _FilterChip(label: 'Gold+'),
                _FilterChip(label: 'Recent'),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Guest List
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: const [
                _GuestCard(name: 'John Okoro', email: 'j.okoro@corp.ng', tier: 'Gold', stays: 12, ltv: 28500, nationality: 'NG', corporate: 'Dangote Group'),
                _GuestCard(name: 'Fatima Diallo', email: 'fatima.d@mail.sn', tier: 'Platinum', stays: 34, ltv: 87200, nationality: 'SN', corporate: null),
                _GuestCard(name: 'Thabo Mokoena', email: 't.mokoena@safaricom.ke', tier: 'Silver', stays: 7, ltv: 12800, nationality: 'ZA', corporate: 'Safaricom'),
                _GuestCard(name: 'Amara Toure', email: 'amara@toure.ci', tier: 'Gold', stays: 18, ltv: 42000, nationality: 'CI', corporate: null),
                _GuestCard(name: 'David Mwangi', email: 'd.mwangi@equity.ke', tier: 'Bronze', stays: 3, ltv: 5400, nationality: 'KE', corporate: 'Equity Bank'),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        child: const Icon(Icons.person_add),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 4,
        onDestinationSelected: (index) {
          final routes = ['/dashboard', '/search', '/pnr', '/queues', '/profiles'];
          Navigator.pushReplacementNamed(context, routes[index]);
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

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  const _FilterChip({required this.label, this.selected = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) {},
      ),
    );
  }
}

class _GuestCard extends StatelessWidget {
  final String name;
  final String email;
  final String tier;
  final int stays;
  final double ltv;
  final String nationality;
  final String? corporate;

  const _GuestCard({
    required this.name, required this.email, required this.tier,
    required this.stays, required this.ltv, required this.nationality,
    required this.corporate,
  });

  @override
  Widget build(BuildContext context) {
    final tierColor = tier == 'Platinum' ? Colors.purple
        : tier == 'Gold' ? Colors.amber.shade700
        : tier == 'Silver' ? Colors.grey.shade600 : Colors.brown;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  backgroundColor: tierColor.withOpacity(0.2),
                  child: Text(name.split(' ').map((n) => n[0]).join(''), style: TextStyle(color: tierColor)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text(email, style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: tierColor.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
                  child: Text(tier, style: TextStyle(fontSize: 11, color: tierColor, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                _InfoChip(icon: Icons.flag, text: nationality),
                const SizedBox(width: 8),
                _InfoChip(icon: Icons.hotel, text: '$stays stays'),
                const SizedBox(width: 8),
                _InfoChip(icon: Icons.attach_money, text: '\$${(ltv / 1000).toStringAsFixed(1)}K LTV'),
                if (corporate != null) ...[
                  const SizedBox(width: 8),
                  _InfoChip(icon: Icons.business, text: corporate!),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoChip({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: Colors.grey),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}
