import 'package:flutter/foundation.dart';
import '../utils/api_client.dart';

class AuthProvider extends ChangeNotifier {
  final ApiClient _api = ApiClient();
  Map<String, dynamic>? _user;
  bool _isLoading = false;
  String? _error;

  Map<String, dynamic>? get user => _user;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _user != null;
  String? get error => _error;
  String get userRole => _user?['role'] ?? 'user';
  String get userName => _user?['name'] ?? 'User';
  String get userEmail => _user?['email'] ?? '';

  Future<void> init() async {
    await _api.init();
    await checkAuth();
  }

  Future<void> checkAuth() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final data = await _api.trpcQuery('auth.me');
      _user = data;
      _error = null;
    } catch (e) {
      _user = null;
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<bool> demoLogin({String role = 'tourist'}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final endpoint = role == 'merchant'
          ? '/api/dev/demo-merchant-login'
          : role == 'admin'
              ? '/api/demo-login?role=admin'
              : '/api/dev/demo-tourist-login';
      await _api.get(endpoint);
      await checkAuth();
      return _user != null;
    } catch (e) {
      _error = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _api.trpcMutation('auth.logout', {});
    } catch (_) {}
    _user = null;
    await _api.clearSession();
    notifyListeners();
  }
}
