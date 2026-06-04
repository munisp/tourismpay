import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';

const KYC_STEPS = [
  { id: 'bvn', label: 'BVN Verification', description: 'Bank Verification Number', icon: '🏦' },
  { id: 'nin', label: 'NIN Verification', description: 'National Identity Number', icon: '🪪' },
  { id: 'phone', label: 'Phone Verification', description: 'OTP to registered number', icon: '📱' },
  { id: 'address', label: 'Address Verification', description: 'Proof of residence', icon: '🏠' },
  { id: 'id_document', label: 'ID Document', description: 'National ID, passport, or driver\'s license', icon: '📄' },
  { id: 'facial_match', label: 'Facial Verification', description: 'Live selfie for biometric match', icon: '🤳' },
];

export function KYCScreen({ navigation }: any) {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const kycLevel = completedSteps.length >= 6 ? 3 : completedSteps.length >= 4 ? 2 : completedSteps.length >= 2 ? 1 : 0;
  const progress = (completedSteps.length / KYC_STEPS.length) * 100;

  async function handleStepPress(stepId: string) {
    if (completedSteps.includes(stepId)) return;
    setCurrentStep(stepId);
    setLoading(true);
    // Simulate verification process
    setTimeout(() => {
      setCompletedSteps(prev => [...prev, stepId]);
      setCurrentStep(null);
      setLoading(false);
      if (completedSteps.length + 1 >= KYC_STEPS.length) {
        Alert.alert('KYC Complete', 'Your account is now fully verified! You have full access to all platform features.', [
          { text: 'Continue', onPress: () => navigation.navigate('Main') }
        ]);
      }
    }, 2000);
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <Text style={s.title}>KYC Verification</Text>
        <Text style={s.subtitle}>Complete verification to unlock platform features</Text>
      </View>

      {/* Progress */}
      <View style={s.progressCard}>
        <View style={s.progressRow}>
          <Text style={s.progressLabel}>Verification Progress</Text>
          <Text style={s.progressPct}>{Math.round(progress)}%</Text>
        </View>
        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={s.tierRow}>
          <View style={[s.tierBadge, kycLevel >= 1 && s.tierActive]}>
            <Text style={[s.tierText, kycLevel >= 1 && s.tierTextActive]}>Tier {kycLevel}</Text>
          </View>
          <Text style={s.tierDesc}>
            {kycLevel === 0 ? 'No access - complete verification' :
             kycLevel === 1 ? 'Basic - policies & claims' :
             kycLevel === 2 ? 'Enhanced - high-value coverage' : 'Full access'}
          </Text>
        </View>
      </View>

      {/* Steps */}
      <View style={s.stepsContainer}>
        {KYC_STEPS.map((step, idx) => {
          const completed = completedSteps.includes(step.id);
          const isCurrent = currentStep === step.id;
          return (
            <TouchableOpacity
              key={step.id}
              style={[s.stepCard, completed && s.stepComplete, isCurrent && s.stepActive]}
              onPress={() => handleStepPress(step.id)}
              disabled={completed || loading}
            >
              <Text style={s.stepIcon}>{completed ? '✅' : step.icon}</Text>
              <View style={s.stepInfo}>
                <Text style={[s.stepLabel, completed && s.stepLabelDone]}>{step.label}</Text>
                <Text style={s.stepDesc}>{step.description}</Text>
              </View>
              {isCurrent && <Text style={s.stepStatus}>Verifying...</Text>}
              {!completed && !isCurrent && <Text style={s.stepArrow}>→</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.infoCard}>
        <Text style={s.infoTitle}>Why is KYC Required?</Text>
        <Text style={s.infoText}>KYC verification is mandated by NAICOM regulations to prevent fraud and ensure compliance. Your data is encrypted and securely stored.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '800', color: '#1e293b' },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  progressCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: '#334155' },
  progressPct: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  progressBar: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 4 },
  tierRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fef2f2', borderRadius: 6 },
  tierActive: { backgroundColor: '#eff6ff' },
  tierText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  tierTextActive: { color: '#2563eb' },
  tierDesc: { fontSize: 12, color: '#64748b', flex: 1 },
  stepsContainer: { gap: 10, marginBottom: 20 },
  stepCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', gap: 12 },
  stepComplete: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  stepActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  stepIcon: { fontSize: 24 },
  stepInfo: { flex: 1 },
  stepLabel: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  stepLabelDone: { color: '#16a34a' },
  stepDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  stepStatus: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  stepArrow: { fontSize: 18, color: '#94a3b8' },
  infoCard: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#fde68a' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  infoText: { fontSize: 13, color: '#78350f', lineHeight: 18 },
});
