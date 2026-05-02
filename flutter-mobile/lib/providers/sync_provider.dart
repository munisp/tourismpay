import 'dart:async';
import 'package:flutter/foundation.dart';
import '../utils/api_client.dart';
import '../utils/offline_db.dart';

class SyncProvider extends ChangeNotifier {
  final ApiClient _api = ApiClient();
  final OfflineDb _offlineDb = OfflineDb();
  Timer? _syncTimer;

  int _pendingCount = 0;
  bool _isSyncing = false;
  String? _lastSyncTime;
  String? _syncToken;

  int get pendingCount => _pendingCount;
  bool get isSyncing => _isSyncing;
  String? get lastSyncTime => _lastSyncTime;
  bool get hasPending => _pendingCount > 0;

  void startAutoSync(int intervalMs) {
    _syncTimer?.cancel();
    if (intervalMs <= 0) return;
    _syncTimer = Timer.periodic(Duration(milliseconds: intervalMs), (_) => sync());
    // Initial count
    _updatePendingCount();
  }

  void stopAutoSync() {
    _syncTimer?.cancel();
  }

  Future<void> _updatePendingCount() async {
    _pendingCount = await _offlineDb.pendingCount();
    notifyListeners();
  }

  Future<void> sync() async {
    if (_isSyncing) return;
    _isSyncing = true;
    notifyListeners();

    try {
      final pending = await _offlineDb.getPendingOperations();
      if (pending.isEmpty) {
        _isSyncing = false;
        notifyListeners();
        return;
      }

      final operations = pending.map((op) => {
        return {
          'id': op['id'],
          'entityType': op['entity_type'],
          'entityId': op['entity_id'],
          'operation': op['operation'],
          'payload': op['payload'],
          'timestamp': op['created_at'],
        };
      }).toList();

      final result = await _api.trpcMutation('offlineResilience.batchSync', {
        'operations': operations,
        'lastSyncToken': _syncToken,
        'bandwidthKbps': 500,
      });

      final accepted = result['accepted'] as int? ?? 0;
      if (accepted > 0) {
        for (final op in pending.take(accepted)) {
          await _offlineDb.markSynced(op['id'] as String);
        }
      }

      _syncToken = result['syncToken'] as String?;
      _lastSyncTime = DateTime.now().toUtc().toIso8601String();

      if (_syncToken != null) {
        await _offlineDb.updateSyncState('main', _lastSyncTime!, _syncToken);
      }
    } catch (e) {
      debugPrint('Sync error: $e');
    }

    _isSyncing = false;
    await _updatePendingCount();
    notifyListeners();
  }

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }
}
