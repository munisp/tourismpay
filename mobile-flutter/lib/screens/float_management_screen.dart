import 'package:flutter/material.dart';
import '../services/api_service.dart';

class FloatManagementScreen extends StatefulWidget {
  const FloatManagementScreen({super.key});

  @override
  State<FloatManagementScreen> createState() => _FloatManagementScreenState();
}

class _FloatManagementScreenState extends State<FloatManagementScreen> {
  final _api = ApiService();
  bool _loading = true;
  Map<String, dynamic>? _data;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      setState(() { _loading = true; _error = null; });
      final response = await _api.get('/float/balance');
      setState(() { _data = response; _loading = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Float Management')),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(_error!, style: const TextStyle(color: Colors.red)),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: _loadData,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      Text(
                        'Float Management',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 16),
                      if (_data != null)
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(_data.toString()),
                          ),
                        )
                      else
                        const Card(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: Text('No data available'),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}
