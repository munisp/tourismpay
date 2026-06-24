/**
 * Social Commerce for Tourism (4.4)
 * 
 * In-app social feed, verified reviews, flash deals,
 * referral rewards, and merchant discovery.
 *
 * Middleware integration: OpenSearch (full-text search), Redis (feed cache),
 * Kafka (social events), Fluvio (real-time activity stream).
 * Persistence: PostgreSQL via Drizzle ORM.
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet } from "./redis";
import { getDb } from "../db";
import { eq, desc, or, sql } from "drizzle-orm";
import { socialPosts, flashDeals, referralRewards } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SocialPost {
  id: string;
  userId: string;
  merchantId?: string;
  type: "review" | "photo" | "tip" | "deal" | "experience";
  content: string;
  media: string[];
  rating?: number;
  location?: { lat: number; lng: number; name: string };
  tags: string[];
  likes: number;
  comments: number;
  verified: boolean;
  transactionId?: string;
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
  referrerReward: number;
  referredReward: number;
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

export async function createPost(post: Omit<SocialPost, "id" | "likes" | "comments" | "createdAt">): Promise<SocialPost> {
  const newPost: SocialPost = {
    ...post,
    id: `post_${Date.now()}`,
    likes: 0,
    comments: 0,
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(socialPosts).values({
      id: newPost.id,
      userId: newPost.userId,
      merchantId: newPost.merchantId ?? null,
      type: newPost.type,
      content: newPost.content,
      media: newPost.media,
      rating: newPost.rating ?? null,
      location: newPost.location ?? null,
      tags: newPost.tags,
      likes: newPost.likes,
      comments: newPost.comments,
      verified: newPost.verified,
      transactionId: newPost.transactionId ?? null,
      createdAt: newPost.createdAt,
    });
  }

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
  const db = await getDb();
  let feedPosts: SocialPost[] = [];

  if (db) {
    const rows = await db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt)).limit(200);
    feedPosts = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      merchantId: r.merchantId ?? undefined,
      type: r.type as SocialPost["type"],
      content: r.content,
      media: r.media as string[],
      rating: r.rating ?? undefined,
      location: r.location as SocialPost["location"],
      tags: r.tags as string[],
      likes: r.likes,
      comments: r.comments,
      verified: r.verified,
      transactionId: r.transactionId ?? undefined,
      createdAt: r.createdAt,
    }));
  }

  if (options.type) feedPosts = feedPosts.filter(p => p.type === options.type);
  if (options.merchantId) feedPosts = feedPosts.filter(p => p.merchantId === options.merchantId);
  if (options.userId) feedPosts = feedPosts.filter(p => p.userId === options.userId);

  if (options.lat && options.lng && options.radiusKm) {
    feedPosts = feedPosts.filter(p => {
      if (!p.location) return false;
      const dist = haversineDistance(options.lat!, options.lng!, p.location.lat, p.location.lng);
      return dist <= options.radiusKm!;
    });
  }

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
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(socialPosts).where(eq(socialPosts.id, postId));
    if (rows.length === 0) return false;
    await db.update(socialPosts).set({ likes: rows[0].likes + 1 }).where(eq(socialPosts.id, postId));
    await publishAuditEvent("social.post_liked", { postId, userId });
    return true;
  }
  return false;
}

// ─── Flash Deals ──────────────────────────────────────────────────────────────

export async function createFlashDeal(deal: Omit<FlashDeal, "id" | "currentRedemptions" | "status">): Promise<FlashDeal> {
  const newDeal: FlashDeal = {
    ...deal,
    id: `deal_${Date.now()}`,
    currentRedemptions: 0,
    status: "active",
  };

  const db = await getDb();
  if (db) {
    await db.insert(flashDeals).values({
      id: newDeal.id,
      merchantId: newDeal.merchantId,
      merchantName: newDeal.merchantName,
      title: newDeal.title,
      description: newDeal.description,
      discountPercentage: newDeal.discountPercentage,
      originalPrice: newDeal.originalPrice,
      dealPrice: newDeal.dealPrice,
      currency: newDeal.currency,
      maxRedemptions: newDeal.maxRedemptions,
      currentRedemptions: newDeal.currentRedemptions,
      geofence: newDeal.geofence ?? null,
      startsAt: newDeal.startsAt,
      expiresAt: newDeal.expiresAt,
      status: newDeal.status,
    });
  }

  await publishAuditEvent("social.deal_created", { dealId: newDeal.id, merchantId: deal.merchantId });
  return newDeal;
}

export async function getNearbyDeals(lat: number, lng: number, radiusKm: number): Promise<FlashDeal[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(flashDeals).where(eq(flashDeals.status, "active"));
  return rows.filter(d => {
    if (new Date(d.expiresAt) < new Date()) return false;
    const geo = d.geofence as FlashDeal["geofence"];
    if (!geo) return true;
    return haversineDistance(lat, lng, geo.lat, geo.lng) <= radiusKm;
  }).map(d => ({
    ...d,
    status: d.status as FlashDeal["status"],
    geofence: d.geofence as FlashDeal["geofence"],
  }));
}

export async function redeemDeal(dealId: string, userId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Atomic UPDATE prevents race condition — only succeeds if still active and under limit.
  // RETURNING id ensures Drizzle gives us the affected rows (db.execute returns [] for bare UPDATE).
  const result = await db.execute(sql`
    UPDATE flash_deals
    SET current_redemptions = current_redemptions + 1,
        status = CASE WHEN current_redemptions + 1 >= max_redemptions THEN 'sold_out' ELSE 'active' END
    WHERE id = ${dealId} AND status = 'active' AND current_redemptions < max_redemptions
    RETURNING id
  `);
  if ((result as any[]).length === 0) return false;

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
    referrerReward: 500,
    referredReward: 300,
    currency: "USD",
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(referralRewards).values({
      id: referral.id,
      referrerId: referral.referrerId,
      referredId: referral.referredId,
      status: referral.status,
      referrerReward: referral.referrerReward,
      referredReward: referral.referredReward,
      currency: referral.currency,
      createdAt: referral.createdAt,
    });
  }

  await publishAuditEvent("social.referral_created", { referralId: referral.id });
  return referral;
}

export async function completeReferral(referralId: string): Promise<ReferralReward | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(referralRewards).where(eq(referralRewards.id, referralId));
  if (rows.length === 0 || rows[0].status !== "pending") return null;

  const completedAt = new Date().toISOString();
  await db.update(referralRewards).set({ status: "completed", completedAt }).where(eq(referralRewards.id, referralId));
  await publishAuditEvent("social.referral_completed", { referralId });

  return {
    ...rows[0],
    status: "completed" as const,
    completedAt,
  };
}

export async function getUserReferrals(userId: string): Promise<ReferralReward[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(referralRewards).where(
    or(eq(referralRewards.referrerId, userId), eq(referralRewards.referredId, userId))
  );
  return rows.map(r => ({
    ...r,
    status: r.status as ReferralReward["status"],
    completedAt: r.completedAt ?? undefined,
  }));
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
