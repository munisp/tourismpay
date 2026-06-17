import 'package:flutter/material.dart';

class QueueScreen extends StatelessWidget {
  const QueueScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agent Queues')),
      body: Column(
        children: [
          // Queue Stats
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                _QueueStat(label: 'Pending', count: 8, color: Colors.orange),
                _QueueStat(label: 'Assigned', count: 3, color: Colors.blue),
                _QueueStat(label: 'Completed', count: 15, color: Colors.green),
                _QueueStat(label: 'Breached', count: 1, color: Colors.red),
              ],
            ),
          ),
          const Divider(),
          // Queue Items
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _QueueItem(
                  type: 'Ticketing',
                  title: 'PNR ABC123 - Payment pending',
                  pnr: 'ABC123',
                  priority: 'Critical',
                  sla: '15 min left',
                  priorityColor: Colors.red,
                ),
                _QueueItem(
                  type: 'Schedule Change',
                  title: 'Serena Nairobi date change',
                  pnr: 'XYZ789',
                  priority: 'High',
                  sla: '2h 30m left',
                  priorityColor: Colors.orange,
                ),
                _QueueItem(
                  type: 'Waitlist',
                  title: 'Kempinski Accra confirm request',
                  pnr: 'DEF456',
                  priority: 'Normal',
                  sla: '12h left',
                  priorityColor: Colors.blue,
                ),
                _QueueItem(
                  type: 'Cancellation',
                  title: 'Marriott Cape Town refund',
                  pnr: 'GHI012',
                  priority: 'Normal',
                  sla: '1h 45m left',
                  priorityColor: Colors.blue,
                ),
                _QueueItem(
                  type: 'Quality Control',
                  title: 'Audit: Radisson Blu booking rate',
                  pnr: 'JKL345',
                  priority: 'Low',
                  sla: '24h left',
                  priorityColor: Colors.grey,
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 3,
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

class _QueueStat extends StatelessWidget {
  final String label;
  final int count;
  final Color color;

  const _QueueStat({required this.label, required this.count, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Text('$count', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
          Text(label, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

class _QueueItem extends StatelessWidget {
  final String type;
  final String title;
  final String pnr;
  final String priority;
  final String sla;
  final Color priorityColor;

  const _QueueItem({
    required this.type,
    required this.title,
    required this.pnr,
    required this.priority,
    required this.sla,
    required this.priorityColor,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: priorityColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(priority, style: TextStyle(fontSize: 11, color: priorityColor, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Colors.grey.shade200, borderRadius: BorderRadius.circular(4)),
                  child: Text(type, style: const TextStyle(fontSize: 11)),
                ),
                const Spacer(),
                Text(sla, style: TextStyle(fontSize: 12, color: priorityColor)),
              ],
            ),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: 4),
            Text('PNR: $pnr', style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(child: OutlinedButton(onPressed: () {}, child: const Text('Assign to Me'))),
                const SizedBox(width: 8),
                Expanded(child: FilledButton(onPressed: () {}, child: const Text('Complete'))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
