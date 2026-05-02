import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function TouristHomeScreen() {
  const { data } = trpc.touristPortal.getWalletBalance.useQuery();
  return (
    <ScrollView>
      <View><Text>TourismPay Home</Text></View>
    </ScrollView>
  );
}
