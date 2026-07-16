import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../services/api';

export function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoOtp, setDemoOtp] = useState('');

  async function handleSendReset() {
    if (!email) { setError('Please enter your email'); return; }
    setLoading(true); setError('');
    try {
      const result = await api.post('/api/trpc/auth.resetPassword', { '0': { json: { email } } });
      const data = result.data?.[0]?.result?.data?.json;
      if (data?.error) { setError(data.error); }
      else {
        setSuccess(data?.message || 'Reset code sent to your email');
        if (data?._demo_otp) setDemoOtp(data._demo_otp);
        setStep('otp');
      }
    } catch (e: any) { setError('Failed to send reset code'); }
    setLoading(false);
  }

  async function handleConfirmReset() {
    if (!otp || !newPassword) { setError('Please fill in all fields'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true); setError('');
    try {
      const result = await api.post('/api/trpc/auth.confirmResetPassword', { '0': { json: { email, otp, newPassword } } });
      const data = result.data?.[0]?.result?.data?.json;
      if (data?.error) { setError(data.error); }
      else { setSuccess('Password reset successfully!'); setStep('done'); }
    } catch (e: any) { setError('Failed to reset password'); }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.content}>
        <Text style={s.title}>{step === 'email' ? 'Recover Account' : step === 'otp' ? 'Reset Password' : 'Success'}</Text>
        <Text style={s.subtitle}>
          {step === 'email' ? 'Enter your email to receive a reset code' : step === 'otp' ? 'Enter the OTP and your new password' : 'You can now sign in with your new password'}
        </Text>

        {error ? <Text style={s.error}>{error}</Text> : null}
        {success && step === 'otp' ? <Text style={s.success}>{success}</Text> : null}
        {demoOtp && step === 'otp' ? <View style={s.demoBox}><Text style={s.demoText}>Demo OTP: {demoOtp}</Text></View> : null}

        {step === 'email' && (
          <>
            <TextInput style={s.input} placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#94a3b8" />
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSendReset} disabled={loading}>
              <Text style={s.btnText}>{loading ? 'Sending...' : 'Send Reset Code'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'otp' && (
          <>
            <TextInput style={s.input} placeholder="6-digit OTP code" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholderTextColor="#94a3b8" />
            <TextInput style={s.input} placeholder="New password (min 6 chars)" value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholderTextColor="#94a3b8" />
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleConfirmReset} disabled={loading}>
              <Text style={s.btnText}>{loading ? 'Resetting...' : 'Reset Password'}</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'done' && (
          <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Login')}>
            <Text style={s.btnText}>Back to Sign In</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.backLink} onPress={() => navigation.navigate('Login')}>
          <Text style={s.backText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', padding: 24 },
  content: { gap: 12 },
  title: { fontSize: 24, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 8 },
  error: { color: '#dc2626', textAlign: 'center', fontSize: 13 },
  success: { color: '#16a34a', textAlign: 'center', fontSize: 13 },
  demoBox: { backgroundColor: '#eff6ff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  demoText: { color: '#1d4ed8', textAlign: 'center', fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  btn: { backgroundColor: '#2563eb', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { alignItems: 'center', paddingVertical: 12 },
  backText: { color: '#2563eb', fontSize: 14, fontWeight: '500' },
});
