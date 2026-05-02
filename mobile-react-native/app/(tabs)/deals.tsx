import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { trpc } from '../../lib/trpc';

export default function DealsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  const { data, isLoading, refetch } = trpc.touristPortal.listDeals.useQuery({
    category: selectedCategory,
    limit: 30,
  });

  const redeemMutation = trpc.touristPortal.redeemDeal.useMutation({
    onSuccess: (result) => {
      Alert.alert(
        'Deal Redeemed! 🎉',
        `Your redemption code: ${result.redemptionCode ?? 'Check your bookings'}\n\nShow this to the service provider.`,
        [{ text: 'OK' }]
      );
      refetch();
    },
    onError: (err) => Alert.alert('Error', err.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleRedeem = (deal: any) => {
    Alert.alert(
      `Redeem: ${deal.title}`,
      `Discount: ${deal.discountType === 'percentage' ? `${deal.discountValue}% off` : `${deal.currency ?? 'USD'} ${deal.discountValue} off`}\n\nConfirm redemption?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Redeem Now', onPress: () => redeemMutation.mutate({ dealId: deal.id }) },
      ]
    );
  };

  const categories = ['All', 'Safari', 'Hotel', 'Restaurant', 'Tour', 'Transport', 'Activity'];

  return (
    <View style={styles.container}>
      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {categories.map((cat) => {
          const val = cat === 'All' ? undefined : cat.toLowerCase();
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, selectedCategory === val && styles.chipActive]}
              onPress={() => setSelectedCategory(val)}
            >
              <Text style={[styles.chipText, selectedCategory === val && styles.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {(data?.deals ?? []).length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏷️</Text>
              <Text style={styles.emptyTitle}>No Deals Available</Text>
              <Text style={styles.emptyText}>Check back soon for exclusive tourism deals and offers.</Text>
            </View>
          ) : (
            (data?.deals ?? []).map((deal: any) => {
              const isExpired = deal.validUntil && new Date(deal.validUntil) < new Date();
              const daysLeft = deal.validUntil
                ? Math.ceil((new Date(deal.validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <View key={deal.id} style={[styles.card, isExpired && styles.cardExpired]}>
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountText}>
                      {deal.discountType === 'percentage' ? `${deal.discountValue}%` : `${deal.currency ?? '$'}${deal.discountValue}`}
                    </Text>
                    <Text style={styles.discountLabel}>OFF</Text>
                  </View>

                  <View style={styles.cardContent}>
                    <Text style={styles.dealTitle} numberOfLines={2}>{deal.title}</Text>
                    <Text style={styles.dealMerchant}>{deal.merchantName ?? 'Service Provider'}</Text>

                    {deal.description && (
                      <Text style={styles.dealDesc} numberOfLines={2}>{deal.description}</Text>
                    )}

                    <View style={styles.cardFooter}>
                      <View>
                        {daysLeft !== null && !isExpired && (
                          <Text style={[styles.expiry, daysLeft <= 3 && styles.expiryUrgent]}>
                            ⏰ {daysLeft === 0 ? 'Expires today' : `${daysLeft}d left`}
                          </Text>
                        )}
                        {isExpired && <Text style={styles.expiryExpired}>Expired</Text>}
                        {deal.usageLimit && (
                          <Text style={styles.usageText}>
                            {deal.usageCount ?? 0}/{deal.usageLimit} redeemed
                          </Text>
                        )}
                      </View>

                      <TouchableOpacity
                        style={[styles.redeemBtn, (isExpired || redeemMutation.isPending) && styles.redeemBtnDisabled]}
                        onPress={() => handleRedeem(deal)}
                        disabled={isExpired || redeemMutation.isPending}
                      >
                        <Text style={styles.redeemBtnText}>
                          {redeemMutation.isPending ? '...' : 'Redeem'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  filterRow: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 0 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#e2e8f0', marginRight: 8 },
  chipActive: { backgroundColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, flexDirection: 'row', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardExpired: { opacity: 0.6 },
  discountBadge: { width: 72, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', padding: 12 },
  discountText: { color: '#fff', fontWeight: '800', fontSize: 20, lineHeight: 22 },
  discountLabel: { color: '#bfdbfe', fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  cardContent: { flex: 1, padding: 14 },
  dealTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  dealMerchant: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  dealDesc: { fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  expiry: { fontSize: 11, color: '#64748b' },
  expiryUrgent: { color: '#dc2626', fontWeight: '600' },
  expiryExpired: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  usageText: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  redeemBtn: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  redeemBtnDisabled: { backgroundColor: '#93c5fd' },
  redeemBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
});
