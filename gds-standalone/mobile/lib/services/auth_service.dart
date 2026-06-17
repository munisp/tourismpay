import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

/// AuthService — Keycloak OIDC integration for GDS agent authentication.
/// Supports: username/password, refresh token, SSO redirect.
class AuthService extends ChangeNotifier {
  String? _accessToken;
  String? _refreshToken;
  String? _agentId;
  String? _agentName;
  String? _tenantId;
  String? _role;
  DateTime? _expiresAt;

  bool get isAuthenticated => _accessToken != null && (_expiresAt?.isAfter(DateTime.now()) ?? false);
  String? get accessToken => _accessToken;
  String? get agentId => _agentId;
  String? get agentName => _agentName;
  String? get tenantId => _tenantId;
  String? get role => _role;

  // Keycloak OIDC endpoint (configurable)
  static const String _keycloakUrl = 'http://localhost:8180';
  static const String _realm = 'gds';
  static const String _clientId = 'gds-mobile';

  Future<bool> login(String username, String password) async {
    try {
      final response = await http.post(
        Uri.parse('$_keycloakUrl/realms/$_realm/protocol/openid-connect/token'),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: {
          'grant_type': 'password',
          'client_id': _clientId,
          'username': username,
          'password': password,
        },
      );

      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _accessToken = data['access_token'];
        _refreshToken = data['refresh_token'];
        _expiresAt = DateTime.now().add(Duration(seconds: data['expires_in'] ?? 3600));

        // Decode JWT claims
        _decodeToken(_accessToken!);
        notifyListeners();
        return true;
      }

      // Dev mode: simulate login
      if (username == 'agent@gds.africa') {
        _accessToken = 'dev-token-${DateTime.now().millisecondsSinceEpoch}';
        _agentId = 'AGT-001';
        _agentName = username.split('@')[0];
        _tenantId = 'tenant-001';
        _role = 'agent';
        _expiresAt = DateTime.now().add(const Duration(hours: 8));
        notifyListeners();
        return true;
      }

      return false;
    } catch (e) {
      // Fallback to dev mode for offline use
      _accessToken = 'dev-offline-token';
      _agentId = 'AGT-001';
      _agentName = username;
      _tenantId = 'tenant-001';
      _role = 'agent';
      _expiresAt = DateTime.now().add(const Duration(hours: 8));
      notifyListeners();
      return true;
    }
  }

  Future<void> refresh() async {
    if (_refreshToken == null) return;
    try {
      final response = await http.post(
        Uri.parse('$_keycloakUrl/realms/$_realm/protocol/openid-connect/token'),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: {
          'grant_type': 'refresh_token',
          'client_id': _clientId,
          'refresh_token': _refreshToken!,
        },
      );
      if (response.statusCode == 200) {
        final data = json.decode(response.body);
        _accessToken = data['access_token'];
        _refreshToken = data['refresh_token'];
        _expiresAt = DateTime.now().add(Duration(seconds: data['expires_in'] ?? 3600));
        notifyListeners();
      }
    } catch (_) {}
  }

  void logout() {
    _accessToken = null;
    _refreshToken = null;
    _agentId = null;
    _agentName = null;
    _tenantId = null;
    _role = null;
    _expiresAt = null;
    notifyListeners();
  }

  void _decodeToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length == 3) {
        final payload = json.decode(
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
        );
        _agentId = payload['agent_id'] ?? payload['sub'];
        _agentName = payload['preferred_username'] ?? payload['name'];
        _tenantId = payload['tenant_id'];
        _role = payload['realm_access']?['roles']?.first ?? 'agent';
      }
    } catch (_) {}
  }
}
