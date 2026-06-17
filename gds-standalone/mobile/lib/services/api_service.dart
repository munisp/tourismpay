import 'dart:convert';
import 'package:http/http.dart' as http;

/// ApiService — GDS API client for APISIX gateway.
/// Routes through APISIX (port 9080) with JWT auth + API key.
class ApiService {
  // APISIX gateway endpoint (configurable per environment)
  static const String _baseUrl = 'http://localhost:9080/gds/v1';
  static const String _apiKey = 'gds-mobile-key';

  Map<String, String> _headers(String? token) => {
    'Content-Type': 'application/json',
    'X-API-Key': _apiKey,
    if (token != null) 'Authorization': 'Bearer $token',
  };

  // --- PNR ---
  Future<Map<String, dynamic>> createPNR(String token, Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/pnr/'),
      headers: _headers(token),
      body: json.encode(data),
    );
    return json.decode(response.body);
  }

  Future<Map<String, dynamic>> getPNR(String token, String locator) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/pnr/$locator'),
      headers: _headers(token),
    );
    return json.decode(response.body);
  }

  Future<Map<String, dynamic>> searchPNRs(String token, {String? guestName, String? status}) async {
    final params = <String, String>{};
    if (guestName != null) params['guestName'] = guestName;
    if (status != null) params['status'] = status;
    final uri = Uri.parse('$_baseUrl/pnr/search').replace(queryParameters: params);
    final response = await http.get(uri, headers: _headers(token));
    return json.decode(response.body);
  }

  // --- Queues ---
  Future<Map<String, dynamic>> getQueueStats(String token) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/queues/stats'),
      headers: _headers(token),
    );
    return json.decode(response.body);
  }

  Future<Map<String, dynamic>> getQueueItems(String token, {String? queueType, String? status}) async {
    final params = <String, String>{};
    if (queueType != null) params['queue_type'] = queueType;
    if (status != null) params['status'] = status;
    final uri = Uri.parse('$_baseUrl/queues').replace(queryParameters: params);
    final response = await http.get(uri, headers: _headers(token));
    return json.decode(response.body);
  }

  Future<Map<String, dynamic>> assignQueueItem(String token, String itemId) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/queues/$itemId/assign'),
      headers: _headers(token),
      body: json.encode({'agent_id': 'self'}),
    );
    return json.decode(response.body);
  }

  Future<Map<String, dynamic>> completeQueueItem(String token, String itemId) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/queues/$itemId/complete'),
      headers: _headers(token),
    );
    return json.decode(response.body);
  }

  // --- Guest Profiles ---
  Future<Map<String, dynamic>> searchGuests(String token, String query) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/guests/search?q=$query'),
      headers: _headers(token),
    );
    return json.decode(response.body);
  }

  Future<Map<String, dynamic>> getGuestProfile(String token, String id) async {
    final response = await http.get(
      Uri.parse('$_baseUrl/guests/$id'),
      headers: _headers(token),
    );
    return json.decode(response.body);
  }

  // --- Search (Properties/Availability) ---
  Future<Map<String, dynamic>> searchProperties(String token, {
    String? country,
    String? city,
    String? checkIn,
    String? checkOut,
    int guests = 2,
  }) async {
    final params = <String, String>{
      'guests': guests.toString(),
    };
    if (country != null) params['country'] = country;
    if (city != null) params['city'] = city;
    if (checkIn != null) params['check_in'] = checkIn;
    if (checkOut != null) params['check_out'] = checkOut;
    final uri = Uri.parse('$_baseUrl/search').replace(queryParameters: params);
    final response = await http.get(uri, headers: _headers(token));
    return json.decode(response.body);
  }

  // --- Revenue ---
  Future<Map<String, dynamic>> getYieldRecommendation(String token, Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/revenue/yield'),
      headers: _headers(token),
      body: json.encode(data),
    );
    return json.decode(response.body);
  }

  // --- Groups ---
  Future<Map<String, dynamic>> listGroups(String token, {String? status}) async {
    final params = <String, String>{};
    if (status != null) params['status'] = status;
    final uri = Uri.parse('$_baseUrl/groups/').replace(queryParameters: params);
    final response = await http.get(uri, headers: _headers(token));
    return json.decode(response.body);
  }
}
