/**
 * Login Screen — email/password + biometric authentication.
 */
import React, { useState, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";

export function LoginScreen() {
  const { login, loginWithBiometric, biometricAvailable, biometricEnabled, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (biometricEnabled && !isLoading) {
      handleBiometricLogin();
    }
  }, [biometricEnabled, isLoading]);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.success) {
      Alert.alert("Login Failed", result.error ?? "Invalid credentials");
    }
  };

  const handleBiometricLogin = async () => {
    const result = await loginWithBiometric();
    if (!result.success && result.error !== "No saved session") {
      // Don't show error for first-time users
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={s.content}>
        {/* Logo */}
        <View style={s.logoContainer}>
          <Text style={s.logoEmoji}>🌍</Text>
          <Text style={s.logoText}>TourismPay</Text>
          <Text style={s.tagline}>Africa's Tourism Payment Platform</Text>
        </View>

        {/* Form */}
        <View style={s.form}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={s.label}>Password</Text>
          <TextInput
            style={s.input}
            placeholder="••••••••"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[s.loginBtn, loading && s.disabledBtn]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.loginText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Biometric Login */}
          {biometricAvailable && biometricEnabled && (
            <TouchableOpacity style={s.biometricBtn} onPress={handleBiometricLogin}>
              <Text style={s.biometricIcon}>🔐</Text>
              <Text style={s.biometricText}>Sign in with biometrics</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <TouchableOpacity>
            <Text style={s.footerLink}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  logoContainer: { alignItems: "center", marginBottom: 48 },
  logoEmoji: { fontSize: 56 },
  logoText: { fontSize: 32, fontWeight: "700", color: "#fff", marginTop: 12 },
  tagline: { fontSize: 14, color: "#888", marginTop: 4 },
  form: { gap: 4 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginTop: 16, marginBottom: 4 },
  input: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, color: "#fff", fontSize: 15, borderWidth: 1, borderColor: "#2d2d44" },
  loginBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 24 },
  loginText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  disabledBtn: { opacity: 0.6 },
  biometricBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 16, padding: 14, backgroundColor: "#1a1a2e", borderRadius: 12, gap: 8 },
  biometricIcon: { fontSize: 20 },
  biometricText: { color: "#6c63ff", fontSize: 14, fontWeight: "500" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 32 },
  footerText: { color: "#888", fontSize: 14 },
  footerLink: { color: "#6c63ff", fontSize: 14, fontWeight: "600" },
});
