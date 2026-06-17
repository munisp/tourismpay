import 'package:flutter/material.dart';

class DiscountsScreen extends StatefulWidget {
  const DiscountsScreen({super.key});

  @override
  State<DiscountsScreen> createState() => _DiscountsScreenState();
}

class _DiscountsScreenState extends State<DiscountsScreen> {
  final _codeController = TextEditingController(text: 'WELCOME15');
  Map<String, dynamic>? _validateResult;
  bool _validating = false;

  final _promos = [
    {'name': 'Welcome 15% Off', 'code': 'WELCOME15', 'type': 'Percentage', 'value': '15%', 'target': 'New Users'},
    {'name': 'Safari Season', 'code': 'SAFARI20', 'type': 'Percentage', 'value': '20%', 'target': 'Safari Properties'},
    {'name': 'Stay 5 Pay 4', 'code': 'STAY5PAY4', 'type': 'Nights Free', 'value': '1 night', 'target': 'All'},
    {'name': 'Corporate 10%', 'code': 'CORP10', 'type': 'Percentage', 'value': '10%', 'target': 'Corporate'},
    {'name': 'Gold Flat \$50', 'code': 'GOLD50', 'type': 'Flat', 'value': '\$50', 'target': 'Gold Tier'},
  ];

  void _validateCode() {
    setState(() => _validating = true);
    Future.delayed(const Duration(milliseconds: 400), () {
      final code = _codeController.text.toUpperCase();
      final promo = _promos.firstWhere(
        (p) => p['code'] == code,
        orElse: () => {},
      );
      setState(() {
        _validating = false;
        if (promo.isNotEmpty) {
          _validateResult = {'valid': true, 'name': promo['name'], 'discount': 75.0, 'final': 425.0};
        } else {
          _validateResult = {'valid': false, 'message': 'Invalid code'};
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Discounts & Promos')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Validate Code
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Validate Promo Code', style: theme.textTheme.titleMedium),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _codeController,
                            decoration: const InputDecoration(
                              border: OutlineInputBorder(),
                              hintText: 'Enter code...',
                              isDense: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: _validating ? null : _validateCode,
                          child: Text(_validating ? '...' : 'Apply'),
                        ),
                      ],
                    ),
                    if (_validateResult != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: _validateResult!['valid'] ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              _validateResult!['valid'] ? Icons.check_circle : Icons.error,
                              color: _validateResult!['valid'] ? Colors.green : Colors.red,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _validateResult!['valid']
                                    ? 'Save \$${_validateResult!['discount']}! Final: \$${_validateResult!['final']}'
                                    : _validateResult!['message'],
                                style: TextStyle(color: _validateResult!['valid'] ? Colors.green : Colors.red),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Active Promos
            Text('Active Promotions', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            ...(_promos.map((p) => Card(
              child: ListTile(
                title: Text(p['name']!),
                subtitle: Text('${p['type']} • ${p['target']}'),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(p['code']!, style: TextStyle(
                      fontFamily: 'monospace', color: theme.colorScheme.primary, fontWeight: FontWeight.bold,
                    )),
                    Text(p['value']!, style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
            ))),

            const SizedBox(height: 16),
            // Discount Types
            Text('Discount Types', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ['Percentage', 'Flat Fee', 'Nights Free', 'Volume', 'Flash Sale', 'Loyalty Points']
                  .map((t) => Chip(label: Text(t)))
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }
}
