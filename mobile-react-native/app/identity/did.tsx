import React from 'react';
import { View, Text } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function DIDIdentityScreen() {
  const { data } = trpc.identity.getDID.useQuery();
  return <View><Text>DID: {data?.did}</Text></View>;
}
