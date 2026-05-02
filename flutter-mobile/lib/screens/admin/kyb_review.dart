import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/connectivity_provider.dart';
import '../../utils/api_client.dart';
import '../../utils/offline_db.dart';

class KybReview extends StatefulWidget {
  const KybReview({super.key});

  @override
  State<KybReview> createState() => _KybReviewState();
}

class _KybReviewState extends State<KybReview> {
  final ApiClient _api = ApiClient();
  final OfflineDb _offlineDb = OfflineDb();
  List<Map<String, dynamic>> _items = [];
  bool _isLoading = true;
  String? _error;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      // Try API first, fall back to cache
      final data = await _api.trpcQuery('system.health');
      _items = []; // Populate from API response
      await _offlineDb.cacheData('kybreview_list', {'items': _items}, ttlSeconds: 300);
    } catch (e) {
      final cached = await _offlineDb.getCachedData('kybreview_list');
      if (cached != null) {
        _items = List<Map<String, dynamic>>.from(cached['items'] ?? []);
      } else {
        _error = 'Unable to load data';
      }
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    final connectivity = context.watch<ConnectivityProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('KYB Applications'),
        actions: [
          if (!connectivity.isOnline)
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Icon(Icons.cloud_off, color: Colors.orange),
            ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _loadData),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search kyb applications...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(() => _searchQuery = ''))
                  : null,
              ),
              onChanged: (v) => setState(() => _searchQuery = v),
            ),
          ),
          // Content
          Expanded(
            child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.cloud_off, size: 64, color: Colors.grey.shade400),
                        const SizedBox(height: 16),
                        Text(_error!, style: Theme.of(context).textTheme.bodyLarge),
                        const SizedBox(height: 16),
                        ElevatedButton(onPressed: _loadData, child: const Text('Retry')),
                      ],
                    ),
                  )
                : _items.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.fact_check, size: 64, color: Colors.grey.shade300),
                          const SizedBox(height: 16),
                          Text('No kyb applications found', style: Theme.of(context).textTheme.bodyLarge),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadData,
                      child: ListView.builder(
                        itemCount: _items.length,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        itemBuilder: (context, index) {
                          final item = _items[index];
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(child: Icon(Icons.fact_check)),
                              title: Text(item['name']?.toString() ?? 'Item ${index + 1}'),
                              subtitle: Text(item['status']?.toString() ?? ''),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () {},
                            ),
                          );
                        },
                      ),
                    ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        child: const Icon(Icons.add),
      ),
    );
  }
}
