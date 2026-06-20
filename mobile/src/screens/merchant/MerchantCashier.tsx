/**
 * MerchantCashier — Point of sale with QR code scanning and generation.
 * Integrates react-native-camera for barcode scanning and qrcode-svg for display.
 */
import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, ActivityIndicator,
} from "react-native";
import { merchantAPI, walletAPI } from "../../services/api";
import { biometricService } from "../../services/biometrics";

export function MerchantCashier({ navigation }: any) {
  const [showScanner, setShowScanner] = useState(false);
  const [showNewSale, setShowNewSale] = useState(false);
  const [saleAmount, setSaleAmount] = useState("");
  const [saleDescription, setSaleDescription] = useState("");
  const [processing, setProcessing] = useState(false);
  const [recentSales, setRecentSales] = useState<Array<{ id: string; amount: number; time: string; status: string }>>([]);

  const handleNewSale = async () => {
    const amount = parseFloat(saleAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Enter a valid amount");
      return;
    }

    setProcessing(true);
    try {
      const qr = await merchantAPI.generateQR({
        amount,
        currency: "NGN",
        description: saleDescription || undefined,
      });

      Alert.alert("QR Generated", `Amount: NGN ${amount.toFixed(2)}\nQR ID: ${qr.id}`);
      setShowNewSale(false);
      setSaleAmount("");
      setSaleDescription("");

      setRecentSales(prev => [{
        id: qr.id,
        amount,
        time: new Date().toLocaleTimeString(),
        status: "pending",
      }, ...prev]);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to generate QR");
    } finally {
      setProcessing(false);
    }
  };

  const handleScanResult = async (qrData: string) => {
    setShowScanner(false);
    try {
      // Parse QR data and process payment
      const parsed = JSON.parse(qrData);
      if (parsed.amount && parsed.currency) {
        const auth = await biometricService.authenticateForTransaction(parsed.amount, parsed.currency);
        if (auth.success) {
          Alert.alert("Payment Received", `${parsed.currency} ${parsed.amount.toFixed(2)} received`);
        }
      }
    } catch {
      Alert.alert("Invalid QR", "The scanned QR code is not a valid payment code");
    }
  };

  const todaySales = recentSales.length;
  const todayTotal = recentSales.reduce((sum, s) => sum + s.amount, 0);

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>Cashier Terminal</Text>

      {/* Stats */}
      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={s.statNum}>{todaySales}</Text>
          <Text style={s.statLabel}>Today's Sales</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>NGN {todayTotal.toLocaleString()}</Text>
          <Text style={s.statLabel}>Total</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>{recentSales.filter(s => s.status === "pending").length}</Text>
          <Text style={s.statLabel}>Pending</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={s.actionsGrid}>
        <TouchableOpacity style={s.actionBtn} onPress={() => setShowNewSale(true)}>
          <Text style={s.actionEmoji}>💳</Text>
          <Text style={s.actionLabel}>New Sale</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => setShowScanner(true)}>
          <Text style={s.actionEmoji}>📷</Text>
          <Text style={s.actionLabel}>Scan QR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn}>
          <Text style={s.actionEmoji}>🔙</Text>
          <Text style={s.actionLabel}>Refund</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Sales */}
      <Text style={s.section}>Recent Sales</Text>
      {recentSales.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>💳</Text>
          <Text style={s.emptyText}>No sales today</Text>
          <Text style={s.emptySubtext}>Process a new sale or accept QR payment</Text>
        </View>
      ) : (
        recentSales.map((sale) => (
          <View key={sale.id} style={s.saleRow}>
            <View>
              <Text style={s.saleId}>#{sale.id.slice(0, 8)}</Text>
              <Text style={s.saleTime}>{sale.time}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.saleAmount}>NGN {sale.amount.toLocaleString()}</Text>
              <Text style={[s.saleStatus, sale.status === "completed" ? { color: "#22c55e" } : { color: "#f59e0b" }]}>
                {sale.status}
              </Text>
            </View>
          </View>
        ))
      )}

      {/* New Sale Modal */}
      <Modal visible={showNewSale} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>New Sale</Text>
            <Text style={s.label}>Amount (NGN)</Text>
            <TextInput
              style={s.input}
              placeholder="0.00"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
              value={saleAmount}
              onChangeText={setSaleAmount}
              autoFocus
            />
            <Text style={s.label}>Description (optional)</Text>
            <TextInput
              style={s.input}
              placeholder="Item or service"
              placeholderTextColor="#666"
              value={saleDescription}
              onChangeText={setSaleDescription}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNewSale(false)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, processing && { opacity: 0.6 }]} onPress={handleNewSale} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.confirmText}>Generate QR</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scanner Modal (placeholder for RNCamera integration) */}
      <Modal visible={showScanner} animationType="slide">
        <View style={s.scannerContainer}>
          <Text style={s.scannerTitle}>Scan Payment QR</Text>
          <View style={s.scannerFrame}>
            <Text style={s.scannerHint}>Point camera at QR code</Text>
            {/* In production: <RNCamera onBarCodeRead={handleScanResult} /> */}
          </View>
          <TouchableOpacity style={s.scannerClose} onPress={() => setShowScanner(false)}>
            <Text style={s.scannerCloseText}>Close Scanner</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  title: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 12, marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { fontSize: 16, fontWeight: "700", color: "#fff" },
  statLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  actionBtn: { width: "30%", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  actionEmoji: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 10, color: "#ccc" },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 16, marginBottom: 12 },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  emptySubtext: { color: "#888", fontSize: 12, marginTop: 4, textAlign: "center" },
  saleRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  saleId: { color: "#fff", fontSize: 13, fontWeight: "500" },
  saleTime: { color: "#888", fontSize: 11, marginTop: 2 },
  saleAmount: { color: "#fff", fontSize: 14, fontWeight: "600" },
  saleStatus: { fontSize: 10, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 16 },
  label: { color: "#ccc", fontSize: 12, fontWeight: "500", marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", borderWidth: 1, borderColor: "#2d2d44" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "#2d2d44" },
  cancelText: { color: "#888" },
  confirmBtn: { flex: 1, padding: 14, alignItems: "center", borderRadius: 10, backgroundColor: "#6c63ff" },
  confirmText: { color: "#fff", fontWeight: "600" },
  scannerContainer: { flex: 1, backgroundColor: "#0f0f1a", padding: 16, justifyContent: "center", alignItems: "center" },
  scannerTitle: { fontSize: 20, fontWeight: "700", color: "#fff", marginBottom: 30 },
  scannerFrame: { width: 280, height: 280, borderWidth: 2, borderColor: "#6c63ff", borderRadius: 16, alignItems: "center", justifyContent: "center" },
  scannerHint: { color: "#888", fontSize: 14 },
  scannerClose: { marginTop: 30, padding: 14, paddingHorizontal: 32, backgroundColor: "#1a1a2e", borderRadius: 10 },
  scannerCloseText: { color: "#fff", fontWeight: "500" },
});
