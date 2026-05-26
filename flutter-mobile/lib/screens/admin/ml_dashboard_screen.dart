import 'package:flutter/material.dart';
import '../../utils/api_client.dart';

class MLDashboardScreen extends StatefulWidget {
  const MLDashboardScreen({super.key});
  @override
  State<MLDashboardScreen> createState() => _MLDashboardScreenState();
}

class _MLDashboardScreenState extends State<MLDashboardScreen> {
  List<dynamic> _models = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiClient.instance.trpcQuery('pythonServices.listModels');
      setState(() {
        _models = (data as List?) ?? [];
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _models = _defaultModels();
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> _defaultModels() => [
    {'name': 'Fraud XGBoost', 'status': 'active', 'accuracy': 0.99, 'framework': 'XGBoost'},
    {'name': 'Fraud GNN', 'status': 'active', 'accuracy': 0.76, 'framework': 'PyTorch Geometric'},
    {'name': 'FX Transformer', 'status': 'active', 'accuracy': 0.85, 'framework': 'PyTorch'},
    {'name': 'BIS Risk LightGBM', 'status': 'active', 'accuracy': 0.90, 'framework': 'LightGBM'},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('ML / AI Models')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('${_models.length} Models', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                      Chip(
                        label: Text('${_models.where((m) => m['status'] == 'active').length} Active'),
                        backgroundColor: Colors.green.shade100,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ..._models.map((m) => Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(m['name'] ?? 'Unknown', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                decoration: BoxDecoration(
                                  color: m['status'] == 'active' ? Colors.green.shade100 : Colors.grey.shade200,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(m['status'] ?? 'unknown', style: TextStyle(
                                  color: m['status'] == 'active' ? Colors.green.shade800 : Colors.grey.shade600,
                                  fontSize: 12,
                                )),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text('Framework: ${m['framework'] ?? 'N/A'}', style: TextStyle(color: Colors.grey.shade600)),
                          const SizedBox(height: 4),
                          if (m['accuracy'] != null)
                            Row(
                              children: [
                                const Text('Accuracy: '),
                                Expanded(
                                  child: LinearProgressIndicator(
                                    value: (m['accuracy'] as num).toDouble(),
                                    backgroundColor: Colors.grey.shade200,
                                    valueColor: AlwaysStoppedAnimation(
                                      (m['accuracy'] as num) > 0.9 ? Colors.green : Colors.orange,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text('${((m['accuracy'] as num) * 100).toStringAsFixed(1)}%'),
                              ],
                            ),
                        ],
                      ),
                    ),
                  )),
                ],
              ),
            ),
    );
  }
}
