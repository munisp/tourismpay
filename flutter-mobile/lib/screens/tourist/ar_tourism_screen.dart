import 'package:flutter/material.dart';
import '../../utils/api_client.dart';

class ARTourismScreen extends StatefulWidget {
  const ARTourismScreen({super.key});
  @override
  State<ARTourismScreen> createState() => _ARTourismScreenState();
}

class _ARTourismScreenState extends State<ARTourismScreen> {
  List<dynamic> _experiences = [];
  bool _loading = true;
  String _selectedCategory = 'all';

  final _categories = ['all', 'landmark', 'cultural_site', 'heritage_trail', 'wildlife', 'market'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiClient.instance.trpcQuery('arTourism.list');
      setState(() {
        _experiences = (data as Map?)?['experiences'] ?? [];
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  List<dynamic> get _filtered {
    if (_selectedCategory == 'all') return _experiences;
    return _experiences.where((e) => e['category'] == _selectedCategory).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AR Tourism'),
        actions: [
          IconButton(icon: const Icon(Icons.my_location), onPressed: _loadNearby),
        ],
      ),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: _categories.map((cat) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  label: Text(cat == 'all' ? 'All' : cat.replaceAll('_', ' ')),
                  selected: _selectedCategory == cat,
                  onSelected: (_) => setState(() => _selectedCategory = cat),
                ),
              )).toList(),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _filtered.length,
                      itemBuilder: (ctx, i) => _buildExperienceCard(_filtered[i]),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildExperienceCard(dynamic exp) {
    final categoryIcons = {
      'landmark': Icons.location_city,
      'cultural_site': Icons.museum,
      'heritage_trail': Icons.hiking,
      'wildlife': Icons.pets,
      'market': Icons.storefront,
      'restaurant': Icons.restaurant,
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(categoryIcons[exp['category']] ?? Icons.explore, size: 32, color: Colors.teal),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(exp['name'] ?? '', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      Text('${exp['city'] ?? ''}, ${exp['country'] ?? ''}', style: TextStyle(color: Colors.grey.shade600)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.teal.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text('${exp['duration'] ?? 0} min', style: TextStyle(color: Colors.teal.shade800, fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(exp['description'] ?? '', style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            Row(
              children: [
                _difficultyChip(exp['difficulty'] ?? 'easy'),
                const Spacer(),
                ElevatedButton.icon(
                  icon: const Icon(Icons.view_in_ar, size: 16),
                  label: const Text('Start AR'),
                  onPressed: () => _startExperience(exp['id']),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _difficultyChip(String difficulty) {
    final colors = {'easy': Colors.green, 'moderate': Colors.orange, 'advanced': Colors.red};
    return Chip(
      label: Text(difficulty, style: TextStyle(color: colors[difficulty] ?? Colors.grey, fontSize: 12)),
      backgroundColor: (colors[difficulty] ?? Colors.grey).withValues(alpha: 0.1),
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
    );
  }

  Future<void> _startExperience(String? id) async {
    if (id == null) return;
    try {
      await ApiClient.instance.trpcMutation('arTourism.startExperience', {'experienceId': id, 'deviceType': 'arcore'});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('AR experience started!')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed to start AR')));
      }
    }
  }

  Future<void> _loadNearby() async {
    // In production, use geolocator package to get real position
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Finding nearby AR experiences...')),
    );
  }
}
