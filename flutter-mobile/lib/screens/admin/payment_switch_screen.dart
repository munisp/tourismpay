import 'package:flutter/material.dart';
import '../../utils/api_client.dart';

class PaymentSwitchScreen extends StatefulWidget {
  const PaymentSwitchScreen({super.key});
  @override
  State<PaymentSwitchScreen> createState() => _PaymentSwitchScreenState();
}

class _PaymentSwitchScreenState extends State<PaymentSwitchScreen> {
  Map<String, dynamic>? _dashboard;
  List<dynamic> _settlements = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await Future.wait([
        ApiClient.instance.trpcQuery('paymentSwitch.getDashboard'),
        ApiClient.instance.trpcQuery('paymentSwitch.listSettlements'),
      ]);
      setState(() {
        _dashboard = results[0] as Map<String, dynamic>?;
        _settlements = (results[1] as List?) ?? [];
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment Switch')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildStatusCards(),
                  const SizedBox(height: 16),
                  const Text('Settlements', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ..._settlements.map((s) => Card(
                    child: ListTile(
                      title: Text('Settlement #${s['id'] ?? ''}'),
                      subtitle: Text('${s['status'] ?? 'pending'} — ${s['currency'] ?? ''} ${s['amount'] ?? 0}'),
                      trailing: Text(s['createdAt']?.toString().substring(0, 10) ?? ''),
                    ),
                  )),
                  if (_settlements.isEmpty)
                    const Center(child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text('No settlements yet'),
                    )),
                ],
              ),
            ),
    );
  }

  Widget _buildStatusCards() {
    final d = _dashboard ?? {};
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      children: [
        _statCard('Participants', '${d['totalParticipants'] ?? 0}', Colors.blue),
        _statCard('Active', '${d['activeParticipants'] ?? 0}', Colors.green),
        _statCard('Settlements', '${d['totalSettlements'] ?? 0}', Colors.orange),
        _statCard('Webhooks', '${d['totalWebhooks'] ?? 0}', Colors.purple),
      ],
    );
  }

  Widget _statCard(String label, String value, Color color) {
    return SizedBox(
      width: 160,
      child: Card(
        color: color.withValues(alpha: 0.1),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(value, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: color)),
              const SizedBox(height: 4),
              Text(label, style: TextStyle(color: color)),
            ],
          ),
        ),
      ),
    );
  }
}
