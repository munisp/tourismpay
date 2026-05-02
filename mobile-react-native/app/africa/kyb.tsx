import React from 'react';
import { View, Text, Button } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function AfricaKYBScreen() {
  const { data } = trpc.kyb.getStatus.useQuery();
  return <View><Text>KYB Status: {data?.status}</Text></View>;
}
