import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function BISTabScreen() {
  const { data } = trpc.bis.list.useQuery({ page: 1, limit: 20 });
  return (
    <View>
      <Text>BIS Investigations</Text>
      <FlatList data={data?.items} renderItem={({ item }) => <Text>{item.id}</Text>} />
    </View>
  );
}
