/**
 * Channel Connect — Native mobile connection wizard for GDS/OTA platforms.
 *
 * Multi-step flow:
 * 1. Show channel info + requirements
 * 2. Credential input (API key, secret, property ID)
 * 3. Environment selection (sandbox/production)
 * 4. Validation + connection
 */
import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { channelManagerAPI } from "../../services/api";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { ChannelStackParams } from "../../navigation/RootNavigator";

type Props = {
  navigation: NativeStackNavigationProp<ChannelStackParams, "ChannelConnect">;
  route: RouteProp<ChannelStackParams, "ChannelConnect">;
};

interface ChannelSetupInfo {
  name: string;
  displayName: string;
  emoji: string;
  docsUrl: string;
  requiresPropertyId: boolean;
  description: string;
  setupSteps: string[];
}

const SETUP_INFO: Record<string, ChannelSetupInfo> = {
  sabre: {
    name: "sabre",
    displayName: "Sabre GDS (SynXis)",
    emoji: "🌐",
    docsUrl: "https://developer.sabre.com/",
    requiresPropertyId: true,
    description: "Connect to 400,000+ travel agents worldwide via Sabre's Global Distribution System.",
    setupSteps: [
      "Register at developer.sabre.com",
      "Create an application and get API credentials",
      "Set up your property in SynXis Central Reservations",
      "Enter credentials below to connect",
    ],
  },
  amadeus: {
    name: "amadeus",
    displayName: "Amadeus Self-Service APIs",
    emoji: "✈️",
    docsUrl: "https://developers.amadeus.com/",
    requiresPropertyId: false,
    description: "Distribute to 770,000+ travel sellers via Amadeus Hotel and Activities APIs.",
    setupSteps: [
      "Sign up at developers.amadeus.com",
      "Create an API project",
      "Copy your API key and secret from the dashboard",
      "Start in sandbox, then request production access",
    ],
  },
  little_emperors: {
    name: "little_emperors",
    displayName: "Little Emperors",
    emoji: "👑",
    docsUrl: "https://www.littleemperors.com/partners",
    requiresPropertyId: true,
    description: "Luxury invitation-only platform. 40-70% off rack rates for verified members. Minimum 4-star.",
    setupSteps: [
      "Apply as a partner at littleemperors.com/partners",
      "Complete property verification (4-5 star minimum)",
      "Receive API credentials from your account manager",
      "Configure your member rates and flash sale windows",
    ],
  },
  expedia: {
    name: "expedia",
    displayName: "Expedia Partner Central",
    emoji: "🏨",
    docsUrl: "https://developers.expediagroup.com/",
    requiresPropertyId: true,
    description: "Reach millions of travelers via Expedia, Hotels.com, and Vrbo.",
    setupSteps: [
      "Register at expediapartnercentral.com",
      "Apply for Connectivity Partner access",
      "Complete API integration certification",
      "Enter your EPC credentials and property ID",
    ],
  },
  booking_com: {
    name: "booking_com",
    displayName: "Booking.com",
    emoji: "📘",
    docsUrl: "https://connect.booking.com/",
    requiresPropertyId: false,
    description: "28+ million listings across 226 countries. XML/JSON Connectivity Partner API.",
    setupSteps: [
      "Join Booking.com at join.booking.com",
      "Apply for Connectivity Partner program",
      "Get XML/JSON API credentials",
      "Configure property-level settings in Extranet",
    ],
  },
  travelport: {
    name: "travelport",
    displayName: "Travelport Universal API",
    emoji: "🌍",
    docsUrl: "https://developer.travelport.com/",
    requiresPropertyId: true,
    description: "GDS distribution via Galileo, Apollo, and Worldspan. Reach global travel agencies.",
    setupSteps: [
      "Register at developer.travelport.com",
      "Request Universal API (UAPI) access",
      "Get your target branch and credentials",
      "Enter your chain code as the property ID",
    ],
  },
};

export function ChannelConnect({ navigation, route }: Props) {
  const { user, token } = useAuth();
  const channelId = route.params?.channelId ?? "sabre";
  const info = SETUP_INFO[channelId] ?? SETUP_INFO.sabre;

  const [step, setStep] = useState<"info" | "credentials" | "connecting">("info");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");

  const establishmentId = user?.establishmentId ?? 1;

  const handleConnect = async () => {
    if (!token) return;
    setStep("connecting");
    try {
      await channelManagerAPI.connect(
        {
          establishmentId,
          channel: info.name,
          config: { apiKey, apiSecret, propertyId: propertyId || undefined, environment },
        },
        token
      );
      Alert.alert(
        "Connected! 🎉",
        `${info.displayName} is now live. Your inventory will sync automatically every 5 minutes.`,
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      setStep("credentials");
      Alert.alert("Connection Failed", "Please check your credentials and try again.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Channel Header */}
        <View style={styles.header}>
          <Text style={styles.emoji}>{info.emoji}</Text>
          <Text style={styles.title}>{info.displayName}</Text>
          <Text style={styles.desc}>{info.description}</Text>
        </View>

        {step === "info" && (
          <>
            {/* Setup Steps */}
            <Text style={styles.sectionTitle}>Setup Steps</Text>
            {info.setupSteps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}

            {/* Documentation Link */}
            <TouchableOpacity
              style={styles.docsBtn}
              onPress={() => Linking.openURL(info.docsUrl)}
            >
              <Text style={styles.docsBtnText}>📄 View API Documentation</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep("credentials")}>
              <Text style={styles.primaryBtnText}>I Have My Credentials →</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "credentials" && (
          <>
            <Text style={styles.sectionTitle}>Enter Credentials</Text>

            <Text style={styles.inputLabel}>API Key / Client ID *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your API key"
              placeholderTextColor="#666"
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>API Secret / Client Secret *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your API secret"
              placeholderTextColor="#666"
              value={apiSecret}
              onChangeText={setApiSecret}
              secureTextEntry
              autoCapitalize="none"
            />

            {info.requiresPropertyId && (
              <>
                <Text style={styles.inputLabel}>Property ID / Hotel Code *</Text>
                <TextInput
                  style={styles.input}
                  placeholder={`Your ${info.displayName} property ID`}
                  placeholderTextColor="#666"
                  value={propertyId}
                  onChangeText={setPropertyId}
                  autoCapitalize="none"
                />
              </>
            )}

            <Text style={styles.inputLabel}>Environment</Text>
            <View style={styles.envRow}>
              <TouchableOpacity
                style={[styles.envBtn, environment === "sandbox" && styles.envBtnActive]}
                onPress={() => setEnvironment("sandbox")}
              >
                <Text style={[styles.envBtnText, environment === "sandbox" && styles.envBtnTextActive]}>
                  🧪 Sandbox
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.envBtn, environment === "production" && styles.envBtnActive]}
                onPress={() => setEnvironment("production")}
              >
                <Text style={[styles.envBtnText, environment === "production" && styles.envBtnTextActive]}>
                  🚀 Production
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (!apiKey || !apiSecret) && styles.primaryBtnDisabled]}
              onPress={handleConnect}
              disabled={!apiKey || !apiSecret}
            >
              <Text style={styles.primaryBtnText}>Connect Channel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={() => setStep("info")}>
              <Text style={styles.backBtnText}>← Back to Setup Info</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "connecting" && (
          <View style={styles.connectingView}>
            <Text style={styles.connectingText}>Connecting to {info.displayName}...</Text>
            <Text style={styles.connectingSubtext}>Validating credentials and establishing connection</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  scroll: { padding: 20 },
  header: { alignItems: "center", marginBottom: 24 },
  emoji: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", textAlign: "center" },
  desc: { fontSize: 14, color: "#888", textAlign: "center", marginTop: 8, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 20, marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#6c63ff20", alignItems: "center", justifyContent: "center" },
  stepNumText: { color: "#6c63ff", fontWeight: "700", fontSize: 13 },
  stepText: { flex: 1, color: "#ccc", fontSize: 14, lineHeight: 20 },
  docsBtn: { backgroundColor: "#1a1a2e", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 16 },
  docsBtnText: { color: "#6c63ff", fontWeight: "600", fontSize: 14 },
  primaryBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 20 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  backBtn: { alignItems: "center", marginTop: 16 },
  backBtnText: { color: "#888", fontSize: 14 },
  inputLabel: { color: "#ccc", fontSize: 13, fontWeight: "500", marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: "#1a1a2e", borderRadius: 10, padding: 14, color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#2d2d44" },
  envRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  envBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44", alignItems: "center" },
  envBtnActive: { borderColor: "#6c63ff", backgroundColor: "#6c63ff10" },
  envBtnText: { color: "#888", fontSize: 14 },
  envBtnTextActive: { color: "#6c63ff", fontWeight: "600" },
  connectingView: { alignItems: "center", marginTop: 60 },
  connectingText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  connectingSubtext: { color: "#888", fontSize: 13, marginTop: 8 },
});
