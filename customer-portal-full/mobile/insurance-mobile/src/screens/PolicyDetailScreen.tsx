import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { policyApi } from '../services/api';
import { useOfflineSync } from '../services/offlineSync';

export function PolicyDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { policyId } = route.params;
  const { getCachedData, setCachedData } = useOfflineSync();

  const { data: policy, isLoading } = useQuery({
    queryKey: ['policy', policyId],
    queryFn: async () => {
      try {
        const res = await policyApi.getById(policyId);
        await setCachedData(`policy_${policyId}`, res.data, 30 * 60 * 1000);
        return res.data;
      } catch {
        return await getCachedData(`policy_${policyId}`);
      }
    },
  });

  if (isLoading || !policy) {
    return <View style={styles.center}><Text>Loading...</Text></View>;
  }

  const statusColor: Record<string, string> = { active: '#16a34a', expired: '#dc2626', pending: '#eab308' };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{policy.type} Insurance</Text>
        <View style={[styles.badge, { backgroundColor: (statusColor[policy.status] || '#64748b') + '20' }]}>
          <Text style={[styles.badgeText, { color: statusColor[policy.status] || '#64748b' }]}>{policy.status}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Policy Details</Text>
        {[
          ['Policy Number', policy.policyNumber],
          ['Provider', policy.provider],
          ['Start Date', new Date(policy.startDate).toLocaleDateString()],
          ['End Date', new Date(policy.endDate).toLocaleDateString()],
          ['Premium', `₦${policy.premiumAmount?.toLocaleString()}/year`],
          ['Coverage', `₦${(policy.coverageAmount / 1_000_000).toFixed(1)}M`],
          ['Deductible', `₦${policy.deductible?.toLocaleString() || '0'}`],
        ].map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Coverage Items</Text>
        {(policy.coverageItems || []).map((item: any, i: number) => (
          <View key={i} style={styles.coverageItem}>
            <Text style={styles.coverageName}>{item.name}</Text>
            <Text style={styles.coverageLimit}>₦{item.limit?.toLocaleString()}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Claims', { screen: 'FileClaim', params: { policyId } })}>
          <Text style={styles.actionText}>File Claim</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.renewBtn]}>
          <Text style={[styles.actionText, { color: '#2563eb' }]}>Renew Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.docBtn]}>
          <Text style={[styles.actionText, { color: '#64748b' }]}>View Documents</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20 },
  backBtn: { fontSize: 16, color: '#2563eb', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  badgeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  label: { fontSize: 14, color: '#64748b' },
  value: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  coverageItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  coverageName: { fontSize: 14, color: '#334155' },
  coverageLimit: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  actions: { paddingHorizontal: 16, gap: 10 },
  actionBtn: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  actionText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  renewBtn: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#2563eb' },
  docBtn: { backgroundColor: '#f1f5f9' },
});
