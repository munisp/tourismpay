import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { useOfflineSync } from '../services/offlineSync';

export function OfflineIndicator() {
  const { state, syncNow } = useOfflineSync();

  if (state.isOnline && state.pendingCount === 0) return null;

  return (
    <View style={[styles.container, !state.isOnline ? styles.offline : styles.syncing]}>
      {!state.isOnline ? (
        <>
          <Text style={styles.icon}>📡</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>You're Offline</Text>
            <Text style={styles.subtitle}>
              {state.pendingCount > 0
                ? `${state.pendingCount} action${state.pendingCount > 1 ? 's' : ''} queued — will sync when back online`
                : 'Changes will sync when connectivity returns'}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.icon}>{state.isSyncing ? '🔄' : '📤'}</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>
              {state.isSyncing ? 'Syncing...' : `${state.pendingCount} pending`}
            </Text>
            {!state.isSyncing && (
              <TouchableOpacity onPress={syncNow}>
                <Text style={styles.syncLink}>Sync Now</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
      {state.bandwidthMode !== 'full' && (
        <View style={styles.bandwidthBadge}>
          <Text style={styles.bandwidthText}>
            {state.bandwidthMode === 'minimal' ? '2G' : '3G'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  offline: { backgroundColor: '#fef2f2', borderBottomColor: '#fecaca' },
  syncing: { backgroundColor: '#eff6ff', borderBottomColor: '#bfdbfe' },
  icon: { fontSize: 20, marginRight: 12 },
  textContainer: { flex: 1 },
  title: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  syncLink: { fontSize: 12, color: '#2563eb', fontWeight: '600', marginTop: 2 },
  bandwidthBadge: { backgroundColor: '#fbbf24', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  bandwidthText: { fontSize: 10, fontWeight: '700', color: '#0f172a' },
});
