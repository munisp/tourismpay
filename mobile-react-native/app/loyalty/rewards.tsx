import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function LoyaltyRewardsScreen() {
  const { data } = trpc.loyalty.getBalance.useQuery();
  return <View><Text>Loyalty Points: {data?.points}</Text></View>;
}
