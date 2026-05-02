import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/connectivity_provider.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final auth = context.read<AuthProvider>();
    final connectivity = context.read<ConnectivityProvider>();
    connectivity.init();
    await auth.init();

    if (!mounted) return;

    if (auth.isAuthenticated) {
      final role = auth.userRole;
      switch (role) {
        case 'admin':
          Navigator.pushReplacementNamed(context, '/admin/dashboard');
          break;
        case 'merchant':
          Navigator.pushReplacementNamed(context, '/merchant/dashboard');
          break;
        default:
          Navigator.pushReplacementNamed(context, '/tourist/dashboard');
      }
    } else {
      Navigator.pushReplacementNamed(context, '/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.flight_takeoff, size: 80, color: Theme.of(context).primaryColor),
            const SizedBox(height: 24),
            Text('TourismPay', style: Theme.of(context).textTheme.headlineLarge?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Tourism Payments for Africa', style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Colors.grey)),
            const SizedBox(height: 40),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}
