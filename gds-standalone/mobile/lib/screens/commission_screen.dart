import 'package:flutter/material.dart';

class CommissionScreen extends StatefulWidget {
  const CommissionScreen({super.key});

  @override
  State<CommissionScreen> createState() => _CommissionScreenState();
}

class _CommissionScreenState extends State<CommissionScreen> {
  bool _loading = false;
  Map<String, dynamic>? _splitResult;

  final _agentTiers = {
    'Bronze': {'rate': 0.10, 'bookings': '0-50'},
    'Silver': {'rate': 0.12, 'bookings': '51-200'},
    'Gold': {'rate': 0.15, 'bookings': '201-500'},
    'Platinum': {'rate': 0.18, 'bookings': '501+'},
  };

  final _propertyTiers = {
    'SMS Only': {'rate': 0.15, 'payout': 'Mobile Money'},
    'WhatsApp': {'rate': 0.12, 'payout': 'Mobile Money'},
    'Web Lite': {'rate': 0.10, 'payout': 'Bank/Mobile'},
    'Full': {'rate': 0.08, 'payout': 'Bank Transfer'},
  };

  void _simulateSplit() {
    setState(() {
      _loading = true;
    });

    Future.delayed(const Duration(milliseconds: 500), () {
      setState(() {
        _loading = false;
        _splitResult = {
          'gross': 500.0,
          'currency': 'USD',
          'splits': [
            {'party': 'Tax Authority (KRA)', 'amount': 10.0, 'method': 'Govt Remittance'},
            {'party': 'GDS Platform', 'amount': 15.0, 'method': 'Internal Ledger'},
            {'party': 'Agent (Gold)', 'amount': 80.0, 'method': 'Bank Transfer'},
            {'party': 'Field Agent', 'amount': 5.0, 'method': 'Mobile Money'},
            {'party': 'Property Net', 'amount': 390.0, 'method': 'Mobile Money'},
          ],
        };
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Commission Engine')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Simulate button
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _loading ? null : _simulateSplit,
                icon: const Icon(Icons.calculate),
                label: Text(_loading ? 'Calculating...' : 'Simulate \$500 Split'),
              ),
            ),
            const SizedBox(height: 16),

            // Split result
            if (_splitResult != null) ...[
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Payment Split — \$${_splitResult!['gross']} ${_splitResult!['currency']}',
                          style: theme.textTheme.titleMedium),
                      const Divider(),
                      ...(_splitResult!['splits'] as List).map((s) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(s['party'], style: theme.textTheme.bodyMedium),
                                Text(s['method'], style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey)),
                              ],
                            ),
                            Text('\$${s['amount']}',
                                style: theme.textTheme.titleSmall?.copyWith(
                                  color: s['party'].contains('Property') ? Colors.green : theme.colorScheme.primary,
                                  fontWeight: FontWeight.bold,
                                )),
                          ],
                        ),
                      )),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Agent Tiers
            Text('Agent Commission Tiers', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: _agentTiers.entries.map((e) => ListTile(
                  title: Text(e.key),
                  subtitle: Text('${e.value['bookings']} bookings'),
                  trailing: Text('${((e.value['rate'] as double) * 100).toInt()}%',
                      style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.primary)),
                )).toList(),
              ),
            ),
            const SizedBox(height: 16),

            // Property Tiers
            Text('Property Commission Rates', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: _propertyTiers.entries.map((e) => ListTile(
                  title: Text(e.key),
                  subtitle: Text('Payout: ${e.value['payout']}'),
                  trailing: Text('${((e.value['rate'] as double) * 100).toInt()}%',
                      style: theme.textTheme.titleMedium?.copyWith(color: Colors.orange)),
                )).toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
