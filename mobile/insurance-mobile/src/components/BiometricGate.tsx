import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../store/authStore';

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, biometricEnabled, biometricType, loginWithBiometric, isLoading } = useAuth();
  const [biometricFailed, setBiometricFailed] = useState(false);

  useEffect(() => {
    if (isAuthenticated && biometricEnabled && !biometricFailed) {
      attemptBiometric();
    }
  }, [isAuthenticated, biometricEnabled]);

  async function attemptBiometric() {
    try {
      await loginWithBiometric();
    } catch {
      setBiometricFailed(true);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading TourismPay...</Text>
      </View>
    );
  }

  if (biometricFailed && biometricEnabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.icon}>
          {biometricType === 'face' ? '👤' : '👆'}
        </Text>
        <Text style={styles.title}>Authentication Required</Text>
        <Text style={styles.subtitle}>
          Use {biometricType === 'face' ? 'Face ID' : 'fingerprint'} to unlock
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={attemptBiometric}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.fallbackButton}
          onPress={() => setBiometricFailed(false)}
        >
          <Text style={styles.fallbackText}>Use Password Instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 32 },
  loadingText: { marginTop: 16, fontSize: 16, color: '#64748b' },
  icon: { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 32, textAlign: 'center' },
  retryButton: { backgroundColor: '#2563eb', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, marginBottom: 16 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  fallbackButton: { paddingVertical: 12 },
  fallbackText: { color: '#2563eb', fontSize: 14 },
});
