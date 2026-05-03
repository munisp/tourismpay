import React, { useState } from "react";
import {
  View, Text, SafeAreaView, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../../components/Card";
import { colors, spacing, fontSize, borderRadius } from "../../theme";

const COUNTRIES = ["Nigeria", "Kenya", "Ghana", "South Africa", "Tanzania", "Uganda", "Rwanda", "Ethiopia", "Senegal", "Morocco"];
const STEPS = ["Business Info", "Documents", "Compliance", "Review"];

export default function KYBOnboardingScreen({ navigation }: { navigation: any }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    businessName: "", country: "Nigeria", registrationNumber: "", taxId: "",
    businessType: "", address: "",
  });

  const handleSubmit = () => {
    Alert.alert("Submitted", "Your KYB application has been submitted for review. This typically takes 2-5 business days.", [
      { text: "OK", onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Progress */}
        <View style={styles.progressRow}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                {i < step ? <Ionicons name="checkmark" size={14} color={colors.white} /> :
                  <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
            </View>
          ))}
        </View>

        {step === 0 && (
          <Card>
            <Text style={styles.formTitle}>Business Information</Text>
            <TextInput style={styles.input} placeholder="Business Name" placeholderTextColor={colors.textMuted}
              value={form.businessName} onChangeText={(v) => setForm({ ...form, businessName: v })} />
            <TextInput style={styles.input} placeholder="Registration Number" placeholderTextColor={colors.textMuted}
              value={form.registrationNumber} onChangeText={(v) => setForm({ ...form, registrationNumber: v })} />
            <TextInput style={styles.input} placeholder="Tax ID" placeholderTextColor={colors.textMuted}
              value={form.taxId} onChangeText={(v) => setForm({ ...form, taxId: v })} />
            <TextInput style={styles.input} placeholder="Business Type" placeholderTextColor={colors.textMuted}
              value={form.businessType} onChangeText={(v) => setForm({ ...form, businessType: v })} />
            <TextInput style={styles.input} placeholder="Address" placeholderTextColor={colors.textMuted}
              value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} multiline />
            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(1)}>
              <Text style={styles.nextText}>Next: Documents</Text>
            </TouchableOpacity>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <Text style={styles.formTitle}>Upload Documents</Text>
            {["Business Registration Certificate", "Tax Clearance", "ID of Director", "Proof of Address", "Bank Statement"].map((doc) => (
              <TouchableOpacity key={doc} style={styles.docRow}>
                <Ionicons name="document-attach" size={20} color={colors.primary} />
                <Text style={styles.docText}>{doc}</Text>
                <Ionicons name="cloud-upload" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(0)}>
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(2)}>
                <Text style={styles.nextText}>Next</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <Text style={styles.formTitle}>Compliance Declaration</Text>
            <Text style={styles.compText}>By proceeding, you confirm that:</Text>
            {["Your business is legally registered", "You comply with AML regulations", "Information provided is accurate", "You consent to background checks"].map((item) => (
              <View key={item} style={styles.checkRow}>
                <Ionicons name="checkbox" size={20} color={colors.success} />
                <Text style={styles.checkText}>{item}</Text>
              </View>
            ))}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(3)}>
                <Text style={styles.nextText}>Review</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <Text style={styles.formTitle}>Review & Submit</Text>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Business:</Text><Text style={styles.reviewValue}>{form.businessName || "—"}</Text></View>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Country:</Text><Text style={styles.reviewValue}>{form.country}</Text></View>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Reg #:</Text><Text style={styles.reviewValue}>{form.registrationNumber || "—"}</Text></View>
            <View style={styles.reviewRow}><Text style={styles.reviewLabel}>Tax ID:</Text><Text style={styles.reviewValue}>{form.taxId || "—"}</Text></View>
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.success }]} onPress={handleSubmit}>
                <Text style={styles.nextText}>Submit Application</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.lg },
  stepItem: { alignItems: "center", flex: 1 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceLight, justifyContent: "center", alignItems: "center" },
  stepDotActive: { backgroundColor: colors.primary },
  stepNum: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "bold" },
  stepNumActive: { color: colors.white },
  stepLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  stepLabelActive: { color: colors.text },
  formTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: "600", marginBottom: spacing.md },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, padding: spacing.md, color: colors.text, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  nextBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center", flex: 1 },
  nextText: { color: colors.white, fontWeight: "600" },
  backBtn: { borderRadius: borderRadius.md, padding: spacing.md, alignItems: "center" },
  backText: { color: colors.textSecondary },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  docRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, marginBottom: spacing.sm },
  docText: { color: colors.text, flex: 1 },
  compText: { color: colors.textSecondary, marginBottom: spacing.sm },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  checkText: { color: colors.text },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  reviewLabel: { color: colors.textSecondary },
  reviewValue: { color: colors.text, fontWeight: "600" },
});
