import 'package:flutter/material.dart';

class CancellationScreen extends StatefulWidget {
  const CancellationScreen({super.key});

  @override
  State<CancellationScreen> createState() => _CancellationScreenState();
}

class _CancellationScreenState extends State<CancellationScreen> {
  Map<String, dynamic>? _result;
  String _selectedPolicy = 'moderate';

  final _presets = {
    'flexible': [
      {'days': '0-1', 'refund': '0%', 'desc': 'Same day: no refund'},
      {'days': '1-3', 'refund': '50%', 'desc': '50% refund'},
      {'days': '3+', 'refund': '100%', 'desc': 'Full refund'},
    ],
    'moderate': [
      {'days': '0-2', 'refund': '0%', 'desc': 'No refund'},
      {'days': '2-7', 'refund': '50%', 'desc': '50% refund'},
      {'days': '7-14', 'refund': '75%', 'desc': '75% refund'},
      {'days': '14+', 'refund': '100%', 'desc': 'Full refund'},
    ],
    'strict': [
      {'days': '0-7', 'refund': '0%', 'desc': 'No refund'},
      {'days': '7-14', 'refund': '25%', 'desc': '25% refund'},
      {'days': '14-30', 'refund': '50%', 'desc': '50% refund'},
      {'days': '30+', 'refund': '100%', 'desc': 'Full refund'},
    ],
    'super_strict': [
      {'days': '0-14', 'refund': '0%', 'desc': 'No refund'},
      {'days': '14-30', 'refund': '25%', 'desc': '25% refund'},
      {'days': '30-60', 'refund': '50%', 'desc': '50% refund'},
      {'days': '60+', 'refund': '75%', 'desc': '75% refund'},
    ],
  };

  void _simulateCancel() {
    setState(() {
      _result = {
        'policy': _selectedPolicy,
        'days_before': 5,
        'fee': 375.0,
        'refund': 375.0,
        'refund_percent': 50,
        'timeline': '5-7 business days',
        'absorption': 'Shared: property 50%, platform 30%, agent 20%',
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Cancellation Policies')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Policy selector
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Select Policy Type', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 12),
                    SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'flexible', label: Text('Flexible')),
                        ButtonSegment(value: 'moderate', label: Text('Moderate')),
                        ButtonSegment(value: 'strict', label: Text('Strict')),
                      ],
                      selected: {_selectedPolicy},
                      onSelectionChanged: (s) => setState(() => _selectedPolicy = s.first),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _simulateCancel,
                        icon: const Icon(Icons.cancel_outlined),
                        label: const Text('Simulate \$750 Cancellation'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Result
            if (_result != null)
              Card(
                color: theme.colorScheme.errorContainer.withOpacity(0.3),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceAround,
                        children: [
                          _resultStat('Fee', '\$${_result!['fee']}', Colors.red),
                          _resultStat('Refund', '\$${_result!['refund']}', Colors.green),
                          _resultStat('Days Out', '${_result!['days_before']}', null),
                        ],
                      ),
                      const Divider(),
                      Text('Timeline: ${_result!['timeline']}', style: theme.textTheme.bodySmall),
                      Text('Absorption: ${_result!['absorption']}', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 16),

            // Policy Tiers
            Text('Policy Tiers: ${_selectedPolicy.replaceAll('_', ' ')}',
                style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: (_presets[_selectedPolicy] ?? []).map((tier) => ListTile(
                  leading: CircleAvatar(
                    backgroundColor: _refundColor(tier['refund']!),
                    child: Text(tier['refund']!, style: const TextStyle(fontSize: 11, color: Colors.white)),
                  ),
                  title: Text(tier['desc']!),
                  subtitle: Text('${tier['days']} days before check-in'),
                )).toList(),
              ),
            ),
            const SizedBox(height: 16),

            // Exceptions
            Text('Exceptions (Full Refund)', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  const ListTile(leading: Icon(Icons.warning_amber), title: Text('Force Majeure'), subtitle: Text('Natural disaster, pandemic, civil unrest')),
                  const ListTile(leading: Icon(Icons.medical_services), title: Text('Medical Emergency'), subtitle: Text('With documentation')),
                  const ListTile(leading: Icon(Icons.flight_land), title: Text('Visa Denial'), subtitle: Text('Official denial letter')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _resultStat(String label, String value, Color? color) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: color)),
        Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      ],
    );
  }

  Color _refundColor(String refund) {
    final pct = int.tryParse(refund.replaceAll('%', '')) ?? 0;
    if (pct >= 75) return Colors.green;
    if (pct >= 50) return Colors.orange;
    return Colors.red;
  }
}
