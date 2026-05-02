import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class ApiClient {
  static const String defaultBaseUrl = 'http://localhost:3000';
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  String _baseUrl = defaultBaseUrl;
  String? _sessionToken;

  String get baseUrl => _baseUrl;

  Future<void> init() async {
    _sessionToken = await _storage.read(key: 'session_token');
    final savedUrl = await _storage.read(key: 'api_base_url');
    if (savedUrl != null) _baseUrl = savedUrl;
  }

  Future<void> setBaseUrl(String url) async {
    _baseUrl = url;
    await _storage.write(key: 'api_base_url', value: url);
  }

  Future<void> setSessionToken(String token) async {
    _sessionToken = token;
    await _storage.write(key: 'session_token', value: token);
  }

  Future<void> clearSession() async {
    _sessionToken = null;
    await _storage.delete(key: 'session_token');
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_sessionToken != null) 'Cookie': 'app_session_id=$_sessionToken',
  };

  Future<Map<String, dynamic>> trpcQuery(String path, [Map<String, dynamic>? input]) async {
    String url = '$_baseUrl/api/trpc/$path';
    if (input != null) {
      url += '?input=${Uri.encodeComponent(jsonEncode(input))}';
    }
    final response = await http.get(Uri.parse(url), headers: _headers)
        .timeout(const Duration(seconds: 30));
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['result']?['data'] ?? data;
    }
    throw ApiException(response.statusCode, response.body);
  }

  Future<Map<String, dynamic>> trpcMutation(String path, Map<String, dynamic> input) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/trpc/$path'),
      headers: _headers,
      body: jsonEncode(input),
    ).timeout(const Duration(seconds: 30));
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['result']?['data'] ?? data;
    }
    throw ApiException(response.statusCode, response.body);
  }

  Future<Map<String, dynamic>> get(String path) async {
    final response = await http.get(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
    ).timeout(const Duration(seconds: 30));
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw ApiException(response.statusCode, response.body);
  }

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('$_baseUrl$path'),
      headers: _headers,
      body: jsonEncode(body),
    ).timeout(const Duration(seconds: 30));
    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(response.body);
    }
    throw ApiException(response.statusCode, response.body);
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String body;
  ApiException(this.statusCode, this.body);

  @override
  String toString() => 'ApiException($statusCode): $body';
}
