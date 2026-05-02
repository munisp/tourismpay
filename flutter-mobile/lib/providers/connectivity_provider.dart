import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../utils/api_client.dart';

enum ConnectionQuality { offline, ussd, critical, delta, compressed, full }

class ConnectivityProvider extends ChangeNotifier {
  final Connectivity _connectivity = Connectivity();
  final ApiClient _api = ApiClient();
  StreamSubscription? _subscription;

  bool _isOnline = true;
  ConnectionQuality _quality = ConnectionQuality.full;
  int _bandwidthKbps = 1000;
  int _latencyMs = 50;
  String _connectionType = 'unknown';
  int _syncIntervalMs = 5000;
  bool _useCompression = false;
  bool _enableWebSocket = true;

  bool get isOnline => _isOnline;
  ConnectionQuality get quality => _quality;
  int get bandwidthKbps => _bandwidthKbps;
  int get latencyMs => _latencyMs;
  String get connectionType => _connectionType;
  int get syncIntervalMs => _syncIntervalMs;
  bool get useCompression => _useCompression;
  bool get enableWebSocket => _enableWebSocket;

  void init() {
    _subscription = _connectivity.onConnectivityChanged.listen(_onConnectivityChanged);
    _checkConnectivity();
  }

  void _onConnectivityChanged(List<ConnectivityResult> results) {
    final result = results.isNotEmpty ? results.first : ConnectivityResult.none;
    _isOnline = result != ConnectivityResult.none;

    switch (result) {
      case ConnectivityResult.mobile:
        _connectionType = '3g'; // Estimate; real bandwidth detection needs speed test
        _bandwidthKbps = 300;
        break;
      case ConnectivityResult.wifi:
        _connectionType = 'wifi';
        _bandwidthKbps = 5000;
        break;
      case ConnectivityResult.ethernet:
        _connectionType = 'ethernet';
        _bandwidthKbps = 10000;
        break;
      default:
        _connectionType = 'unknown';
        _bandwidthKbps = 0;
    }

    _updateProfile();
    notifyListeners();
  }

  Future<void> _checkConnectivity() async {
    try {
      final results = await _connectivity.checkConnectivity();
      _onConnectivityChanged(results);
      // Try to ping the server for actual latency
      await _measureLatency();
    } catch (_) {
      _isOnline = false;
      _quality = ConnectionQuality.offline;
      notifyListeners();
    }
  }

  Future<void> _measureLatency() async {
    if (!_isOnline) return;
    try {
      final start = DateTime.now();
      await _api.trpcQuery('offlineResilience.ping');
      _latencyMs = DateTime.now().difference(start).inMilliseconds;
      _updateProfile();
    } catch (_) {
      _isOnline = false;
      _quality = ConnectionQuality.offline;
    }
    notifyListeners();
  }

  void _updateProfile() {
    if (!_isOnline || _bandwidthKbps == 0) {
      _quality = ConnectionQuality.offline;
      _syncIntervalMs = 0;
      _useCompression = true;
      _enableWebSocket = false;
    } else if (_bandwidthKbps < 10) {
      _quality = ConnectionQuality.ussd;
      _syncIntervalMs = 120000;
      _useCompression = true;
      _enableWebSocket = false;
    } else if (_bandwidthKbps < 100) {
      _quality = ConnectionQuality.critical;
      _syncIntervalMs = 60000;
      _useCompression = true;
      _enableWebSocket = false;
    } else if (_bandwidthKbps < 500) {
      _quality = ConnectionQuality.delta;
      _syncIntervalMs = 30000;
      _useCompression = true;
      _enableWebSocket = false;
    } else if (_bandwidthKbps < 2000) {
      _quality = ConnectionQuality.compressed;
      _syncIntervalMs = 15000;
      _useCompression = true;
      _enableWebSocket = true;
    } else {
      _quality = ConnectionQuality.full;
      _syncIntervalMs = 5000;
      _useCompression = false;
      _enableWebSocket = true;
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
