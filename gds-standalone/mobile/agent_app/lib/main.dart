/// Africa GDS — Field Agent Onboarding App
/// Flutter tablet application for field agents who visit low-tech
/// establishments and onboard them onto the GDS platform.
///
/// Features:
/// - Photograph rooms, exterior, amenities
/// - Capture GPS coordinates
/// - Fill property details on behalf of owner
/// - Offline-first with background sync
/// - Agent commission tracking
/// - Visit scheduling and route optimization
library;

import 'package:flutter/material.dart';
import 'dart:convert';

void main() => runApp(const AgentApp());

class AgentApp extends StatelessWidget {
  const AgentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Africa GDS Agent',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF0EA5E9),
        scaffoldBackgroundColor: const Color(0xFF0B1120),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF0EA5E9),
          secondary: Color(0xFF8B5CF6),
          surface: Color(0xFF1E293B),
        ),
        cardTheme: const CardTheme(
          color: Color(0xFF1E293B),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
          ),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF0B1120),
          elevation: 0,
        ),
      ),
      home: const AgentDashboard(),
    );
  }
}

// ─── Agent Dashboard ─────────────────────────────────────────────
class AgentDashboard extends StatefulWidget {
  const AgentDashboard({super.key});

  @override
  State<AgentDashboard> createState() => _AgentDashboardState();
}

class _AgentDashboardState extends State<AgentDashboard> {
  int _currentIndex = 0;

  final List<Widget> _pages = [
    const DashboardPage(),
    const OnboardingPage(),
    const VisitsPage(),
    const EarningsPage(),
    const ProfilePage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard), label: 'Dashboard'),
          NavigationDestination(icon: Icon(Icons.add_business), label: 'Onboard'),
          NavigationDestination(icon: Icon(Icons.map), label: 'Visits'),
          NavigationDestination(icon: Icon(Icons.attach_money), label: 'Earnings'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}

// ─── Dashboard Page ──────────────────────────────────────────────
class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                const CircleAvatar(
                  backgroundColor: Color(0xFF0EA5E9),
                  child: Text('JK', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 12),
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('James Kamau', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    Text('Field Agent • Nairobi Region', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
                  ],
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF22C55E).withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Text('Online', style: TextStyle(color: Color(0xFF22C55E), fontSize: 12)),
                ),
              ],
            ),
            const SizedBox(height: 24),

            // Stats Grid
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.6,
              children: const [
                _StatCard(label: 'Properties Onboarded', value: '23', change: '+3 this week'),
                _StatCard(label: 'Visits This Month', value: '45', change: '12 remaining'),
                _StatCard(label: 'Commission Earned', value: 'KES 34.5K', change: '+18%'),
                _StatCard(label: 'Success Rate', value: '87%', change: 'Top 5 agent'),
              ],
            ),
            const SizedBox(height: 24),

            // Pending Visits
            const Text('Today\'s Visits', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            _VisitCard(
              name: 'Sunset Guest House',
              address: 'Mombasa Road, Nairobi',
              time: '10:00 AM',
              status: 'Scheduled',
              type: 'guesthouse',
            ),
            _VisitCard(
              name: 'Savanna Lodge',
              address: 'Ngong Hills',
              time: '2:00 PM',
              status: 'In Progress',
              type: 'lodge',
            ),
            _VisitCard(
              name: 'City Hostel Nairobi',
              address: 'Tom Mboya St',
              time: '4:30 PM',
              status: 'Pending',
              type: 'hostel',
            ),

            const SizedBox(height: 24),
            // Offline Queue
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.cloud_upload, color: Color(0xFF0EA5E9)),
                        const SizedBox(width: 8),
                        const Text('Sync Status', style: TextStyle(fontWeight: FontWeight.w600)),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF22C55E).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Text('All synced', style: TextStyle(color: Color(0xFF22C55E), fontSize: 11)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text('2 properties pending upload • 14 photos queued',
                      style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Onboarding Page ─────────────────────────────────────────────
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  int _step = 0;
  final _formKey = GlobalKey<FormState>();
  String _propertyType = 'hotel';
  final _nameController = TextEditingController();
  final _locationController = TextEditingController();
  final _roomsController = TextEditingController();
  final _rateController = TextEditingController();
  final _phoneController = TextEditingController();
  final _ownerController = TextEditingController();
  List<String> _photos = [];

  final List<String> _steps = [
    'Owner Info',
    'Property Type',
    'Property Details',
    'Photos',
    'Rates & Rooms',
    'Review & Submit',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Property Onboarding'),
        actions: [
          TextButton(
            onPressed: () => setState(() => _step = 0),
            child: const Text('Reset'),
          ),
        ],
      ),
      body: Column(
        children: [
          // Progress stepper
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: List.generate(_steps.length, (i) => Expanded(
                child: Container(
                  height: 4,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: i <= _step ? const Color(0xFF0EA5E9) : const Color(0xFF334155),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              )),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Step ${_step + 1} of ${_steps.length}', style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                Text(_steps[_step], style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Step content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _buildStepContent(),
            ),
          ),

          // Navigation buttons
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                if (_step > 0)
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => setState(() => _step--),
                      child: const Text('Back'),
                    ),
                  ),
                if (_step > 0) const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: () {
                      if (_step < _steps.length - 1) {
                        setState(() => _step++);
                      } else {
                        _submitOnboarding();
                      }
                    },
                    child: Text(_step == _steps.length - 1 ? 'Submit & Register' : 'Next'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepContent() {
    switch (_step) {
      case 0:
        return _buildOwnerInfo();
      case 1:
        return _buildPropertyType();
      case 2:
        return _buildPropertyDetails();
      case 3:
        return _buildPhotos();
      case 4:
        return _buildRatesRooms();
      case 5:
        return _buildReview();
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildOwnerInfo() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Owner/Manager Information', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        TextField(
          controller: _ownerController,
          decoration: const InputDecoration(
            labelText: 'Owner Name',
            hintText: 'Full name of property owner',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.person),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'Phone Number',
            hintText: '+254 7XX XXX XXX',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.phone),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: const [
                Icon(Icons.info_outline, color: Color(0xFF0EA5E9), size: 20),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'The owner will receive booking alerts via SMS. They can upgrade to WhatsApp or Web later.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPropertyType() {
    final types = [
      {'id': 'hotel', 'label': 'Hotel', 'icon': Icons.hotel},
      {'id': 'lodge', 'label': 'Lodge / Safari Camp', 'icon': Icons.landscape},
      {'id': 'guesthouse', 'label': 'Guesthouse / B&B', 'icon': Icons.house},
      {'id': 'hostel', 'label': 'Hostel / Backpackers', 'icon': Icons.bunk_bed},
      {'id': 'apartment', 'label': 'Apartment / Villa', 'icon': Icons.apartment},
      {'id': 'eco_lodge', 'label': 'Eco-Lodge / Tented', 'icon': Icons.park},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Select Property Type', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        ...types.map((t) => Card(
          color: _propertyType == t['id'] ? const Color(0xFF0EA5E9).withOpacity(0.15) : null,
          child: ListTile(
            leading: Icon(t['icon'] as IconData, color: _propertyType == t['id'] ? const Color(0xFF0EA5E9) : null),
            title: Text(t['label'] as String),
            trailing: _propertyType == t['id'] ? const Icon(Icons.check_circle, color: Color(0xFF0EA5E9)) : null,
            onTap: () => setState(() => _propertyType = t['id'] as String),
          ),
        )),
      ],
    );
  }

  Widget _buildPropertyDetails() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Property Details', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        TextField(
          controller: _nameController,
          decoration: const InputDecoration(
            labelText: 'Property Name',
            hintText: 'e.g., Serengeti Sunset Lodge',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _locationController,
          decoration: const InputDecoration(
            labelText: 'Location',
            hintText: 'City/Town, Country',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.location_on),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () {/* GPS capture */},
          icon: const Icon(Icons.my_location),
          label: const Text('Capture GPS Coordinates'),
        ),
        const SizedBox(height: 8),
        const Text('GPS: -1.2921, 36.8219 (captured)', style: TextStyle(color: Color(0xFF22C55E), fontSize: 12)),
      ],
    );
  }

  Widget _buildPhotos() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Property Photos', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        const Text('Take photos of the property to improve listing quality', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13)),
        const SizedBox(height: 16),
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 3,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          children: [
            _photoSlot('Exterior', Icons.home),
            _photoSlot('Best Room', Icons.bed),
            _photoSlot('Bathroom', Icons.bathtub),
            _photoSlot('Dining', Icons.restaurant),
            _photoSlot('Lobby', Icons.door_front),
            _photoSlot('Add More', Icons.add_a_photo),
          ],
        ),
        const SizedBox(height: 16),
        const Text('Minimum 3 photos recommended for Tier 2 (WhatsApp)', style: TextStyle(color: Color(0xFFF59E0B), fontSize: 12)),
      ],
    );
  }

  Widget _photoSlot(String label, IconData icon) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: const Color(0xFF334155)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: const Color(0xFF94A3B8)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
        ],
      ),
    );
  }

  Widget _buildRatesRooms() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Rates & Availability', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        TextField(
          controller: _roomsController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Total Rooms Available',
            hintText: 'e.g., 12',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.meeting_room),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _rateController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Base Rate Per Night',
            hintText: 'In local currency',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.payments),
            suffixText: 'KES',
          ),
        ),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text('Suggested Tier Assignment', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                SizedBox(height: 8),
                Text('Based on owner\'s phone type and connectivity:', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                SizedBox(height: 8),
                Text('• Feature phone → Tier 1 (SMS Only)', style: TextStyle(fontSize: 12)),
                Text('• Smartphone, no data → Tier 2 (WhatsApp)', style: TextStyle(fontSize: 12)),
                Text('• Smartphone + data → Tier 3 (Web Lite)', style: TextStyle(fontSize: 12)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReview() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Review & Submit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _reviewRow('Owner', _ownerController.text.isEmpty ? 'Not set' : _ownerController.text),
                _reviewRow('Phone', _phoneController.text.isEmpty ? 'Not set' : _phoneController.text),
                _reviewRow('Type', _propertyType),
                _reviewRow('Name', _nameController.text.isEmpty ? 'Not set' : _nameController.text),
                _reviewRow('Location', _locationController.text.isEmpty ? 'Not set' : _locationController.text),
                _reviewRow('Rooms', _roomsController.text.isEmpty ? 'Not set' : _roomsController.text),
                _reviewRow('Rate', _rateController.text.isEmpty ? 'Not set' : 'KES ${_rateController.text}/night'),
                _reviewRow('Photos', '${_photos.length} captured'),
                _reviewRow('Starting Tier', 'SMS Only (Tier 1)'),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          color: const Color(0xFF22C55E).withOpacity(0.1),
          child: const Padding(
            padding: EdgeInsets.all(12),
            child: Row(
              children: [
                Icon(Icons.info, color: Color(0xFF22C55E)),
                SizedBox(width: 8),
                Expanded(child: Text(
                  'Owner will receive a confirmation SMS. They can manage bookings immediately by replying YES/NO.',
                  style: TextStyle(fontSize: 12),
                )),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 80, child: Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 13))),
          Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 13))),
        ],
      ),
    );
  }

  void _submitOnboarding() {
    // In production: save to local DB, queue for sync
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Property Registered!'),
        content: const Text('The property has been added to Africa GDS. The owner will receive a confirmation SMS.'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              setState(() => _step = 0);
            },
            child: const Text('Done'),
          ),
        ],
      ),
    );
  }
}

// ─── Visits Page ─────────────────────────────────────────────────
class VisitsPage extends StatelessWidget {
  const VisitsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scheduled Visits')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _VisitCard(name: 'Sunset Guest House', address: 'Mombasa Road', time: '10:00 AM', status: 'Scheduled', type: 'guesthouse'),
          _VisitCard(name: 'Savanna Lodge', address: 'Ngong Hills', time: '2:00 PM', status: 'In Progress', type: 'lodge'),
          _VisitCard(name: 'City Hostel', address: 'Tom Mboya St', time: '4:30 PM', status: 'Pending', type: 'hostel'),
          _VisitCard(name: 'Maasai Camp', address: 'Kajiado', time: 'Tomorrow 9 AM', status: 'Scheduled', type: 'safari_camp'),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        icon: const Icon(Icons.add),
        label: const Text('New Visit'),
      ),
    );
  }
}

// ─── Earnings Page ───────────────────────────────────────────────
class EarningsPage extends StatelessWidget {
  const EarningsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: const [
                    Text('Total Earned', style: TextStyle(color: Color(0xFF94A3B8))),
                    SizedBox(height: 4),
                    Text('KES 34,500', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                    SizedBox(height: 4),
                    Text('This month • 23 properties', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('Commission Breakdown', style: TextStyle(fontWeight: FontWeight.w600)),
                    SizedBox(height: 12),
                    _EarningRow(label: 'Onboarding bonus (×23)', amount: 'KES 23,000'),
                    _EarningRow(label: 'Monthly active bonus', amount: 'KES 8,500'),
                    _EarningRow(label: 'Photo quality bonus', amount: 'KES 3,000'),
                    Divider(color: Color(0xFF334155)),
                    _EarningRow(label: 'Total', amount: 'KES 34,500', bold: true),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Profile Page ────────────────────────────────────────────────
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agent Profile')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const CircleAvatar(
              radius: 40,
              backgroundColor: Color(0xFF0EA5E9),
              child: Text('JK', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
            ),
            const SizedBox(height: 12),
            const Text('James Kamau', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const Text('Nairobi Region • Since Jan 2026', style: TextStyle(color: Color(0xFF94A3B8))),
            const SizedBox(height: 24),
            Card(
              child: Column(
                children: const [
                  ListTile(leading: Icon(Icons.business), title: Text('Properties Onboarded'), trailing: Text('23')),
                  ListTile(leading: Icon(Icons.star), title: Text('Success Rate'), trailing: Text('87%')),
                  ListTile(leading: Icon(Icons.timer), title: Text('Avg Visit Duration'), trailing: Text('45 min')),
                  ListTile(leading: Icon(Icons.route), title: Text('Region Coverage'), trailing: Text('Nairobi')),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Shared Widgets ──────────────────────────────────────────────
class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String change;

  const _StatCard({required this.label, required this.value, required this.change});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text(change, style: const TextStyle(color: Color(0xFF22C55E), fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

class _VisitCard extends StatelessWidget {
  final String name;
  final String address;
  final String time;
  final String status;
  final String type;

  const _VisitCard({
    required this.name,
    required this.address,
    required this.time,
    required this.status,
    required this.type,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = status == 'In Progress'
        ? const Color(0xFFF59E0B)
        : status == 'Scheduled'
            ? const Color(0xFF0EA5E9)
            : const Color(0xFF94A3B8);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.location_on, color: Color(0xFF0EA5E9)),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text('$address • $time', style: const TextStyle(fontSize: 12)),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: statusColor.withOpacity(0.15),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(status, style: TextStyle(color: statusColor, fontSize: 11)),
        ),
      ),
    );
  }
}

class _EarningRow extends StatelessWidget {
  final String label;
  final String amount;
  final bool bold;

  const _EarningRow({required this.label, required this.amount, this.bold = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(
            fontSize: 13,
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
            color: bold ? null : const Color(0xFF94A3B8),
          )),
          Text(amount, style: TextStyle(
            fontSize: 13,
            fontWeight: bold ? FontWeight.bold : FontWeight.w600,
          )),
        ],
      ),
    );
  }
}
