/**
 * Loyalty Screen — Points balance, tier progress, rewards catalog, and redemption.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ActivityIndicator,
} from "react-native";
import { loyaltyAPI, LoyaltyPoints, LoyaltyTier, Reward } from "../../services/api";

export function LoyaltyScreen() {
  const [points, setPoints] = useState<LoyaltyPoints | null>(null);
  const [tier, setTier] = useState<LoyaltyTier | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [p, t, r] = await Promise.all([
        loyaltyAPI.getPoints(),
        loyaltyAPI.getTier(),
        loyaltyAPI.getRewards(),
      ]);
      setPoints(p);
      setTier(t);
      setRewards(r);
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleRedeem = async (reward: Reward) => {
    if (!points || points.balance < reward.pointsCost) {
      Alert.alert("Insufficient Points", `You need ${reward.pointsCost - (points?.balance ?? 0)} more points`);
      return;
    }

    Alert.alert("Redeem Reward", `Spend ${reward.pointsCost} points for "${reward.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Redeem",
        onPress: async () => {
          setRedeeming(reward.id);
          try {
            await loyaltyAPI.redeemReward(reward.id);
            Alert.alert("Redeemed!", `You've redeemed "${reward.name}"`);
            await loadData();
          } catch (err) {
            Alert.alert("Failed", err instanceof Error ? err.message : "Redemption failed");
          } finally {
            setRedeeming(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[s.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6c63ff" />
      </View>
    );
  }

  const tierColors: Record<string, string> = { bronze: "#cd7f32", silver: "#c0c0c0", gold: "#ffd700", platinum: "#e5e4e2" };
  const tierColor = tierColors[tier?.current ?? "bronze"] ?? "#cd7f32";

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6c63ff" />}>
      {/* Points Card */}
      <View style={[s.pointsCard, { borderColor: tierColor }]}>
        <Text style={s.tierBadge}>{tier?.current?.toUpperCase() ?? "BRONZE"}</Text>
        <Text style={s.pointsBalance}>{points?.balance?.toLocaleString() ?? 0}</Text>
        <Text style={s.pointsLabel}>Available Points</Text>
        {tier && <Text style={s.tierProgress}>{tier.pointsToNext.toLocaleString()} points to next tier</Text>}
      </View>

      {/* Points Breakdown */}
      <View style={s.breakdownRow}>
        <View style={s.breakdownItem}>
          <Text style={s.breakdownNum}>{points?.lifetime?.toLocaleString() ?? 0}</Text>
          <Text style={s.breakdownLabel}>Lifetime</Text>
        </View>
        <View style={s.breakdownItem}>
          <Text style={s.breakdownNum}>{points?.pendingPoints?.toLocaleString() ?? 0}</Text>
          <Text style={s.breakdownLabel}>Pending</Text>
        </View>
        <View style={s.breakdownItem}>
          <Text style={[s.breakdownNum, { color: "#ef4444" }]}>{points?.expiringPoints?.toLocaleString() ?? 0}</Text>
          <Text style={s.breakdownLabel}>Expiring</Text>
        </View>
      </View>

      {/* Tier Benefits */}
      {tier && tier.benefits.length > 0 && (
        <>
          <Text style={s.section}>Your Benefits</Text>
          {tier.benefits.map((benefit, i) => (
            <View key={i} style={s.benefitRow}>
              <Text style={s.benefitDot}>•</Text>
              <Text style={s.benefitText}>{benefit}</Text>
            </View>
          ))}
        </>
      )}

      {/* Rewards Catalog */}
      <Text style={s.section}>Redeem Rewards</Text>
      {rewards.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyEmoji}>🎁</Text>
          <Text style={s.emptyText}>No rewards available</Text>
        </View>
      ) : (
        rewards.map((reward) => (
          <TouchableOpacity
            key={reward.id}
            style={[s.rewardCard, !reward.available && { opacity: 0.5 }]}
            onPress={() => reward.available && handleRedeem(reward)}
            disabled={!reward.available || redeeming === reward.id}
          >
            <View style={s.rewardInfo}>
              <Text style={s.rewardName}>{reward.name}</Text>
              <Text style={s.rewardDesc} numberOfLines={1}>{reward.description}</Text>
              <Text style={s.rewardCategory}>{reward.category}</Text>
            </View>
            <View style={s.rewardCost}>
              {redeeming === reward.id ? (
                <ActivityIndicator size="small" color="#6c63ff" />
              ) : (
                <>
                  <Text style={s.rewardPoints}>{reward.pointsCost.toLocaleString()}</Text>
                  <Text style={s.rewardPtsLabel}>pts</Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a", padding: 16 },
  pointsCard: { backgroundColor: "#1a1a2e", borderRadius: 20, padding: 28, alignItems: "center", marginTop: 8, borderWidth: 2 },
  tierBadge: { fontSize: 12, fontWeight: "700", color: "#888", letterSpacing: 2, marginBottom: 8 },
  pointsBalance: { fontSize: 44, fontWeight: "700", color: "#fff" },
  pointsLabel: { color: "#888", fontSize: 13, marginTop: 4 },
  tierProgress: { color: "#6c63ff", fontSize: 12, marginTop: 8 },
  breakdownRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  breakdownItem: { flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, alignItems: "center" },
  breakdownNum: { fontSize: 16, fontWeight: "700", color: "#fff" },
  breakdownLabel: { fontSize: 10, color: "#888", marginTop: 4 },
  section: { fontSize: 16, fontWeight: "600", color: "#fff", marginTop: 24, marginBottom: 12 },
  benefitRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8 },
  benefitDot: { color: "#6c63ff", fontSize: 16 },
  benefitText: { color: "#ccc", fontSize: 13 },
  emptyState: { backgroundColor: "#1a1a2e", borderRadius: 14, padding: 30, alignItems: "center" },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: "#888", fontSize: 14 },
  rewardCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#1a1a2e", borderRadius: 12, padding: 14, marginBottom: 8 },
  rewardInfo: { flex: 1 },
  rewardName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  rewardDesc: { color: "#888", fontSize: 11, marginTop: 2 },
  rewardCategory: { color: "#6c63ff", fontSize: 10, marginTop: 4 },
  rewardCost: { alignItems: "center", paddingLeft: 12 },
  rewardPoints: { color: "#fff", fontSize: 16, fontWeight: "700" },
  rewardPtsLabel: { color: "#888", fontSize: 10 },
});
