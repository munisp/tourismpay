import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { trpc } from '../../lib/trpc';

const STATUS_COLORS: Record<string, string> = {
  confirmed: '#16a34a',
  pending: '#d97706',
  cancelled: '#dc2626',
  completed: '#2563eb',
};

export default function BookingsScreen() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = trpc.touristPortal.listBookings.useQuery({
    status: filter as any,
    limit: 30,
  });

  const cancelMutation = trpc.touristPortal.cancelBooking.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => Alert.alert('Error', err.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleCancel = (bookingId: number) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => cancelMutation.mutate({ bookingId, reason: 'Cancelled by user' }),
        },
      ]
    );
  };

  const filters = [
    { label: 'All', value: undefined },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Pending', value: 'pending' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={String(f.value)}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {(data?.bookings ?? []).length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>No Bookings Yet</Text>
              <Text style={styles.emptyText}>Your bookings will appear here once you reserve a service.</Text>
            </View>
          ) : (
            (data?.bookings ?? []).map((booking) => (
              <View key={booking.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.serviceName} numberOfLines={1}>
                    {(booking as any).productName ?? 'Service Booking'}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[booking.status] ?? '#6b7280' }]}>
                    <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={styles.merchantName}>{(booking as any).merchantName ?? 'Service Provider'}</Text>
                <View style={styles.cardDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {booking.bookingDate
                        ? new Date(booking.bookingDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : '—'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Amount</Text>
                    <Text style={styles.detailValue}>{booking.currency} {Number(booking.totalAmount ?? 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Ref</Text>
                    <Text style={styles.detailValue}>{(booking as any).bookingRef ?? `#${booking.id}`}</Text>
                  </View>
                </View>
                {(booking.status === 'confirmed' || booking.status === 'pending') && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancel(booking.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 0 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#e2e8f0', marginRight: 8 },
  filterChipActive: { backgroundColor: '#2563eb' },
  filterText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  serviceName: { fontSize: 16, fontWeight: '600', color: '#1e293b', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  merchantName: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  cardDetails: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailLabel: { fontSize: 13, color: '#94a3b8' },
  detailValue: { fontSize: 13, color: '#334155', fontWeight: '500' },
  cancelButton: { marginTop: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#dc2626', alignItems: 'center' },
  cancelButtonText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
});
