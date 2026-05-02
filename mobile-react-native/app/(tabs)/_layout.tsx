import { Tabs } from 'expo-router';
import React from 'react';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e2e8f0' },
        headerStyle: { backgroundColor: '#fff' },
        headerTintColor: '#1e293b',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="bookings" options={{ title: 'My Bookings', tabBarLabel: 'Bookings' }} />
      <Tabs.Screen name="itinerary" options={{ title: 'Itinerary', tabBarLabel: 'Itinerary' }} />
      <Tabs.Screen name="deals" options={{ title: 'Deals & Offers', tabBarLabel: 'Deals' }} />
      <Tabs.Screen name="concierge" options={{ title: 'AI Concierge', tabBarLabel: 'Concierge' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Digital Wallet', tabBarLabel: 'Wallet' }} />
      <Tabs.Screen name="remittance" options={{ title: 'Send Money', tabBarLabel: 'Remittance' }} />
      <Tabs.Screen name="bis" options={{ title: 'BIS Checks', tabBarLabel: 'BIS' }} />
    </Tabs>
  );
}
