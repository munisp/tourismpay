import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, Alert,
} from 'react-native';
import { trpc } from '../../lib/trpc';

export default function ItineraryScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDest, setNewDest] = useState('');

  const { data, isLoading, refetch } = trpc.touristPortal.listItineraries.useQuery();

  const createMutation = trpc.touristPortal.createItinerary.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setNewTitle('');
      setNewDest('');
      refetch();
    },
    onError: (err) => Alert.alert('Error', err.message),
  });

  const deleteMutation = trpc.touristPortal.deleteItinerary.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => Alert.alert('Error', err.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete Itinerary', 'This will permanently delete this itinerary.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate({ id }) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Itineraries</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowCreate(!showCreate)}>
          <Text style={styles.addButtonText}>{showCreate ? '✕' : '+ New'}</Text>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <View style={styles.createCard}>
          <Text style={styles.createTitle}>New Itinerary</Text>
          <TextInput
            style={styles.input}
            placeholder="Trip title (e.g. Safari Weekend)"
            value={newTitle}
            onChangeText={setNewTitle}
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={styles.input}
            placeholder="Destination (e.g. Serengeti, Tanzania)"
            value={newDest}
            onChangeText={setNewDest}
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            style={[styles.createButton, (!newTitle.trim() || createMutation.isPending) && styles.createButtonDisabled]}
            onPress={() => createMutation.mutate({ title: newTitle.trim(), destination: newDest.trim() || undefined })}
            disabled={!newTitle.trim() || createMutation.isPending}
          >
            {createMutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.createButtonText}>Create Itinerary</Text>
            }
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {(data?.itineraries ?? []).length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🗺️</Text>
              <Text style={styles.emptyTitle}>No Itineraries Yet</Text>
              <Text style={styles.emptyText}>Create your first trip itinerary to start planning your African adventure.</Text>
            </View>
          ) : (
            (data?.itineraries ?? []).map((itin) => (
              <View key={itin.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>{itin.title}</Text>
                    {itin.destination && (
                      <Text style={styles.cardDestination}>📍 {itin.destination}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(itin.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>🗑</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.cardMeta}>
                  {itin.startDate && (
                    <Text style={styles.metaText}>
                      📅 {new Date(itin.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {itin.endDate && ` – ${new Date(itin.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </Text>
                  )}
                  <Text style={styles.metaText}>
                    {(itin as any).items?.length ?? 0} activities planned
                  </Text>
                </View>

                {(itin as any).notes && (
                  <Text style={styles.notes} numberOfLines={2}>{(itin as any).notes}</Text>
                )}

                <View style={styles.cardFooter}>
                  <Text style={styles.createdAt}>
                    Created {new Date(itin.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  addButton: { backgroundColor: '#2563eb', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  createCard: { margin: 16, marginTop: 0, backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  createTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b', marginBottom: 10 },
  createButton: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  createButtonDisabled: { backgroundColor: '#93c5fd' },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  list: { flex: 1, paddingHorizontal: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitleRow: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  cardDestination: { fontSize: 13, color: '#64748b' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { fontSize: 18 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaText: { fontSize: 12, color: '#94a3b8' },
  notes: { fontSize: 13, color: '#475569', fontStyle: 'italic', marginBottom: 8 },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  createdAt: { fontSize: 11, color: '#cbd5e1' },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingHorizontal: 32 },
});
