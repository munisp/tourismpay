import React from 'react';
import { View, Text, Button } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function BiometricRegisterScreen() {
  const register = trpc.biometric.register.useMutation();
  return (
    <View>
      <Text>Biometric Registration</Text>
      <Button title="Register" onPress={() => register.mutate({ credentialId: 'cred-id', publicKey: 'pub-key' })} />
    </View>
  );
}
