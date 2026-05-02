import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function MerchantRevenueScreen() {
  const { data } = trpc.merchantRevenue.getSummary.useQuery();
  return (
    <View>
      <Text>Revenue Dashboard</Text>
      <Text>Total: {data?.totalRevenue}</Text>
    </View>
  );
}
