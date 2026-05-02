import React from 'react';
import { View, Text, Button } from 'react-native';
import { trpc } from '../../lib/trpc';

export default function KYBOnboardingScreen() {
  const submit = trpc.kyb.submitApplication.useMutation();
  return (
    <View>
      <Text>KYB Onboarding</Text>
      <Button title="Submit Application" onPress={() => submit.mutate({ businessName: 'Test', businessType: 'retail' })} />
    </View>
  );
}
