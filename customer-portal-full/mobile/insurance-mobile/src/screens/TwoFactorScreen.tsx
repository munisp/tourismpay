import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../store/authStore';

export function TwoFactorScreen({ route, navigation }: any) {
  const { verify2FA } = useAuth();
  const email = route?.params?.email || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    if (!code || code.length !== 6) { setError('Please enter a valid 6-digit code'); return; }
    setLoading(true); setError('');
    try {
      await verify2FA(email, code);
    } catch (e: any) {
      setError(e.message || 'Invalid verification code');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.content}>
        <View style={s.iconContainer}>
          <Text style={s.icon}>🔐</Text>
        </View>
        <Text style={s.title}>Two-Factor Authentication</Text>
        <Text style={s.subtitle}>Enter the 6-digit code from your authenticator app</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TextInput
          style={s.codeInput}
          placeholder="000000"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          placeholderTextColor="#94a3b8"
          textAlign="center"
        />

        <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleVerify} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Verifying...' : 'Verify Code'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.backLink} onPress={() => navigation.navigate('Login')}>
          <Text style={s.backText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', padding: 24 },
  content: { gap: 16 },
  iconContainer: { alignItems: 'center' },
  icon: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  error: { color: '#dc2626', textAlign: 'center', fontSize: 13 },
  codeInput: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 18, fontSize: 24, fontWeight: '700', letterSpacing: 8, borderWidth: 2, borderColor: '#e2e8f0', textAlign: 'center' },
  btn: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 8 },
  backText: { color: '#2563eb', fontSize: 14, fontWeight: '500' },
});
