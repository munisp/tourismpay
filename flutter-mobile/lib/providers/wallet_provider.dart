import 'package:flutter/foundation.dart';
import '../utils/api_client.dart';
import '../utils/offline_db.dart';

class WalletProvider extends ChangeNotifier {
  final ApiClient _api = ApiClient();
  final OfflineDb _offlineDb = OfflineDb();

  Map<String, dynamic>? _wallet;
  List<Map<String, dynamic>> _transactions = [];
  bool _isLoading = false;
  String? _error;

  Map<String, dynamic>? get wallet => _wallet;
  List<Map<String, dynamic>> get transactions => _transactions;
  bool get isLoading => _isLoading;
  String? get error => _error;
  double get balance => (_wallet?['balance'] as num?)?.toDouble() ?? 0.0;
  String get currency => _wallet?['currency'] ?? 'USD';

  Future<void> loadWallet() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      _wallet = await _api.trpcQuery('wallet.getBalance');
      // Cache for offline access
      if (_wallet != null) {
        await _offlineDb.cacheData('wallet_balance', _wallet!, ttlSeconds: 60);
      }
    } catch (e) {
      // Try cached data
      final cached = await _offlineDb.getCachedData('wallet_balance');
      if (cached != null) {
        _wallet = cached;
      } else {
        _error = 'Unable to load wallet';
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> loadTransactions() async {
    try {
      final data = await _api.trpcQuery('wallet.getTransactions');
      _transactions = List<Map<String, dynamic>>.from(data['transactions'] ?? []);
      await _offlineDb.cacheData('wallet_transactions', {'transactions': _transactions}, ttlSeconds: 120);
    } catch (e) {
      final cached = await _offlineDb.getCachedData('wallet_transactions');
      if (cached != null) {
        _transactions = List<Map<String, dynamic>>.from(cached['transactions'] ?? []);
      }
    }
    notifyListeners();
  }

  Future<bool> topUp({required double amount, required String currency}) async {
    _isLoading = true;
    notifyListeners();
    try {
      await _api.trpcMutation('wallet.topUp', {
        'amount': amount,
        'currency': currency,
      });
      await loadWallet();
      return true;
    } catch (e) {
      // Queue for offline sync
      await _offlineDb.enqueue(
        entityType: 'wallet_topup',
        entityId: DateTime.now().millisecondsSinceEpoch.toString(),
        operation: 'create',
        payload: {'amount': amount, 'currency': currency},
      );
      _error = 'Topup queued for sync';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<bool> transfer({
    required String recipientId,
    required double amount,
    required String currency,
    String? note,
  }) async {
    _isLoading = true;
    notifyListeners();
    try {
      await _api.trpcMutation('wallet.transfer', {
        'recipientId': recipientId,
        'amount': amount,
        'currency': currency,
        'note': note,
      });
      await loadWallet();
      return true;
    } catch (e) {
      await _offlineDb.enqueue(
        entityType: 'wallet_transfer',
        entityId: DateTime.now().millisecondsSinceEpoch.toString(),
        operation: 'create',
        payload: {
          'recipientId': recipientId,
          'amount': amount,
          'currency': currency,
          'note': note,
        },
      );
      _error = 'Transfer queued for sync';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }
}
