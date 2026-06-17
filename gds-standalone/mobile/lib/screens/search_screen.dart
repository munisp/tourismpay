import 'package:flutter/material.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  String _selectedCountry = 'KE';
  final _countries = {
    'KE': 'Kenya', 'NG': 'Nigeria', 'ZA': 'South Africa', 'GH': 'Ghana',
    'TZ': 'Tanzania', 'RW': 'Rwanda', 'EG': 'Egypt', 'MA': 'Morocco',
    'UG': 'Uganda', 'ET': 'Ethiopia', 'SN': 'Senegal', 'MU': 'Mauritius',
    'BW': 'Botswana', 'NA': 'Namibia', 'ZW': 'Zimbabwe',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search Properties')),
      body: Column(
        children: [
          // Search Filters
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).colorScheme.surfaceVariant.withOpacity(0.3),
            child: Column(
              children: [
                DropdownButtonFormField<String>(
                  value: _selectedCountry,
                  decoration: const InputDecoration(labelText: 'Country', border: OutlineInputBorder(), isDense: true),
                  items: _countries.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
                  onChanged: (v) => setState(() => _selectedCountry = v!),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Check-in', border: OutlineInputBorder(), isDense: true, prefixIcon: Icon(Icons.calendar_today, size: 18)))),
                    const SizedBox(width: 12),
                    Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Check-out', border: OutlineInputBorder(), isDense: true, prefixIcon: Icon(Icons.calendar_today, size: 18)))),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Guests', border: OutlineInputBorder(), isDense: true), keyboardType: TextInputType.number)),
                    const SizedBox(width: 12),
                    Expanded(child: FilledButton.icon(onPressed: () {}, icon: const Icon(Icons.search), label: const Text('Search'))),
                  ],
                ),
              ],
            ),
          ),
          // Results
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _PropertyCard(name: 'Serena Hotel Nairobi', country: 'Kenya', stars: 5, rate: 280, currency: 'USD', type: 'Luxury Hotel', image: Icons.hotel),
                _PropertyCard(name: 'Giraffe Manor', country: 'Kenya', stars: 5, rate: 750, currency: 'USD', type: 'Boutique Lodge', image: Icons.villa),
                _PropertyCard(name: 'Ol Pejeta Bush Camp', country: 'Kenya', stars: 4, rate: 450, currency: 'USD', type: 'Safari Camp', image: Icons.forest),
                _PropertyCard(name: 'Hemingways Watamu', country: 'Kenya', stars: 5, rate: 380, currency: 'USD', type: 'Beach Resort', image: Icons.beach_access),
                _PropertyCard(name: 'Fairmont Mt Kenya', country: 'Kenya', stars: 5, rate: 320, currency: 'USD', type: 'Mountain Lodge', image: Icons.landscape),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 1,
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

class _PropertyCard extends StatelessWidget {
  final String name;
  final String country;
  final int stars;
  final double rate;
  final String currency;
  final String type;
  final IconData image;

  const _PropertyCard({
    required this.name, required this.country, required this.stars,
    required this.rate, required this.currency, required this.type, required this.image,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
              child: Icon(image, size: 40, color: Colors.green.shade700),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Row(children: List.generate(stars, (_) => const Icon(Icons.star, size: 14, color: Colors.amber))),
                  const SizedBox(height: 4),
                  Text('$type • $country', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('\$$rate', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                Text('/night', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 8),
                FilledButton(onPressed: () {}, style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 12)), child: const Text('Book')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
