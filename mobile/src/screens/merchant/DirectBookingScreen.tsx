import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiRequest } from '../services/api';

const DirectBookingScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest('/api/trpc/serviceProxy.getServiceHealth');
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: '#8B5CF620' }]}>
          <Text style={[styles.iconText, { color: '#8B5CF6' }]}>⬡</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Direct Booking</Text>
          <Text style={styles.subtitle}>TourismPay Gap Service</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        {['Total', 'Active', 'Revenue'].map((label) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statValue}>—</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Direct Booking Dashboard</Text>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : loading ? (
          <ActivityIndicator size="large" color="#8B5CF6" style={{ marginVertical: 32 }} />
        ) : data ? (
          <Text style={styles.dataText}>{JSON.stringify(data, null, 2).slice(0, 200)}...</Text>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Direct Booking</Text>
            <Text style={styles.emptySubtitle}>
              Connect to the microservice API to load live data.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#8B5CF6' }]}
              onPress={loadData}
            >
              <Text style={styles.buttonText}>Load Direct Booking Data</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  iconBadge: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText: { fontSize: 24 },
  headerText: { flex: 1 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: '#111827', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  errorText: { color: '#EF4444', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  dataText: { fontSize: 11, color: '#374151', fontFamily: 'monospace' },
});

export default DirectBookingScreen;
