import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../store/authStore';

export function LoginScreen() {
  const { login, loginWithBiometric, biometricEnabled, biometricType } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true); setError('');
    try { await login(email, password); } catch (e: any) { setError(e.response?.data?.message || 'Login failed'); }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.logoContainer}><Text style={s.logo}>TourismPay</Text><Text style={s.tagline}>Your Insurance, Simplified</Text></View>
      <View style={s.form}>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <TextInput style={s.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#94a3b8" />
        <TextInput style={s.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94a3b8" />
        <TouchableOpacity style={[s.loginBtn, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading}>
          <Text style={s.loginText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
        </TouchableOpacity>
        {biometricEnabled && (
          <TouchableOpacity style={s.biometricBtn} onPress={loginWithBiometric}>
            <Text style={s.biometricText}>{biometricType === 'face' ? '👤 Sign in with Face ID' : '👆 Sign in with Fingerprint'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.forgotBtn}><Text style={s.forgotText}>Forgot Password?</Text></TouchableOpacity>
      </View>
      <Text style={s.footer}>NAICOM Licensed | NDPR Compliant</Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 48 },
  logo: { fontSize: 32, fontWeight: '800', color: '#2563eb' }, tagline: { fontSize: 14, color: '#64748b', marginTop: 4 },
  form: { gap: 12 }, error: { color: '#dc2626', textAlign: 'center', fontSize: 13, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  loginBtn: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  loginText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  biometricBtn: { alignItems: 'center', paddingVertical: 14, backgroundColor: '#f1f5f9', borderRadius: 12 },
  biometricText: { fontSize: 15, color: '#334155', fontWeight: '500' },
  forgotBtn: { alignItems: 'center', paddingVertical: 12 }, forgotText: { color: '#2563eb', fontSize: 14 },
  footer: { textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 40 },
});
