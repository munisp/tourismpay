import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert } from 'react-native';
import { useAuth } from '../store/authStore';

export function SecuritySettingsScreen({ navigation }: any) {
  const { user, biometricEnabled, enableBiometric, disableBiometric } = useAuth();
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleToggle2FA() {
    if (twoFAEnabled) {
      Alert.alert('Disable 2FA', 'Are you sure you want to disable two-factor authentication?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disable', style: 'destructive', onPress: () => setTwoFAEnabled(false) }
      ]);
    } else {
      // Navigate to 2FA setup
      navigation.navigate('TwoFactorSetup');
    }
  }

  async function handleToggleBiometric(value: boolean) {
    if (value) {
      try { await enableBiometric(); }
      catch (e: any) { Alert.alert('Error', e.message || 'Failed to enable biometric'); }
    } else {
      await disableBiometric();
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>Security Settings</Text>
      <Text style={s.subtitle}>Manage your account security</Text>

      {/* Authentication Section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Authentication</Text>

        <View style={s.settingRow}>
          <View style={s.settingInfo}>
            <Text style={s.settingIcon}>🔐</Text>
            <View>
              <Text style={s.settingLabel}>Two-Factor Authentication</Text>
              <Text style={s.settingDesc}>Add extra security with TOTP codes</Text>
            </View>
          </View>
          <Switch value={twoFAEnabled} onValueChange={handleToggle2FA} trackColor={{ true: '#2563eb' }} />
        </View>

        <View style={s.settingRow}>
          <View style={s.settingInfo}>
            <Text style={s.settingIcon}>👆</Text>
            <View>
              <Text style={s.settingLabel}>Biometric Login</Text>
              <Text style={s.settingDesc}>Sign in with fingerprint or face</Text>
            </View>
          </View>
          <Switch value={biometricEnabled} onValueChange={handleToggleBiometric} trackColor={{ true: '#2563eb' }} />
        </View>
      </View>

      {/* Password Section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Password</Text>
        <TouchableOpacity style={s.actionRow} onPress={() => navigation.navigate('ChangePassword')}>
          <Text style={s.actionIcon}>🔑</Text>
          <View style={s.actionInfo}>
            <Text style={s.actionLabel}>Change Password</Text>
            <Text style={s.actionDesc}>Update your account password</Text>
          </View>
          <Text style={s.actionArrow}>→</Text>
        </TouchableOpacity>
      </View>

      {/* Session Section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Sessions</Text>
        <TouchableOpacity style={s.actionRow}>
          <Text style={s.actionIcon}>📱</Text>
          <View style={s.actionInfo}>
            <Text style={s.actionLabel}>Active Sessions</Text>
            <Text style={s.actionDesc}>1 active session (this device)</Text>
          </View>
          <Text style={s.actionArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionRow, { borderColor: '#fecaca' }]} onPress={() => Alert.alert('Sign Out', 'Sign out from all devices?', [{ text: 'Cancel' }, { text: 'Sign Out All', style: 'destructive' }])}>
          <Text style={s.actionIcon}>🚪</Text>
          <View style={s.actionInfo}>
            <Text style={[s.actionLabel, { color: '#dc2626' }]}>Sign Out All Devices</Text>
            <Text style={s.actionDesc}>End all active sessions</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Privacy Section */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Privacy & Data</Text>
        <TouchableOpacity style={s.actionRow}>
          <Text style={s.actionIcon}>📋</Text>
          <View style={s.actionInfo}>
            <Text style={s.actionLabel}>Data Export (NDPR)</Text>
            <Text style={s.actionDesc}>Download your personal data</Text>
          </View>
          <Text style={s.actionArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionRow, { borderColor: '#fecaca' }]}>
          <Text style={s.actionIcon}>🗑️</Text>
          <View style={s.actionInfo}>
            <Text style={[s.actionLabel, { color: '#dc2626' }]}>Delete Account</Text>
            <Text style={s.actionDesc}>Permanently delete your account and data</Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 2, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  settingInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  settingIcon: { fontSize: 24 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  settingDesc: { fontSize: 12, color: '#64748b', marginTop: 1 },
  actionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8, gap: 12 },
  actionIcon: { fontSize: 24 },
  actionInfo: { flex: 1 },
  actionLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  actionDesc: { fontSize: 12, color: '#64748b', marginTop: 1 },
  actionArrow: { fontSize: 18, color: '#94a3b8' },
});
