import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isLoading = false;

  Future<void> _demoLogin(String role) async {
    setState(() => _isLoading = true);
    final auth = context.read<AuthProvider>();
    final success = await auth.demoLogin(role: role);
    if (!mounted) return;
    setState(() => _isLoading = false);
    if (success) {
      Navigator.pushReplacementNamed(context, '/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(Icons.flight_takeoff, size: 64, color: Theme.of(context).primaryColor),
              const SizedBox(height: 24),
              Text('Welcome to TourismPay', textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('Tourism payment platform for Africa', textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Colors.grey)),
              const SizedBox(height: 48),
              if (_isLoading)
                const Center(child: CircularProgressIndicator())
              else ...[
                ElevatedButton.icon(
                  onPressed: () => _demoLogin('tourist'),
                  icon: const Icon(Icons.person),
                  label: const Text('Login as Tourist'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => _demoLogin('merchant'),
                  icon: const Icon(Icons.store),
                  label: const Text('Login as Merchant'),
                ),
                const SizedBox(height: 12),
                TextButton.icon(
                  onPressed: () => _demoLogin('admin'),
                  icon: const Icon(Icons.admin_panel_settings),
                  label: const Text('Login as Admin'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
