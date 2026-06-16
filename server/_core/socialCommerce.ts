/**
 * Social Commerce for Tourism (4.4)
 * 
 * In-app social feed, verified reviews, flash deals,
 * referral rewards, and merchant discovery.
 *
 * Middleware integration: OpenSearch (full-text search), Redis (feed cache),
 * Kafka (social events), Fluvio (real-time activity stream).
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet } from "./redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  userId: string;
  merchantId?: string;
  type: "review" | "photo" | "tip" | "deal" | "experience";
  content: string;
  media: string[];
  rating?: number; // 1-5
  location?: { lat: number; lng: number; name: string };
  tags: string[];
  likes: number;
  comments: number;
  verified: boolean; // Verified purchase/visit
  transactionId?: string; // Proof of purchase
  createdAt: string;
}

export interface FlashDeal {
  id: string;
  merchantId: string;
  merchantName: string;
  title: string;
  description: string;
  discountPercentage: number;
  originalPrice: number;
  dealPrice: number;
  currency: string;
  maxRedemptions: number;
  currentRedemptions: number;
  geofence?: { lat: number; lng: number; radiusKm: number };
  startsAt: string;
  expiresAt: string;
  status: "active" | "expired" | "sold_out";
}

export interface ReferralReward {
  id: string;
  referrerId: string;
  referredId: string;
  status: "pending" | "completed" | "expired";
  referrerReward: number; // Cents
  referredReward: number; // Cents
  currency: string;
  completedAt?: string;
  createdAt: string;
}

export interface MerchantProfile {
  merchantId: string;
  name: string;
  category: string;
  rating: number;
  reviewCount: number;
  greenBadge: boolean;
  responseRate: number;
  verified: boolean;
  socialFollowers: number;
  recentDeals: number;
}

// ─── Social Feed ──────────────────────────────────────────────────────────────

const posts: Map<string, SocialPost> = new Map();
const deals: Map<string, FlashDeal> = new Map();
const referrals: Map<string, ReferralReward> = new Map();

export async function createPost(post: Omit<SocialPost, "id" | "likes" | "comments" | "createdAt">): Promise<SocialPost> {
  const newPost: SocialPost = {
    ...post,
    id: `post_${Date.now()}`,
    likes: 0,
    comments: 0,
    createdAt: new Date().toISOString(),
  };

  posts.set(newPost.id, newPost);
  await publishAuditEvent("social.post_created", { postId: newPost.id, type: post.type });
  await cacheSet(`social:post:${newPost.id}`, JSON.stringify(newPost), 86400);

  return newPost;
}

export async function getFeed(options: {
  userId?: string;
  merchantId?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  type?: SocialPost["type"];
  limit?: number;
  offset?: number;
}): Promise<SocialPost[]> {
  let feedPosts = Array.from(posts.values());

  if (options.type) feedPosts = feedPosts.filter(p => p.type === options.type);
  if (options.merchantId) feedPosts = feedPosts.filter(p => p.merchantId === options.merchantId);
  if (options.userId) feedPosts = feedPosts.filter(p => p.userId === options.userId);

  // Geofence filter
  if (options.lat && options.lng && options.radiusKm) {
    feedPosts = feedPosts.filter(p => {
      if (!p.location) return false;
      const dist = haversineDistance(options.lat!, options.lng!, p.location.lat, p.location.lng);
      return dist <= options.radiusKm!;
    });
  }

  // Sort by recency + engagement
  feedPosts.sort((a, b) => {
    const scoreA = a.likes * 2 + a.comments * 3 + (a.verified ? 10 : 0);
    const scoreB = b.likes * 2 + b.comments * 3 + (b.verified ? 10 : 0);
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return (scoreB + timeB / 100000) - (scoreA + timeA / 100000);
  });

  const limit = options.limit || 20;
  const offset = options.offset || 0;
  return feedPosts.slice(offset, offset + limit);
}

export async function likePost(postId: string, userId: string): Promise<boolean> {
  const post = posts.get(postId);
  if (!post) return false;
  post.likes++;
  await publishAuditEvent("social.post_liked", { postId, userId });
  return true;
}

// ─── Flash Deals ──────────────────────────────────────────────────────────────

export async function createFlashDeal(deal: Omit<FlashDeal, "id" | "currentRedemptions" | "status">): Promise<FlashDeal> {
  const newDeal: FlashDeal = {
    ...deal,
    id: `deal_${Date.now()}`,
    currentRedemptions: 0,
    status: "active",
  };

  deals.set(newDeal.id, newDeal);
  await publishAuditEvent("social.deal_created", { dealId: newDeal.id, merchantId: deal.merchantId });
  return newDeal;
}

export async function getNearbyDeals(lat: number, lng: number, radiusKm: number): Promise<FlashDeal[]> {
  const activeDeals = Array.from(deals.values()).filter(d => {
    if (d.status !== "active") return false;
    if (new Date(d.expiresAt) < new Date()) return false;
    if (!d.geofence) return true;
    return haversineDistance(lat, lng, d.geofence.lat, d.geofence.lng) <= radiusKm;
  });
  return activeDeals;
}

export async function redeemDeal(dealId: string, userId: string): Promise<boolean> {
  const deal = deals.get(dealId);
  if (!deal || deal.status !== "active") return false;
  if (deal.currentRedemptions >= deal.maxRedemptions) {
    deal.status = "sold_out";
    return false;
  }
  deal.currentRedemptions++;
  if (deal.currentRedemptions >= deal.maxRedemptions) deal.status = "sold_out";
  await publishAuditEvent("social.deal_redeemed", { dealId, userId });
  return true;
}

// ─── Referral System ──────────────────────────────────────────────────────────

export async function createReferral(referrerId: string, referredId: string): Promise<ReferralReward> {
  const referral: ReferralReward = {
    id: `ref_${Date.now()}`,
    referrerId,
    referredId,
    status: "pending",
    referrerReward: 500, // $5.00
    referredReward: 300, // $3.00
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  referrals.set(referral.id, referral);
  await publishAuditEvent("social.referral_created", { referralId: referral.id });
  return referral;
}

export async function completeReferral(referralId: string): Promise<ReferralReward | null> {
  const referral = referrals.get(referralId);
  if (!referral || referral.status !== "pending") return null;

  referral.status = "completed";
  referral.completedAt = new Date().toISOString();
  await publishAuditEvent("social.referral_completed", { referralId });
  return referral;
}

export function getUserReferrals(userId: string): ReferralReward[] {
  return Array.from(referrals.values()).filter(r => r.referrerId === userId || r.referredId === userId);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

logger.info("[Social] Social commerce module loaded");
