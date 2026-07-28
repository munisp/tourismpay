/**
 * LoyaltyScreen — Full-depth Loyalty & Rewards matching PWA parity.
 * Covers: account overview, tier progress, expiring points warning,
 * redeem rewards, partner earn, referral programme, leaderboard,
 * points history, and trip summary reports.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, Modal, TextInput, TouchableOpacity,
  StyleSheet, Alert, RefreshControl, ActivityIndicator,
} from "react-native";
import { loyaltyAPI } from "../../services/api";

type Tab = "overview" | "redeem" | "earn" | "referral" | "leaderboard" | "history" | "trips";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#cd7f32", Silver: "#c0c0c0", Gold: "#ffd700", Platinum: "#e5e4e2",
};

export function LoyaltyScreen({ navigation }: any) {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [account, setAccount] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [expiringPoints, setExpiringPoints] = useState<any>(null);
  const [tripSummaries, setTripSummaries] = useState<any[]>([]);
  const [generatingTrip, setGeneratingTrip] = useState(false);

  // Modals
  const [showApplyReferral, setShowApplyReferral] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [showEarnPartner, setShowEarnPartner] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<any>(null);
  const [earnAmount, setEarnAmount] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [acc, rew, exp] = await Promise.all([
        loyaltyAPI.account(),
        loyaltyAPI.rewards(),
        loyaltyAPI.getExpiringPoints(),
      ]);
      setAccount(acc);
      setRewards(Array.isArray(rew) ? rew : (rew as any)?.rewards ?? []);
      setExpiringPoints(exp);
    } catch { /* show empty state */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const loadTab = useCallback(async (t: Tab) => {
    try {
      if (t === "earn") {
        const d = await loyaltyAPI.getPartners();
        setPartners(Array.isArray(d) ? d : (d as any)?.partners ?? []);
      } else if (t === "referral") {
        const d = await loyaltyAPI.getReferrals();
        setReferrals(d);
      } else if (t === "leaderboard") {
        const d = await loyaltyAPI.getLeaderboard({ limit: 20 });
        setLeaderboard((d as any)?.entries ?? (Array.isArray(d) ? d : []));
      } else if (t === "history") {
        const d = await loyaltyAPI.transactions({ limit: 30 });
        setHistory((d as any)?.transactions ?? (Array.isArray(d) ? d : []));
      } else if (t === "trips") {
        const d = await loyaltyAPI.getTripSummaries();
        setTripSummaries((d as any)?.summaries ?? (Array.isArray(d) ? d : []));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  const onRefresh = () => { setRefreshing(true); loadAll(); loadTab(tab); };

  const handleRedeem = async (reward: any) => {
    Alert.alert("Redeem Reward", `Spend ${reward.pointCost} points for "${reward.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Redeem", onPress: async () => {
          try {
            await loyaltyAPI.redeem({ rewardId: reward.id });
            Alert.alert("✅ Redeemed!", `You've redeemed "${reward.name}"`);
            loadAll();
          } catch (e: any) { Alert.alert("Error", e.message); }
        }
      }
    ]);
  };

  const handleCreateReferralCode = async () => {
    try {
      const d = await loyaltyAPI.createReferralCode();
      Alert.alert("✅ Code Created", `Your referral code: ${(d as any)?.code ?? "—"}`);
      loadTab("referral");
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleApplyReferral = async () => {
    if (!referralCode.trim()) return Alert.alert("Error", "Enter a referral code");
    try {
      await loyaltyAPI.applyReferral({ code: referralCode.trim() });
      Alert.alert("✅ Applied!", "Referral code applied successfully");
      setShowApplyReferral(false); setReferralCode("");
      loadAll();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleEarnWithPartner = async () => {
    if (!selectedPartner || !earnAmount) return Alert.alert("Error", "Select partner and enter amount");
    try {
      const d = await loyaltyAPI.earnWithPartner({ partnerId: selectedPartner.id, amount: parseFloat(earnAmount) });
      Alert.alert("✅ Points Earned!", `Earned ${(d as any)?.pointsEarned ?? "—"} points at ${selectedPartner.name}`);
      setShowEarnPartner(false); setEarnAmount(""); setSelectedPartner(null);
      loadAll();
    } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const handleGenerateTripSummary = async () => {
    setGeneratingTrip(true);
    try {
      await loyaltyAPI.generateTripSummary();
      Alert.alert("✅ Trip Summary Generated", "Your AI trip summary is ready");
      loadTab("trips");
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setGeneratingTrip(false); }
  };

  const tierColor = TIER_COLORS[account?.tier ?? "Bronze"] ?? "#cd7f32";
  const tierProgress = account?.tierProgress ?? 0;

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "🏆" },
    { id: "redeem", label: "Redeem", icon: "🎁" },
    { id: "earn", label: "Earn", icon: "💎" },
    { id: "referral", label: "Referral", icon: "👥" },
    { id: "leaderboard", label: "Leaders", icon: "🥇" },
    { id: "history", label: "History", icon: "📋" },
    { id: "trips", label: "Trips", icon: "✈️" },
  ];

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#6c63ff" /></View>;

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

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            {/* Expiring points warning */}
            {expiringPoints?.pointsExpiring > 0 && (
              <View style={s.warningBanner}>
                <Text style={s.warningText}>⚠️ {expiringPoints.pointsExpiring} points expiring in {expiringPoints.daysUntilExpiry} days</Text>
              </View>
            )}

            {/* Account card */}
            <View style={[s.accountCard, { borderColor: tierColor + "60" }]}>
              <View style={s.accountRow}>
                <View>
                  <Text style={s.pointsLabel}>Total Points</Text>
                  <Text style={s.pointsValue}>{(account?.points ?? 0).toLocaleString()}</Text>
                </View>
                <View style={[s.tierBadge, { backgroundColor: tierColor + "20", borderColor: tierColor + "60" }]}>
                  <Text style={[s.tierText, { color: tierColor }]}>{account?.tier ?? "Bronze"}</Text>
                </View>
              </View>

              {/* Tier progress bar */}
              <Text style={s.progressLabel}>
                {(account?.pointsToNextTier ?? 0).toLocaleString()} pts to {account?.nextTier ?? "Silver"}
              </Text>
              <View style={s.progressBar}>
                <View style={[s.progressFill, { width: `${Math.min(100, tierProgress)}%` as any, backgroundColor: tierColor }]} />
              </View>
              <Text style={s.progressPct}>{tierProgress.toFixed(0)}% to next tier</Text>
            </View>

            {/* Quick stats */}
            <View style={s.statsRow}>
              <View style={s.stat}><Text style={s.statNum}>{account?.rewardsRedeemed ?? 0}</Text><Text style={s.statLabel}>Redeemed</Text></View>
              <View style={s.stat}><Text style={s.statNum}>{account?.partnersUsed ?? 0}</Text><Text style={s.statLabel}>Partners</Text></View>
              <View style={s.stat}><Text style={s.statNum}>{account?.referralCount ?? 0}</Text><Text style={s.statLabel}>Referrals</Text></View>
            </View>

            {/* Multiplier info */}
            {account?.multiplier > 1 && (
              <View style={s.multiplierCard}>
                <Text style={s.multiplierText}>🚀 {account.multiplier}x Points Multiplier Active</Text>
                <Text style={s.multiplierSub}>Earn {account.multiplier}x points on every transaction</Text>
              </View>
            )}
          </>
        )}

        {/* ── REDEEM ── */}
        {tab === "redeem" && (
          <>
            <Text style={s.sectionTitle}>Available Rewards</Text>
            <Text style={s.sectionSub}>You have {(account?.points ?? 0).toLocaleString()} points</Text>
            {rewards.length === 0 ? (
              <View style={s.empty}><Text style={s.emptyText}>No rewards available</Text></View>
            ) : (
              rewards.map((r: any, i: number) => (
                <View key={r.id ?? i} style={s.rewardCard}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{r.name}</Text>
                    <Text style={s.pointsCost}>{r.pointCost?.toLocaleString() ?? "—"} pts</Text>
                  </View>
                  {r.description && <Text style={s.cardSub}>{r.description}</Text>}
                  <View style={s.cardRow}>
                    <Text style={s.cardSub}>{r.stock > 0 ? `${r.stock} left` : "Out of stock"}</Text>
                    <TouchableOpacity
                      style={[s.redeemBtn, (account?.points < r.pointCost || r.stock === 0) && s.redeemBtnDisabled]}
                      disabled={account?.points < r.pointCost || r.stock === 0}
                      onPress={() => handleRedeem(r)}
                    >
                      <Text style={s.redeemBtnText}>Redeem</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── EARN WITH PARTNERS ── */}
        {tab === "earn" && (
          <>
            <Text style={s.sectionTitle}>Partner Earn Opportunities</Text>
            <Text style={s.sectionSub}>Earn bonus points at partner establishments</Text>
            {partners.length === 0 ? (
              <View style={s.empty}><Text style={s.emptyText}>No partners available</Text></View>
            ) : (
              partners.map((p: any, i: number) => (
                <View key={p.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{p.name}</Text>
                    <Text style={s.pointsCost}>{p.multiplier ?? 1}x pts</Text>
                  </View>
                  <Text style={s.cardSub}>{p.category} · {p.location}</Text>
                  <TouchableOpacity style={s.earnBtn} onPress={() => { setSelectedPartner(p); setShowEarnPartner(true); }}>
                    <Text style={s.earnBtnText}>Earn Points Here</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* ── REFERRAL PROGRAMME ── */}
        {tab === "referral" && (
          <>
            <Text style={s.sectionTitle}>Referral Programme</Text>
            {referrals?.myCode ? (
              <View style={s.referralCodeCard}>
                <Text style={s.referralLabel}>Your Referral Code</Text>
                <Text style={s.referralCode}>{referrals.myCode}</Text>
                <Text style={s.referralSub}>{referrals.totalUses ?? 0} uses · {referrals.pointsEarned ?? 0} points earned</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.generateBtn} onPress={handleCreateReferralCode}>
                <Text style={s.generateBtnText}>Generate My Referral Code</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[s.generateBtn, { backgroundColor: "#1a1a2e", borderWidth: 1, borderColor: "#6c63ff" }]} onPress={() => setShowApplyReferral(true)}>
              <Text style={[s.generateBtnText, { color: "#6c63ff" }]}>Apply a Referral Code</Text>
            </TouchableOpacity>

            {(referrals?.referees ?? []).length > 0 && (
              <>
                <Text style={s.sectionTitle}>People You Referred</Text>
                {referrals.referees.map((r: any, i: number) => (
                  <View key={i} style={s.card}>
                    <View style={s.cardRow}>
                      <Text style={s.cardTitle}>{r.name ?? r.email}</Text>
                      <Text style={s.pointsCost}>+{r.pointsAwarded ?? 0} pts</Text>
                    </View>
                    <Text style={s.cardSub}>Joined {r.joinedAt ? new Date(r.joinedAt).toLocaleDateString() : "—"}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* ── LEADERBOARD ── */}
        {tab === "leaderboard" && (
          <>
            <Text style={s.sectionTitle}>Top Earners</Text>
            {leaderboard.length === 0 ? (
              <View style={s.empty}><Text style={s.emptyText}>No leaderboard data</Text></View>
            ) : (
              leaderboard.map((entry: any, i: number) => (
                <View key={entry.userId ?? i} style={[s.card, entry.isCurrentUser && { borderColor: "#6c63ff", borderWidth: 1 }]}>
                  <View style={s.cardRow}>
                    <Text style={[s.rankNum, i < 3 && { color: ["#ffd700", "#c0c0c0", "#cd7f32"][i] }]}>#{i + 1}</Text>
                    <Text style={[s.cardTitle, { flex: 1, marginLeft: 10 }]}>{entry.name ?? "Anonymous"}{entry.isCurrentUser ? " (You)" : ""}</Text>
                    <Text style={s.pointsCost}>{(entry.points ?? 0).toLocaleString()} pts</Text>
                  </View>
                  <Text style={s.cardSub}>{entry.tier ?? "Bronze"} · {entry.country ?? ""}</Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ── POINTS HISTORY ── */}
        {tab === "history" && (
          <>
            <Text style={s.sectionTitle}>Points History</Text>
            {history.length === 0 ? (
              <View style={s.empty}><Text style={s.emptyText}>No history yet</Text></View>
            ) : (
              history.map((tx: any, i: number) => (
                <View key={tx.id ?? i} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{tx.description ?? tx.type}</Text>
                    <Text style={[s.pointsCost, tx.type === "earn" ? { color: "#10b981" } : { color: "#ef4444" }]}>
                      {tx.type === "earn" ? "+" : "-"}{tx.points ?? 0} pts
                    </Text>
                  </View>
                  <Text style={s.cardSub}>{tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ""}</Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ── TRIP SUMMARIES ── */}
        {tab === "trips" && (
          <>
            <View style={s.headerRow}>
              <Text style={s.sectionTitle}>Trip Summary Reports</Text>
              <TouchableOpacity style={s.addBtn} onPress={handleGenerateTripSummary} disabled={generatingTrip}>
                {generatingTrip ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.addBtnText}>Generate</Text>}
              </TouchableOpacity>
            </View>
            <Text style={s.sectionSub}>AI-generated summaries of your travel spending</Text>
            {tripSummaries.length === 0 ? (
              <View style={s.empty}><Text style={s.emptyText}>No trip summaries yet</Text><Text style={s.emptySub}>Tap Generate to create your first AI trip summary</Text></View>
            ) : (
              tripSummaries.map((t: any, i: number) => (
                <View key={t.id ?? i} style={s.card}>
                  <Text style={s.cardTitle}>{t.title ?? `Trip ${i + 1}`}</Text>
                  <Text style={s.cardSub}>{t.period ?? ""}</Text>
                  {t.summary && <Text style={[s.cardSub, { marginTop: 6, color: "#ccc", lineHeight: 18 }]}>{t.summary}</Text>}
                  <View style={s.statsRow}>
                    <View style={s.stat}><Text style={s.statNum}>{t.totalSpend ?? "—"}</Text><Text style={s.statLabel}>Spent</Text></View>
                    <View style={s.stat}><Text style={s.statNum}>{t.pointsEarned ?? "—"}</Text><Text style={s.statLabel}>Points</Text></View>
                    <View style={s.stat}><Text style={s.statNum}>{t.establishments ?? "—"}</Text><Text style={s.statLabel}>Places</Text></View>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Apply Referral Modal */}
      <Modal visible={showApplyReferral} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Apply Referral Code</Text>
            <TextInput style={s.input} placeholder="Enter referral code" placeholderTextColor="#666" value={referralCode} onChangeText={setReferralCode} autoCapitalize="characters" />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowApplyReferral(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleApplyReferral}><Text style={s.btnPrimaryText}>Apply</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Earn with Partner Modal */}
      <Modal visible={showEarnPartner} animationType="slide" transparent>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Earn at {selectedPartner?.name}</Text>
            <Text style={s.cardSub}>{selectedPartner?.multiplier ?? 1}x points multiplier</Text>
            <TextInput style={[s.input, { marginTop: 12 }]} placeholder="Transaction amount (USD)" placeholderTextColor="#666" keyboardType="decimal-pad" value={earnAmount} onChangeText={setEarnAmount} />
            {earnAmount && selectedPartner && (
              <Text style={{ color: "#10b981", fontSize: 13, marginBottom: 8 }}>
                ≈ {Math.round(parseFloat(earnAmount || "0") * (selectedPartner.multiplier ?? 1) * 10)} points
              </Text>
            )}
            <View style={s.modalActions}>
              <TouchableOpacity style={s.btnSecondary} onPress={() => setShowEarnPartner(false)}><Text style={s.btnSecondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={s.btnPrimary} onPress={handleEarnWithPartner}><Text style={s.btnPrimaryText}>Earn Points</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f0f1a" },
  center: { flex: 1, backgroundColor: "#0f0f1a", justifyContent: "center", alignItems: "center" },
  container: { flex: 1, padding: 16 },
  tabBar: { backgroundColor: "#1a1a2e", borderBottomWidth: 1, borderBottomColor: "#2a2a3e" },
  tabBarContent: { paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  tabActive: { backgroundColor: "#6c63ff20", borderWidth: 1, borderColor: "#6c63ff" },
  tabIcon: { fontSize: 14 },
  tabLabel: { color: "#888", fontSize: 12, fontWeight: "500" },
  tabLabelActive: { color: "#6c63ff" },
  warningBanner: { backgroundColor: "#f59e0b15", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#f59e0b40" },
  warningText: { color: "#f59e0b", fontSize: 13, fontWeight: "600" },
  accountCard: { backgroundColor: "#1a1a2e", borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1 },
  accountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  pointsLabel: { color: "#888", fontSize: 12 },
  pointsValue: { color: "#fff", fontSize: 32, fontWeight: "700", marginTop: 2 },
  tierBadge: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1 },
  tierText: { fontSize: 14, fontWeight: "700" },
  progressLabel: { color: "#888", fontSize: 11, marginBottom: 6 },
  progressBar: { height: 6, backgroundColor: "#2a2a3e", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressPct: { color: "#666", fontSize: 10, marginTop: 4, textAlign: "right" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 12, alignItems: "center" },
  statNum: { color: "#fff", fontSize: 18, fontWeight: "700" },
  statLabel: { color: "#888", fontSize: 10, marginTop: 2 },
  multiplierCard: { backgroundColor: "#6c63ff15", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#6c63ff30" },
  multiplierText: { color: "#6c63ff", fontSize: 14, fontWeight: "700" },
  multiplierSub: { color: "#888", fontSize: 12, marginTop: 4 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  sectionSub: { color: "#888", fontSize: 12, marginBottom: 12 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  addBtn: { backgroundColor: "#6c63ff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  card: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  rewardCard: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#e5e7eb", fontSize: 13, fontWeight: "600", flex: 1 },
  cardSub: { color: "#888", fontSize: 11, marginTop: 4 },
  pointsCost: { color: "#6c63ff", fontSize: 13, fontWeight: "700" },
  redeemBtn: { backgroundColor: "#6c63ff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  redeemBtnDisabled: { backgroundColor: "#2a2a3e" },
  redeemBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  earnBtn: { backgroundColor: "#10b98120", borderRadius: 8, padding: 8, marginTop: 8, alignItems: "center", borderWidth: 1, borderColor: "#10b98140" },
  earnBtnText: { color: "#10b981", fontSize: 12, fontWeight: "600" },
  generateBtn: { backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 12 },
  generateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  referralCodeCard: { backgroundColor: "#6c63ff15", borderRadius: 16, padding: 20, alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "#6c63ff30" },
  referralLabel: { color: "#888", fontSize: 12, marginBottom: 8 },
  referralCode: { color: "#6c63ff", fontSize: 28, fontWeight: "700", letterSpacing: 4 },
  referralSub: { color: "#888", fontSize: 11, marginTop: 8 },
  rankNum: { color: "#fff", fontSize: 18, fontWeight: "700", width: 32 },
  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: "#aaa", fontSize: 15, fontWeight: "600" },
  emptySub: { color: "#666", fontSize: 12, marginTop: 6, textAlign: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  modal: { backgroundColor: "#1a1a2e", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 16 },
  input: { backgroundColor: "#0f0f1a", borderRadius: 10, padding: 12, color: "#fff", marginBottom: 10, borderWidth: 1, borderColor: "#2a2a3e" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  btnPrimary: { flex: 1, backgroundColor: "#6c63ff", borderRadius: 12, padding: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSecondary: { flex: 1, backgroundColor: "#2a2a3e", borderRadius: 12, padding: 14, alignItems: "center" },
  btnSecondaryText: { color: "#aaa", fontWeight: "600", fontSize: 14 },
});
