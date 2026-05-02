import React from 'react';
import { View, Text } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function WalletScreen() {
  const { data } = trpc.wallet.getBalance.useQuery();
  return <View><Text>Wallet Balance: {data?.balance}</Text></View>;
}
