import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList } from 'react-native';

const PRODUCTS = [
  { id: 'motor', name: 'Motor Insurance', category: 'Motor', premium: '₦15,000/yr', icon: '🚗', description: 'Comprehensive and third-party motor coverage', features: ['Accident cover', 'Theft protection', 'Third-party liability'] },
  { id: 'health', name: 'Health Insurance', category: 'Health', premium: '₦45,000/yr', icon: '🏥', description: 'Individual and family health plans', features: ['Hospital cover', 'Outpatient care', 'Dental & optical'] },
  { id: 'life', name: 'Life Insurance', category: 'Life', premium: '₦30,000/yr', icon: '👨‍👩‍👧', description: 'Term and whole life protection', features: ['Death benefit', 'Critical illness', 'Disability cover'] },
  { id: 'property', name: 'Property Insurance', category: 'Property', premium: '₦25,000/yr', icon: '🏠', description: 'Home and commercial property coverage', features: ['Fire & flood', 'Burglary', 'Natural disasters'] },
  { id: 'agriculture', name: 'Agricultural Insurance', category: 'Agriculture', premium: '₦20,000/yr', icon: '🌾', description: 'Crop and livestock protection', features: ['Crop failure', 'Livestock death', 'Weather index'] },
  { id: 'cyber', name: 'Cyber Insurance', category: 'Cyber', premium: '₦100,000/yr', icon: '🛡️', description: 'Digital risk and data breach coverage', features: ['Data breach', 'Ransomware', 'Business interruption'] },
  { id: 'micro', name: 'Micro Insurance', category: 'Micro', premium: '₦2,000/yr', icon: '📱', description: 'Affordable coverage for low-income earners', features: ['Mobile money', 'Daily premium', 'Instant claims'] },
  { id: 'travel', name: 'Travel Insurance', category: 'Travel', premium: '₦5,000/trip', icon: '✈️', description: 'International and domestic travel cover', features: ['Medical emergency', 'Trip cancellation', 'Baggage loss'] },
];

const CATEGORIES = ['All', 'Motor', 'Health', 'Life', 'Property', 'Agriculture', 'Cyber', 'Micro', 'Travel'];

export function InsuranceMarketplaceScreen({ navigation }: any) {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filtered = selectedCategory === 'All' ? PRODUCTS : PRODUCTS.filter(p => p.category === selectedCategory);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Insurance Marketplace</Text>
        <Text style={s.subtitle}>Find the right coverage for you</Text>
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterRow} contentContainerStyle={s.filterContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity key={cat} style={[s.filterChip, selectedCategory === cat && s.filterActive]} onPress={() => setSelectedCategory(cat)}>
            <Text style={[s.filterText, selectedCategory === cat && s.filterTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Products */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.productCard} onPress={() => navigation.navigate('ProductDetail', { product: item })}>
            <View style={s.productHeader}>
              <Text style={s.productIcon}>{item.icon}</Text>
              <View style={s.productInfo}>
                <Text style={s.productName}>{item.name}</Text>
                <Text style={s.productDesc}>{item.description}</Text>
              </View>
            </View>
            <View style={s.productFooter}>
              <Text style={s.productPremium}>From {item.premium}</Text>
              <View style={s.featuresRow}>
                {item.features.map((f, i) => (
                  <View key={i} style={s.featureBadge}><Text style={s.featureText}>{f}</Text></View>
                ))}
              </View>
            </View>
            <View style={s.ctaRow}>
              <TouchableOpacity style={s.quoteBtn}>
                <Text style={s.quoteBtnText}>Get Quote</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.detailBtn}>
                <Text style={s.detailBtnText}>Learn More →</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2 },
  filterRow: { maxHeight: 44, marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  filterActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  filterTextActive: { color: '#fff' },
  list: { padding: 16, gap: 12 },
  productCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
  productHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  productIcon: { fontSize: 32 },
  productInfo: { flex: 1 },
  productName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  productDesc: { fontSize: 13, color: '#64748b', marginTop: 2 },
  productFooter: { gap: 8 },
  productPremium: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  featuresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  featureBadge: { paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#f1f5f9', borderRadius: 6 },
  featureText: { fontSize: 11, color: '#475569' },
  ctaRow: { flexDirection: 'row', gap: 10 },
  quoteBtn: { flex: 1, backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  quoteBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  detailBtn: { flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  detailBtnText: { color: '#475569', fontSize: 14, fontWeight: '600' },
});
