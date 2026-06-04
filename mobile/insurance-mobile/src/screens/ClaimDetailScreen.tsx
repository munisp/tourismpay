import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { claimsApi } from '../services/api';
import { useOfflineSync } from '../services/offlineSync';

export function ClaimDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { claimId } = route.params;
  const { getCachedData, setCachedData } = useOfflineSync();

  const { data: claim } = useQuery({
    queryKey: ['claim', claimId],
    queryFn: async () => {
      try { const res = await claimsApi.getById(claimId); await setCachedData(`claim_${claimId}`, res.data); return res.data; }
      catch { return await getCachedData(`claim_${claimId}`); }
    },
  });

  const { data: timeline } = useQuery({
    queryKey: ['claimTimeline', claimId],
    queryFn: async () => { try { return (await claimsApi.getTimeline(claimId)).data; } catch { return { events: [] }; } },
  });

  if (!claim) return <View style={s.center}><Text>Loading...</Text></View>;

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>{claim.type} Claim</Text>
        <Text style={s.claimId}>#{claimId.slice(-8)}</Text>
      </View>
      <View style={s.card}>
        {[['Status', claim.status], ['Amount', `₦${claim.amount?.toLocaleString()}`], ['Filed', new Date(claim.filedAt).toLocaleDateString()], ['Policy', claim.policyNumber]].map(([l, v]) => (
          <View key={l} style={s.row}><Text style={s.label}>{l}</Text><Text style={s.value}>{v}</Text></View>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>Timeline</Text>
        {(timeline?.events || []).map((ev: any, i: number) => (
          <View key={i} style={s.timelineItem}>
            <View style={s.dot} /><View style={{ flex: 1 }}>
              <Text style={s.eventTitle}>{ev.title}</Text>
              <Text style={s.eventDate}>{new Date(ev.timestamp).toLocaleString()}</Text>
              {ev.description && <Text style={s.eventDesc}>{ev.description}</Text>}
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity style={s.evidenceBtn}><Text style={s.evidenceBtnText}>Add Evidence</Text></TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }, back: { fontSize: 16, color: '#2563eb', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' }, claimId: { fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', marginTop: 4 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12, color: '#0f172a' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  label: { fontSize: 14, color: '#64748b' }, value: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  timelineItem: { flexDirection: 'row', marginBottom: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb', marginTop: 4, marginRight: 12 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' }, eventDate: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  eventDesc: { fontSize: 13, color: '#64748b', marginTop: 4 },
  evidenceBtn: { marginHorizontal: 16, backgroundColor: '#eff6ff', paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2563eb' },
  evidenceBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
});
