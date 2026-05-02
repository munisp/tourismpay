import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { trpc } from '../../lib/trpc';

export default function BISInvestigationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = trpc.bis.getById.useQuery({ id: Number(id) });
  return <View><Text>BIS Case #{id}: {data?.summary}</Text></View>;
}
