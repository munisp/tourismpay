import React, { useState } from 'react';
import { View, Text, Button } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function QRScanScreen() {
  const [token, setToken] = useState('');
  const resolve = trpc.qrPayment.resolveQrCode.useMutation();
  const pay = trpc.qrPayment.initiateQrPayment.useMutation();

  return (
    <View>
      <Text>QR Payment Scanner</Text>
      <Button title="Scan QR" onPress={() => resolve.mutate({ token })} />
      <Button title="Pay" onPress={() => pay.mutate({ token, amount: 100 })} />
    </View>
  );
}
