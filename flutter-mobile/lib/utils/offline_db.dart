import 'dart:convert';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:uuid/uuid.dart';

/// Local SQLite database for offline-first operations.
/// Queues transactions, caches data, and syncs when connectivity returns.
class OfflineDb {
  static final OfflineDb _instance = OfflineDb._internal();
  factory OfflineDb() => _instance;
  OfflineDb._internal();

  Database? _db;
  final _uuid = const Uuid();

  Future<Database> get database async {
    _db ??= await _initDb();
    return _db!;
  }

  Future<Database> _initDb() async {
    final path = join(await getDatabasesPath(), 'tourismpay_offline.db');
    return openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE offline_queue (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            operation TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL,
            synced_at TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            error TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE cached_data (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            ttl_seconds INTEGER NOT NULL DEFAULT 300
          )
        ''');
        await db.execute('''
          CREATE TABLE sync_state (
            key TEXT PRIMARY KEY,
            last_sync TEXT NOT NULL,
            sync_token TEXT
          )
        ''');
      },
    );
  }

  // ─── Queue Operations ────────────────────────────────────────────────────

  Future<String> enqueue({
    required String entityType,
    required String entityId,
    required String operation,
    required Map<String, dynamic> payload,
  }) async {
    final db = await database;
    final id = _uuid.v4();
    await db.insert('offline_queue', {
      'id': id,
      'entity_type': entityType,
      'entity_id': entityId,
      'operation': operation,
      'payload': jsonEncode(payload),
      'status': 'pending',
      'created_at': DateTime.now().toUtc().toIso8601String(),
      'retry_count': 0,
    });
    return id;
  }

  Future<List<Map<String, dynamic>>> getPendingOperations() async {
    final db = await database;
    final rows = await db.query(
      'offline_queue',
      where: 'status = ?',
      whereArgs: ['pending'],
      orderBy: 'created_at ASC',
    );
    return rows.map((r) => {
      final m = Map<String, dynamic>.from(r);
      m['payload'] = jsonDecode(r['payload'] as String);
      return m;
    }).toList();
  }

  Future<void> markSynced(String id) async {
    final db = await database;
    await db.update(
      'offline_queue',
      {
        'status': 'synced',
        'synced_at': DateTime.now().toUtc().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> markFailed(String id, String error) async {
    final db = await database;
    await db.rawUpdate(
      'UPDATE offline_queue SET status = ?, error = ?, retry_count = retry_count + 1 WHERE id = ?',
      ['failed', error, id],
    );
  }

  Future<int> pendingCount() async {
    final db = await database;
    final result = await db.rawQuery(
      "SELECT COUNT(*) as count FROM offline_queue WHERE status = 'pending'"
    );
    return Sqflite.firstIntValue(result) ?? 0;
  }

  // ─── Cache Operations ────────────────────────────────────────────────────

  Future<void> cacheData(String key, Map<String, dynamic> value, {int ttlSeconds = 300}) async {
    final db = await database;
    await db.insert(
      'cached_data',
      {
        'key': key,
        'value': jsonEncode(value),
        'updated_at': DateTime.now().toUtc().toIso8601String(),
        'ttl_seconds': ttlSeconds,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> getCachedData(String key) async {
    final db = await database;
    final rows = await db.query('cached_data', where: 'key = ?', whereArgs: [key]);
    if (rows.isEmpty) return null;
    final row = rows.first;
    final updatedAt = DateTime.parse(row['updated_at'] as String);
    final ttl = row['ttl_seconds'] as int;
    if (DateTime.now().toUtc().difference(updatedAt).inSeconds > ttl) {
      await db.delete('cached_data', where: 'key = ?', whereArgs: [key]);
      return null;
    }
    return jsonDecode(row['value'] as String);
  }

  // ─── Sync State ──────────────────────────────────────────────────────────

  Future<void> updateSyncState(String key, String lastSync, String? token) async {
    final db = await database;
    await db.insert(
      'sync_state',
      {'key': key, 'last_sync': lastSync, 'sync_token': token},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<Map<String, dynamic>?> getSyncState(String key) async {
    final db = await database;
    final rows = await db.query('sync_state', where: 'key = ?', whereArgs: [key]);
    return rows.isNotEmpty ? rows.first : null;
  }
}
