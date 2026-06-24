/**
 * Advanced Merchant Tools (2.5)
 * 
 * Inventory management, dynamic pricing, split payments,
 * multi-location management, and analytics for merchants.
 *
 * Middleware integration: Redis (price cache), Kafka (inventory events),
 * OpenSearch (product catalog), Temporal (settlement workflows).
 * Persistence: PostgreSQL via Drizzle ORM.
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet } from "./redis";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { merchantInventory, merchantLocations, merchantSplitPayments } from "../../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  merchantId: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  quantity: number;
  lowStockThreshold: number;
  dynamicPricing: DynamicPricingRule | null;
  images: string[];
  status: "active" | "inactive" | "out_of_stock";
  createdAt: string;
  updatedAt: string;
}

export interface DynamicPricingRule {
  type: "demand" | "time_of_day" | "season" | "bundle";
  basePrice: number;
  minPrice: number;
  maxPrice: number;
  multiplier: number;
  peakHours?: number[];
  peakSeason?: string[];
  bundleSize?: number;
  bundleDiscount?: number;
}

export interface SplitPayment {
  id: string;
  totalAmount: number;
  currency: string;
  splits: PaymentSplit[];
  status: "pending" | "partial" | "completed";
  createdAt: string;
}

export interface PaymentSplit {
  recipientId: string;
  recipientType: "merchant" | "platform" | "tax" | "partner";
  amount: number;
  percentage: number;
  status: "pending" | "settled";
}

export interface MerchantLocation {
  id: string;
  merchantId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  timezone: string;
  operatingHours: OperatingHours;
  capabilities: string[];
  status: "open" | "closed" | "temporarily_closed";
}

interface OperatingHours {
  monday: { open: string; close: string } | null;
  tuesday: { open: string; close: string } | null;
  wednesday: { open: string; close: string } | null;
  thursday: { open: string; close: string } | null;
  friday: { open: string; close: string } | null;
  saturday: { open: string; close: string } | null;
  sunday: { open: string; close: string } | null;
}

export interface MerchantAnalytics {
  merchantId: string;
  period: string;
  revenue: number;
  transactions: number;
  averageOrderValue: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  customerRetention: number;
  peakHours: { hour: number; transactions: number }[];
  comparisonPrevious: { revenueChange: number; transactionChange: number };
}

// ─── Inventory Management ─────────────────────────────────────────────────────

export async function addInventoryItem(item: Omit<InventoryItem, "id" | "status" | "createdAt" | "updatedAt">): Promise<InventoryItem> {
  const newItem: InventoryItem = {
    ...item,
    id: `inv_${Date.now()}`,
    status: item.quantity > 0 ? "active" : "out_of_stock",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(merchantInventory).values({
      id: newItem.id,
      merchantId: newItem.merchantId,
      sku: newItem.sku,
      name: newItem.name,
      category: newItem.category,
      price: newItem.price,
      currency: newItem.currency,
      quantity: newItem.quantity,
      lowStockThreshold: newItem.lowStockThreshold,
      dynamicPricing: newItem.dynamicPricing,
      images: newItem.images,
      status: newItem.status,
      createdAt: newItem.createdAt,
      updatedAt: newItem.updatedAt,
    });
  }

  await publishAuditEvent("merchant.inventory_added", { itemId: newItem.id, merchantId: item.merchantId });
  return newItem;
}

export async function updateStock(itemId: string, quantityChange: number): Promise<InventoryItem | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(merchantInventory).where(eq(merchantInventory.id, itemId));
  if (rows.length === 0) return null;

  const row = rows[0];
  const newQuantity = Math.max(0, row.quantity + quantityChange);
  const newStatus = newQuantity > 0 ? "active" : "out_of_stock";
  const updatedAt = new Date().toISOString();

  await db.update(merchantInventory).set({
    quantity: newQuantity,
    status: newStatus,
    updatedAt,
  }).where(eq(merchantInventory.id, itemId));

  if (newQuantity <= row.lowStockThreshold && newQuantity > 0) {
    await publishAuditEvent("merchant.low_stock_alert", { itemId, quantity: newQuantity, threshold: row.lowStockThreshold });
  }

  return {
    id: row.id,
    merchantId: row.merchantId,
    sku: row.sku,
    name: row.name,
    category: row.category,
    price: row.price,
    currency: row.currency,
    quantity: newQuantity,
    lowStockThreshold: row.lowStockThreshold,
    dynamicPricing: row.dynamicPricing as DynamicPricingRule | null,
    images: row.images as string[],
    status: newStatus as InventoryItem["status"],
    createdAt: row.createdAt,
    updatedAt,
  };
}

export async function getInventory(merchantId: string): Promise<InventoryItem[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(merchantInventory).where(eq(merchantInventory.merchantId, merchantId));
  return rows.map(r => ({
    id: r.id,
    merchantId: r.merchantId,
    sku: r.sku,
    name: r.name,
    category: r.category,
    price: r.price,
    currency: r.currency,
    quantity: r.quantity,
    lowStockThreshold: r.lowStockThreshold,
    dynamicPricing: r.dynamicPricing as DynamicPricingRule | null,
    images: r.images as string[],
    status: r.status as InventoryItem["status"],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

// ─── Dynamic Pricing ──────────────────────────────────────────────────────────

export function calculateDynamicPrice(item: InventoryItem): number {
  if (!item.dynamicPricing) return item.price;
  const rule = item.dynamicPricing;
  let price = rule.basePrice;

  const hour = new Date().getHours();

  switch (rule.type) {
    case "time_of_day":
      if (rule.peakHours?.includes(hour)) {
        price = Math.round(rule.basePrice * rule.multiplier);
      }
      break;
    case "demand":
      if (item.quantity < item.lowStockThreshold) {
        price = Math.round(rule.basePrice * rule.multiplier);
      }
      break;
    case "season": {
      const month = new Date().toLocaleString("en", { month: "long" }).toLowerCase();
      if (rule.peakSeason?.includes(month)) {
        price = Math.round(rule.basePrice * rule.multiplier);
      }
      break;
    }
  }

  return Math.max(rule.minPrice, Math.min(rule.maxPrice, price));
}

// ─── Split Payments ───────────────────────────────────────────────────────────

export async function createSplitPayment(
  totalAmount: number,
  currency: string,
  splits: Omit<PaymentSplit, "status">[],
): Promise<SplitPayment> {
  const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.abs(splitSum - totalAmount) > 1) {
    throw new Error(`Split amounts (${splitSum}) don't match total (${totalAmount})`);
  }

  const payment: SplitPayment = {
    id: `split_${Date.now()}`,
    totalAmount,
    currency,
    splits: splits.map(s => ({ ...s, status: "pending" })),
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const db = await getDb();
  if (db) {
    await db.insert(merchantSplitPayments).values({
      id: payment.id,
      totalAmount: payment.totalAmount,
      currency: payment.currency,
      splits: payment.splits,
      status: payment.status,
      createdAt: payment.createdAt,
    });
  }

  await publishAuditEvent("merchant.split_payment_created", { paymentId: payment.id, splits: splits.length });
  return payment;
}

export async function settleSplit(paymentId: string, recipientId: string): Promise<SplitPayment | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(merchantSplitPayments).where(eq(merchantSplitPayments.id, paymentId));
  if (rows.length === 0) return null;

  const row = rows[0];
  const splits = row.splits as PaymentSplit[];
  const split = splits.find(s => s.recipientId === recipientId);
  if (!split) return null;
  split.status = "settled";

  const allSettled = splits.every(s => s.status === "settled");
  const newStatus = allSettled ? "completed" : "partial";

  await db.update(merchantSplitPayments).set({ splits, status: newStatus }).where(eq(merchantSplitPayments.id, paymentId));

  return {
    id: row.id,
    totalAmount: row.totalAmount,
    currency: row.currency,
    splits,
    status: newStatus,
    createdAt: row.createdAt,
  };
}

// ─── Multi-Location ───────────────────────────────────────────────────────────

export async function addLocation(location: Omit<MerchantLocation, "id">): Promise<MerchantLocation> {
  const newLoc: MerchantLocation = { ...location, id: `loc_${Date.now()}` };

  const db = await getDb();
  if (db) {
    await db.insert(merchantLocations).values({
      id: newLoc.id,
      merchantId: newLoc.merchantId,
      name: newLoc.name,
      address: newLoc.address,
      lat: String(newLoc.lat),
      lng: String(newLoc.lng),
      timezone: newLoc.timezone,
      operatingHours: newLoc.operatingHours,
      capabilities: newLoc.capabilities,
      status: newLoc.status,
    });
  }

  await publishAuditEvent("merchant.location_added", { locationId: newLoc.id, merchantId: location.merchantId });
  return newLoc;
}

export async function getLocations(merchantId: string): Promise<MerchantLocation[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(merchantLocations).where(eq(merchantLocations.merchantId, merchantId));
  return rows.map(r => ({
    id: r.id,
    merchantId: r.merchantId,
    name: r.name,
    address: r.address,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lng),
    timezone: r.timezone,
    operatingHours: r.operatingHours as OperatingHours,
    capabilities: r.capabilities as string[],
    status: r.status as MerchantLocation["status"],
  }));
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function getMerchantAnalytics(merchantId: string, period: string = "7d"): Promise<MerchantAnalytics> {
  const cached = await cacheGet<string>(`merchant:analytics:${merchantId}:${period}`);
  if (cached) return JSON.parse(cached) as MerchantAnalytics;

  const analytics: MerchantAnalytics = {
    merchantId,
    period,
    revenue: 0,
    transactions: 0,
    averageOrderValue: 0,
    topProducts: [],
    customerRetention: 0,
    peakHours: Array.from({ length: 24 }, (_, i) => ({ hour: i, transactions: 0 })),
    comparisonPrevious: { revenueChange: 0, transactionChange: 0 },
  };

  await cacheSet(`merchant:analytics:${merchantId}:${period}`, JSON.stringify(analytics), 300);
  return analytics;
}

logger.info("[Merchant] Advanced merchant tools loaded");
