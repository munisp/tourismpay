import 'package:flutter/material.dart';
import '../../utils/api_client.dart';

class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key});
  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  Map<String, dynamic>? _account;
  List<dynamic> _rewards = [];
  List<dynamic> _history = [];
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
        ApiClient.instance.trpcQuery('loyalty.getAccount'),
        ApiClient.instance.trpcQuery('loyalty.listRewards'),
        ApiClient.instance.trpcQuery('loyalty.getHistory'),
      ]);
      setState(() {
        _account = results[0] as Map<String, dynamic>?;
        _rewards = (results[1] as List?) ?? [];
        _history = (results[2] as List?) ?? [];
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  String get _tier {
    final pts = (_account?['points'] as num?)?.toInt() ?? 0;
    if (pts >= 10000) return 'Platinum';
    if (pts >= 5000) return 'Gold';
    if (pts >= 1000) return 'Silver';
    return 'Bronze';
  }

  Color get _tierColor {
    switch (_tier) {
      case 'Platinum': return Colors.indigo;
      case 'Gold': return Colors.amber;
      case 'Silver': return Colors.grey;
      default: return Colors.brown;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Loyalty & Rewards')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildTierCard(),
                  const SizedBox(height: 16),
                  const Text('Available Rewards', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ..._rewards.map((r) => Card(
                    child: ListTile(
                      leading: const Icon(Icons.card_giftcard, color: Colors.orange),
                      title: Text(r['name'] ?? 'Reward'),
                      subtitle: Text('${r['pointsCost'] ?? 0} points'),
                      trailing: ElevatedButton(
                        onPressed: () => _redeem(r['id']),
                        child: const Text('Redeem'),
                      ),
                    ),
                  )),
                  const SizedBox(height: 16),
                  const Text('Recent Activity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  ..._history.map((h) => ListTile(
                    leading: Icon(
                      (h['points'] as num?)?.toInt() != null && (h['points'] as num).toInt() > 0
                          ? Icons.add_circle : Icons.remove_circle,
                      color: (h['points'] as num?)?.toInt() != null && (h['points'] as num).toInt() > 0
                          ? Colors.green : Colors.red,
                    ),
                    title: Text(h['description'] ?? ''),
                    subtitle: Text(h['date']?.toString().substring(0, 10) ?? ''),
                    trailing: Text('${(h['points'] as num?)?.toInt() ?? 0} pts'),
                  )),
                ],
              ),
            ),
    );
  }

  Widget _buildTierCard() {
    final pts = (_account?['points'] as num?)?.toInt() ?? 0;
    return Card(
      color: _tierColor.withValues(alpha: 0.1),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            Icon(Icons.star, size: 48, color: _tierColor),
            const SizedBox(height: 8),
            Text(_tier, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: _tierColor)),
            Text('$pts points', style: TextStyle(fontSize: 16, color: _tierColor.withValues(alpha: 0.7))),
          ],
        ),
      ),
    );
  }

  Future<void> _redeem(dynamic id) async {
    if (id == null) return;
    try {
      await ApiClient.instance.trpcMutation('loyalty.redeemReward', {'rewardId': id});
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Redemption failed')));
      }
    }
  }
}
