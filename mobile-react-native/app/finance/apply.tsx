import React from 'react';
import { View, Text, Button } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function EmbeddedFinanceApplyScreen() {
  const apply = trpc.embeddedFinance.submitApplication.useMutation();
  return (
    <View>
      <Text>Apply for Finance</Text>
      <Button title="Apply" onPress={() => apply.mutate({ amount: 1000, purpose: 'business' })} />
    </View>
  );
}
