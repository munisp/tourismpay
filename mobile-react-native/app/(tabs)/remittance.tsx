import React, { useState } from 'react';
import { View, Text, TextInput, Button } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function RemittanceScreen() {
  const [amount, setAmount] = useState('');
  const { data: history } = trpc.paymentSwitch.remittanceHistory.useQuery({ page: 1 });
  const initiate = trpc.paymentSwitch.initiateRemittance.useMutation();

  return (
    <View>
      <Text>Remittance</Text>
      <TextInput value={amount} onChangeText={setAmount} placeholder="Amount" />
      <Button title="Send" onPress={() => initiate.mutate({ amount: Number(amount), currency: 'USD', destinationCountry: 'NG' })} />
    </View>
  );
}
