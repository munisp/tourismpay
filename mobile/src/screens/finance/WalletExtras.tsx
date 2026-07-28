/**
 * WalletExtras — Additional wallet features matching PWA parity:
 * Spending Limits, Balance Alerts, Scheduled Payments, Recurring Payments,
 * Spending Analytics, Statement Export, and Transaction Search.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, Modal, TextInput, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, ActivityIndicator,
} from "react-native";
import { walletAPI } from "../../services/api";

const CURRENCIES = ["USDC", "CBDC-NG", "XLM", "KES", "ZAR", "NGN", "GHS"];
type Tab = "limits" | "alerts" | "scheduled" | "recurring" | "analytics" | "search";

export function WalletExtras({ navigation }: any) {
  const [tab, setTab] = useState<Tab>("limits");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [spendingLimits, setSpendingLimits] = useState<any[]>([]);
  const [balanceAlerts, setBalanceAlerts] = useState<any[]>([]);
  const [scheduledPayments, setScheduledPayments] = useState<any[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Modals
  const [showSetLimit, setShowSetLimit] = useState(false);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  // Form — Spending Limit
  const [limitCurrency, setLimitCurrency] = useState("USDC");
  const [limitAmount, setLimitAmount] = useState("");
  const [limitPeriod, setLimitPeriod] = useState<"daily" | "monthly">("daily");

  // Form — Balance Alert
  const [alertCurrency, setAlertCurrency] = useState("USDC");
  const [alertThreshold, setAlertThreshold] = useState("");
  const [alertType, setAlertType] = useState<"below" | "above">("below");

  // Form — Schedule Payment
  const [schedTo, setSchedTo] = useState("");
  const [schedAmount, setSchedAmount] = useState("");
  const [schedCurrency, setSchedCurrency] = useState("USDC");
  const [schedDate, setSchedDate] = useState("");

  // Form — Recurring Payment
  const [recurTo, setRecurTo] = useState("");
  const [recurAmount, setRecurAmount] = useState("");
  const [recurCurrency, setRecurCurrency] = useState("USDC");
  const [recurFreq, setRecurFreq] = useState<"weekly" | "monthly">("monthly");

  const loadTab = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      if (t === "limits") {
        const d = await walletAPI.getSpendingLimits();
        setSpendingLimits((d as any)?.limits ?? (Array.isArray(d) ? d : []));
      } else if (t === "alerts") {
        const d = await walletAPI.getBalanceAlerts();
        setBalanceAlerts((d as any)?.alerts ?? (Array.isArray(d) ? d : []));
      } else if (t === "scheduled") {
        const d = await walletAPI.getScheduledPayments();
        setScheduledPayments((d as any)?.payments ?? (Array.isArray(d) ? d : []));
      } else if (t === "recurring") {
        const d = await walletAPI.getRecurringPayments();
        setRecurringPayments((d as any)?.payments ?? (Array.isArray(d) ? d : []));
      } else if (t === "analytics") {
        const d = await walletAPI.spendingAnalytics();
        setAnalytics(d);
      }
    } catch { /* show empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const onRefresh = () => { setRefreshing(true); loadTab(tab); };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const d = await walletAPI.searchTransactions({ query: searchQuery, limit: 30 });
      setSearchResults((d as any)?.transactions ?? (Array.isArray(d) ? d : []));
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setSearching(false); }
  };

  const handleSetLimit = async () => {
    if (!limitAmount) return Alert.alert("Error", "Enter limit amount");
    try {
      await walletAPI.setSpendingLimit({ currency: limitCurrency, amount: parseFloat(limitAmount), period: limitPeriod });
      Alert.alert("✅ Limit Set", `${limitPeriod} limit of ${limitAmount} ${limitCurrency} saved`);
      setShowSetLimit(false); setLimitAmount(""); loadTab("limits");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleAddAlert = async () => {
    if (!alertThreshold) return Alert.alert("Error", "Enter threshold");
    try {
      await walletAPI.setBalanceAlert({ currency: alertCurrency, threshold: parseFloat(alertThreshold), type: alertType });
      Alert.alert("✅ Alert Added");
      setShowAddAlert(false); setAlertThreshold(""); loadTab("alerts");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleSchedule = async () => {
    if (!schedTo || !schedAmount || !schedDate) return Alert.alert("Error", "Fill all fields");
    try {
      await walletAPI.schedulePayment({ to: schedTo, amount: parseFloat(schedAmount), currency: schedCurrency, scheduledAt: schedDate });
      Alert.alert("✅ Scheduled", `Payment of ${schedAmount} ${schedCurrency} scheduled for ${schedDate}`);
      setShowSchedule(false); setSchedTo(""); setSchedAmount(""); setSchedDate(""); loadTab("scheduled");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleRecurring = async () => {
    if (!recurTo || !recurAmount) return Alert.alert("Error", "Fill all fields");
    try {
      await walletAPI.createRecurringPayment({ to: recurTo, amount: parseFloat(recurAmount), currency: recurCurrency, frequency: recurFreq });
      Alert.alert("✅ Recurring Created");
      setShowRecurring(false); setRecurTo(""); setRecurAmount(""); loadTab("recurring");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleExportCSV = async () => {
    try {
      await walletAPI.exportTransactions({ format: "csv" });
      Alert.alert("✅ Export Started", "Your CSV statement will be emailed to you.");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleExportPDF = async () => {
    try {
      await walletAPI.exportStatementPdf({});
      Alert.alert("✅ PDF Generated", "Your PDF statement will be emailed to you.");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "limits", label: "Limits", icon: "🛡️" },
    { id: "alerts", label: "Alerts", icon: "🔔" },
    { id: "scheduled", label: "Scheduled", icon: "📅" },
    { id: "recurring", label: "Recurring", icon: "🔄" },
    { id: "analytics", label: "Analytics", icon: "📊" },
    { id: "search", label: "Search", icon: "🔍" },
  ];

  return (
    <View style={s.root}>
      {/* Tab Bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={[s.tab, tab === t.id && s.tabActive]} onPress={() => setTab(t.id)}>
            <Text style={s.tabIcon}>{t.icon}</Text>
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>

        {loading ? <ActivityIndicator size="large" color="#6c63ff" style={{ marginTop: 40 }} /> : null}

        {/* ── SPENDING LIMITS ── */}
        {tab === "limits" && !loading && (
          <>
            <View style={s.headerRow}>
              <Text style={s.sectionTitle}>Spending Limits</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowSetLimit(true)}>
                <Text style={s.addBtnText}>+ Set Limit</Text>
              </TouchableOpacity>
            </View>
            {spendingLimits.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No spending limits set</Text><Text style={s.emptySub}>Set daily or monthly caps per currency</Text></View> : (
              spendingLimits.map((l: any, i: number) => (
                <View key={l.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{l.currency} — {l.period}</Text>
                    <View style={[s.badge, l.active ? s.badgeGreen : s.badgeGray]}>
                      <Text style={s.badgeText}>{l.active ? "Active" : "Paused"}</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>Limit: {Number(l.amount).toFixed(2)} | Used: {Number(l.used ?? 0).toFixed(2)}</Text>
                  <View style={s.progressBar}>
                    <View style={[s.progressFill, { width: `${Math.min(100, ((l.used ?? 0) / l.amount) * 100)}%` as any }]} />
                  </View>
                  <View style={s.cardActions}>
                    <TouchableOpacity onPress={() => walletAPI.toggleSpendingLimit(l.id).then(() => loadTab("limits"))}>
                      <Text style={s.linkBtn}>{l.active ? "Pause" : "Resume"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => walletAPI.deleteSpendingLimit(l.id).then(() => loadTab("limits"))}>
                      <Text style={[s.linkBtn, { color: "#ef4444" }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── BALANCE ALERTS ── */}
        {tab === "alerts" && !loading && (
          <>
            <View style={s.headerRow}>
              <Text style={s.sectionTitle}>Balance Alerts</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddAlert(true)}>
                <Text style={s.addBtnText}>+ Add Alert</Text>
              </TouchableOpacity>
            </View>
            {balanceAlerts.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No balance alerts</Text><Text style={s.emptySub}>Get notified when your balance crosses a threshold</Text></View> : (
              balanceAlerts.map((a: any, i: number) => (
                <View key={a.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{a.currency} — {a.type === "below" ? "Below" : "Above"} {Number(a.threshold).toFixed(2)}</Text>
                    <View style={[s.badge, a.active ? s.badgeGreen : s.badgeGray]}>
                      <Text style={s.badgeText}>{a.active ? "On" : "Off"}</Text>
                    </View>
                  </View>
                  <Text style={s.cardSub}>Notify when balance goes {a.type} threshold</Text>
                  <View style={s.cardActions}>
                    <TouchableOpacity onPress={() => walletAPI.toggleBalanceAlert(a.id).then(() => loadTab("alerts"))}>
                      <Text style={s.linkBtn}>{a.active ? "Disable" : "Enable"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => walletAPI.deleteBalanceAlert(a.id).then(() => loadTab("alerts"))}>
                      <Text style={[s.linkBtn, { color: "#ef4444" }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── SCHEDULED PAYMENTS ── */}
        {tab === "scheduled" && !loading && (
          <>
            <View style={s.headerRow}>
              <Text style={s.sectionTitle}>Scheduled Payments</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowSchedule(true)}>
                <Text style={s.addBtnText}>+ Schedule</Text>
              </TouchableOpacity>
            </View>
            {scheduledPayments.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No scheduled payments</Text><Text style={s.emptySub}>Schedule one-time future-dated payments</Text></View> : (
              scheduledPayments.map((p: any, i: number) => (
                <View key={p.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>To: {p.to}</Text>
                    <Text style={s.cardAmount}>{Number(p.amount).toFixed(2)} {p.currency}</Text>
                  </View>
                  <Text style={s.cardSub}>Scheduled: {p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString() : "—"}</Text>
                  <View style={[s.badge, p.status === "pending" ? s.badgeYellow : s.badgeGreen]}>
                    <Text style={[s.badgeText, { color: p.status === "pending" ? "#f59e0b" : "#10b981" }]}>{p.status ?? "pending"}</Text>
                  </View>
                  {p.status === "pending" && (
                    <TouchableOpacity onPress={() => walletAPI.cancelScheduledPayment(p.id).then(() => loadTab("scheduled"))}>
                      <Text style={[s.linkBtn, { color: "#ef4444", marginTop: 8 }]}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}

        {/* ── RECURRING PAYMENTS ── */}
        {tab === "recurring" && !loading && (
          <>
            <View style={s.headerRow}>
              <Text style={s.sectionTitle}>Recurring Payments</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowRecurring(true)}>
                <Text style={s.addBtnText}>+ New</Text>
              </TouchableOpacity>
            </View>
            {recurringPayments.length === 0 ? <View style={s.empty}><Text style={s.emptyText}>No recurring payments</Text><Text style={s.emptySub}>Set up weekly or monthly standing orders</Text></View> : (
              recurringPayments.map((p: any, i: number) => (
                <View key={p.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>To: {p.to}</Text>
                    <Text style={s.cardAmount}>{Number(p.amount).toFixed(2)} {p.currency}</Text>
                  </View>
                  <Text style={s.cardSub}>{p.frequency} · Next: {p.nextRun ? new Date(p.nextRun).toLocaleDateString() : "—"}</Text>
                  <TouchableOpacity onPress={() => walletAPI.deleteRecurringPayment(p.id).then(() => loadTab("recurring"))}>
                    <Text style={[s.linkBtn, { color: "#ef4444", marginTop: 8 }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* ── SPENDING ANALYTICS ── */}
        {tab === "analytics" && !loading && (
          <>
            <View style={s.headerRow}>
              <Text style={s.sectionTitle}>Spending Analytics</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={s.addBtn} onPress={handleExportCSV}>
                  <Text style={s.addBtnText}>CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.addBtn} onPress={handleExportPDF}>
                  <Text style={s.addBtnText}>PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
            {!analytics ? <View style={s.empty}><Text style={s.emptyText}>No analytics data yet</Text></View> : (
              <>
                <View style={s.card}>
                  <Text style={s.cardSub}>Total Spent (30 days)</Text>
                  <Text style={[s.cardAmount, { fontSize: 24, marginTop: 4 }]}>{Number(analytics?.totalSpent ?? 0).toFixed(2)} USDC</Text>
                </View>
                <Text style={s.sectionTitle}>By Category</Text>
                {(analytics?.categories ?? []).map((c: any, i: number) => (
                  <View key={i} style={s.card}>
                    <View style={s.cardRow}>
                      <Text style={s.cardTitle}>{c.category}</Text>
                      <Text style={s.cardAmount}>{Number(c.amount).toFixed(2)}</Text>
                    </View>
                    <View style={s.progressBar}>
                      <View style={[s.progressFill, { width: `${Math.min(100, c.pct ?? 0)}%` as any }]} />
                    </View>
                    <Text style={s.cardSub}>{(c.pct ?? 0).toFixed(1)}% of total spend</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── TRANSACTION SEARCH ── */}
        {tab === "search" && (
          <>
            <Text style={s.sectionTitle}>Search Transactions</Text>
            <View style={s.searchRow}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                placeholder="Search by description, currency, amount..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={s.searchBtn} onPress={handleSearch}>
                {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.searchBtnText}>Go</Text>}
              </TouchableOpacity>
            </View>
            {searchResults.length === 0 && !searching ? (
              <View style={s.empty}><Text style={s.emptyText}>Enter a search term above</Text></View>
            ) : (
              searchResults.map((tx: any, i: number) => (
                <View key={tx.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{tx.description ?? tx.type}</Text>
                    <Text style={[s.cardAmount, tx.type === "credit" ? { color: "#10b981" } : { color: "#ef4444" }]}>
                      {tx.type === "credit" ? "+" : "-"}{Number(tx.amount).toFixed(2)} {tx.currency}
                    </Text>
                  </View>
                  <Text style={s.cardSub}>{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ""} · {tx.status ?? "completed"}</Text>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Set Spending Limit Modal */}
      <Modal visible={showSetLimit} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Set Spending Limit</Text>
            <Text style={s.inputLabel}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, limitCurrency === c && s.chipActive]} onPress={() => setLimitCurrency(c)}>
                  <Text style={[s.chipText, limitCurrency === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.inputLabel}>Period</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["daily", "monthly"] as const).map(p => (
                <TouchableOpacity key={p} style={[s.chip, limitPeriod === p && s.chipActive]} onPress={() => setLimitPeriod(p)}>
                  <Text style={[s.chipText, limitPeriod === p && s.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} placeholder="Limit amount" placeholderTextColor="#666" keyboardType="decimal-pad" value={limitAmount} onChangeText={setLimitAmount} />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowSetLimit(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleSetLimit}><Text style={s.btnPrimaryText}>Save Limit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Balance Alert Modal */}
      <Modal visible={showAddAlert} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Add Balance Alert</Text>
            <Text style={s.inputLabel}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, alertCurrency === c && s.chipActive]} onPress={() => setAlertCurrency(c)}>
                  <Text style={[s.chipText, alertCurrency === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.inputLabel}>Alert Type</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["below", "above"] as const).map(t => (
                <TouchableOpacity key={t} style={[s.chip, alertType === t && s.chipActive]} onPress={() => setAlertType(t)}>
                  <Text style={[s.chipText, alertType === t && s.chipTextActive]}>Balance goes {t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} placeholder="Threshold amount" placeholderTextColor="#666" keyboardType="decimal-pad" value={alertThreshold} onChangeText={setAlertThreshold} />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowAddAlert(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleAddAlert}><Text style={s.btnPrimaryText}>Add Alert</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Schedule Payment Modal */}
      <Modal visible={showSchedule} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Schedule Payment</Text>
            <TextInput style={s.input} placeholder="Recipient (email or wallet ID)" placeholderTextColor="#666" value={schedTo} onChangeText={setSchedTo} />
            <TextInput style={s.input} placeholder="Amount" placeholderTextColor="#666" keyboardType="decimal-pad" value={schedAmount} onChangeText={setSchedAmount} />
            <Text style={s.inputLabel}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, schedCurrency === c && s.chipActive]} onPress={() => setSchedCurrency(c)}>
                  <Text style={[s.chipText, schedCurrency === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput style={s.input} placeholder="Date (YYYY-MM-DD)" placeholderTextColor="#666" value={schedDate} onChangeText={setSchedDate} />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowSchedule(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleSchedule}><Text style={s.btnPrimaryText}>Schedule</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Recurring Payment Modal */}
      <Modal visible={showRecurring} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>New Recurring Payment</Text>
            <TextInput style={s.input} placeholder="Recipient (email or wallet ID)" placeholderTextColor="#666" value={recurTo} onChangeText={setRecurTo} />
            <TextInput style={s.input} placeholder="Amount" placeholderTextColor="#666" keyboardType="decimal-pad" value={recurAmount} onChangeText={setRecurAmount} />
            <Text style={s.inputLabel}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CURRENCIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, recurCurrency === c && s.chipActive]} onPress={() => setRecurCurrency(c)}>
                  <Text style={[s.chipText, recurCurrency === c && s.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={s.inputLabel}>Frequency</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["weekly", "monthly"] as const).map(f => (
                <TouchableOpacity key={f} style={[s.chip, recurFreq === f && s.chipActive]} onPress={() => setRecurFreq(f)}>
                  <Text style={[s.chipText, recurFreq === f && s.chipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowRecurring(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleRecurring}><Text style={s.btnPrimaryText}>Create</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f0f1a" },
  container: { flex: 1, padding: 16 },
  tabBar: { backgroundColor: "#1a1a2e", borderBottomWidth: 1, borderBottomColor: "#2a2a3e" },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabActive: { backgroundColor: "#6c63ff20", borderWidth: 1, borderColor: "#6c63ff" },
  tabIcon: { fontSize: 14 },
  tabLabel: { color: "#888", fontSize: 12, fontWeight: "500" },
  tabLabelActive: { color: "#6c63ff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  addBtn: { backgroundColor: "#6c63ff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#e5e7eb", fontSize: 13, fontWeight: "600", flex: 1 },
  cardSub: { color: "#888", fontSize: 11, marginTop: 4 },
  cardAmount: { color: "#6c63ff", fontSize: 14, fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 16, marginTop: 10 },
  linkBtn: { color: "#6c63ff", fontSize: 12, fontWeight: "600" },
  progressBar: { height: 4, backgroundColor: "#2a2a3e", borderRadius: 2, marginTop: 8, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#10b981", borderRadius: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start", marginTop: 6 },
  badgeGreen: { backgroundColor: "#10b98120" },
  badgeGray: { backgroundColor: "#88888820" },
  badgeYellow: { backgroundColor: "#f59e0b20" },
  badgeText: { fontSize: 10, fontWeight: "600", color: "#10b981" },
  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
  emptySub: { color: "#666", fontSize: 12, marginTop: 6, textAlign: "center" },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  searchBtn: { backgroundColor: "#6c63ff", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  searchBtnText: { color: "#fff", fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: "85%" },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10, borderWidth: 1, borderColor: "#2a2a3e" },
  inputLabel: { color: "#888", fontSize: 11, fontWeight: "600", marginBottom: 6, textTransform: "uppercase" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btnPrimary: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: "#2a2a3e", borderRadius: 12, padding: 14, alignItems: "center" },
  btnSecondaryText: { color: "#aaa", fontWeight: "600", fontSize: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#2a2a3e", marginRight: 6 },
  chipActive: { backgroundColor: "#6c63ff" },
  chipText: { color: "#aaa", fontSize: 12, fontWeight: "500" },
  chipTextActive: { color: "#fff" },
});
