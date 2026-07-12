import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';

export function EmergencyScreen({ navigation }: { navigation: any }) {
  const contacts = [
    { label: 'TourismPay Emergency', number: '+234-800-INSURE-1', icon: '🆘' },
    { label: 'NAICOM Complaints', number: '+234-9-4620430', icon: '📞' },
    { label: 'Nigeria Police', number: '199', icon: '👮' },
    { label: 'FRSC (Road Accidents)', number: '122', icon: '🚗' },
    { label: 'Fire Service', number: '199', icon: '🔥' },
    { label: 'Ambulance (LASAMBUS)', number: '112', icon: '🚑' },
  ];

  function callNumber(number: string) {
    Linking.openURL(`tel:${number}`).catch(() => Alert.alert('Error', 'Could not open dialer'));
  }

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>← Back</Text></TouchableOpacity>
        <Text style={s.title}>Emergency</Text>
        <Text style={s.subtitle}>Quick access to emergency services</Text>
      </View>
      <View style={s.urgentCard}>
        <Text style={s.urgentTitle}>Motor Accident?</Text>
        <Text style={s.urgentText}>1. Ensure safety first{'\n'}2. Take photos of the scene{'\n'}3. Call emergency services if needed{'\n'}4. File a claim through the app</Text>
        <TouchableOpacity style={s.fileClaimBtn} onPress={() => navigation.navigate('Main', { screen: 'Claims', params: { screen: 'FileClaim' } })}>
          <Text style={s.fileClaimText}>File Emergency Claim</Text>
        </TouchableOpacity>
      </View>
      {contacts.map((c) => (
        <TouchableOpacity key={c.label} style={s.contactCard} onPress={() => callNumber(c.number)}>
          <Text style={s.contactIcon}>{c.icon}</Text>
          <View style={{ flex: 1 }}><Text style={s.contactLabel}>{c.label}</Text><Text style={s.contactNumber}>{c.number}</Text></View>
          <Text style={s.callIcon}>📞</Text>
        </TouchableOpacity>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 }, back: { fontSize: 16, color: '#2563eb', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' }, subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  urgentCard: { backgroundColor: '#fef2f2', marginHorizontal: 16, marginBottom: 20, borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#fecaca' },
  urgentTitle: { fontSize: 18, fontWeight: '700', color: '#dc2626', marginBottom: 8 },
  urgentText: { fontSize: 14, color: '#7f1d1d', lineHeight: 22 },
  fileClaimBtn: { backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  fileClaimText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  contactCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 16 },
  contactIcon: { fontSize: 28, marginRight: 14 }, contactLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  contactNumber: { fontSize: 14, color: '#2563eb', marginTop: 2 }, callIcon: { fontSize: 20 },
});
