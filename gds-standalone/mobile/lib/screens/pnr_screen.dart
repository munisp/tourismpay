import 'package:flutter/material.dart';

class PNRScreen extends StatefulWidget {
  const PNRScreen({super.key});

  @override
  State<PNRScreen> createState() => _PNRScreenState();
}

class _PNRScreenState extends State<PNRScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PNR Management'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Active'),
            Tab(text: 'Ticketed'),
            Tab(text: 'Cancelled'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _PNRList(status: 'active'),
          _PNRList(status: 'ticketed'),
          _PNRList(status: 'cancelled'),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreatePNR(context),
        icon: const Icon(Icons.add),
        label: const Text('New PNR'),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 2,
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

  void _showCreatePNR(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: 16, right: 16, top: 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Create PNR', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            const TextField(decoration: InputDecoration(labelText: 'Guest Name', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            const TextField(decoration: InputDecoration(labelText: 'Email', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: 'Segment Type', border: OutlineInputBorder()),
              items: ['Hotel', 'Transfer', 'Activity', 'Flight', 'Insurance'].map((s) =>
                DropdownMenuItem(value: s.toLowerCase(), child: Text(s)),
              ).toList(),
              onChanged: (_) {},
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Check-in', border: OutlineInputBorder()))),
                const SizedBox(width: 12),
                Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Check-out', border: OutlineInputBorder()))),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Create PNR')),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _PNRList extends StatelessWidget {
  final String status;
  const _PNRList({required this.status});

  @override
  Widget build(BuildContext context) {
    // Mock data
    final pnrs = List.generate(5, (i) => {
      'locator': '${status.substring(0, 1).toUpperCase()}${(100 + i).toString()}XYZ',
      'guest': ['John Okoro', 'Fatima Diallo', 'Thabo Mokoena', 'Amara Toure', 'David Mwangi'][i],
      'property': ['Serena Nairobi', 'Radisson Blu Lagos', 'Kempinski Accra', 'Fairmont Zanzibar', 'Marriott Cape Town'][i],
      'dates': '${10 + i} Jul - ${13 + i} Jul 2026',
      'amount': '\$${(800 + i * 200)}',
    });

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: pnrs.length,
      itemBuilder: (context, index) {
        final pnr = pnrs[index];
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: status == 'active' ? Colors.green : (status == 'ticketed' ? Colors.blue : Colors.red),
              child: Text(pnr['locator']!.substring(0, 2), style: const TextStyle(color: Colors.white, fontSize: 12)),
            ),
            title: Text(pnr['locator']!),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(pnr['guest']!),
                Text('${pnr['property']} • ${pnr['dates']}', style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
            trailing: Text(pnr['amount']!, style: const TextStyle(fontWeight: FontWeight.bold)),
            isThreeLine: true,
            onTap: () {},
          ),
        );
      },
    );
  }
}
