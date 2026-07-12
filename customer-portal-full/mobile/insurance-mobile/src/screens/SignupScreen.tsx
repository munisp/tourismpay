import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../store/authStore';

export function SignupScreen({ navigation }: any) {
  const { signup } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!fullName || !email || !password) { setError('Please fill in all required fields'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true); setError('');
    try {
      await signup({ fullName, phone, email, password });
      // After signup, auth store will handle navigation to KYC
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Registration failed');
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logoContainer}>
          <Text style={s.logo}>TourismPay</Text>
          <Text style={s.tagline}>Create Your Account</Text>
        </View>
        <View style={s.form}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TextInput style={s.input} placeholder="Full Name *" value={fullName} onChangeText={setFullName} placeholderTextColor="#94a3b8" />
          <TextInput style={s.input} placeholder="Phone (+234...)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#94a3b8" />
          <TextInput style={s.input} placeholder="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#94a3b8" />
          <TextInput style={s.input} placeholder="Password *" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94a3b8" />
          <TextInput style={s.input} placeholder="Confirm Password *" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholderTextColor="#94a3b8" />
          <TouchableOpacity style={[s.signupBtn, loading && { opacity: 0.6 }]} onPress={handleSignup} disabled={loading}>
            <Text style={s.signupText}>{loading ? 'Creating Account...' : 'Create Account'}</Text>
          </TouchableOpacity>
          <Text style={s.terms}>By creating an account, you agree to our Terms of Service and Privacy Policy</Text>
          <TouchableOpacity style={s.loginLink} onPress={() => navigation.navigate('Login')}>
            <Text style={s.loginLinkText}>Already have an account? <Text style={{ fontWeight: '700' }}>Sign In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 28, fontWeight: '800', color: '#2563eb' },
  tagline: { fontSize: 16, color: '#475569', marginTop: 4 },
  form: { gap: 12 },
  error: { color: '#dc2626', textAlign: 'center', fontSize: 13, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  signupBtn: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  signupText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  terms: { textAlign: 'center', color: '#94a3b8', fontSize: 11, marginTop: 8 },
  loginLink: { alignItems: 'center', paddingVertical: 12 },
  loginLinkText: { color: '#475569', fontSize: 14 },
});
