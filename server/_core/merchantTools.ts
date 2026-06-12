/**
 * Advanced Merchant Tools (2.5)
 * 
 * Inventory management, dynamic pricing, split payments,
 * multi-location management, and analytics for merchants.
 *
 * Middleware integration: Redis (price cache), Kafka (inventory events),
 * OpenSearch (product catalog), Temporal (settlement workflows).
 */
import { logger } from "./logger";
import { publishAuditEvent } from "./kafka";
import { cacheGet, cacheSet } from "./redis";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  merchantId: string;
  sku: string;
  name: string;
  category: string;
  price: number; // Cents
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
  peakHours?: number[]; // 0-23
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
  customerRetention: number; // Percentage
  peakHours: { hour: number; transactions: number }[];
  comparisonPrevious: { revenueChange: number; transactionChange: number };
}

// ─── In-memory stores ─────────────────────────────────────────────────────────

const inventory: Map<string, InventoryItem> = new Map();
const locations: Map<string, MerchantLocation> = new Map();
const splitPayments: Map<string, SplitPayment> = new Map();

// ─── Inventory Management ─────────────────────────────────────────────────────

export async function addInventoryItem(item: Omit<InventoryItem, "id" | "status" | "createdAt" | "updatedAt">): Promise<InventoryItem> {
  const newItem: InventoryItem = {
    ...item,
    id: `inv_${Date.now()}`,
    status: item.quantity > 0 ? "active" : "out_of_stock",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  inventory.set(newItem.id, newItem);
  await publishAuditEvent("merchant.inventory_added", { itemId: newItem.id, merchantId: item.merchantId });
  return newItem;
}

export async function updateStock(itemId: string, quantityChange: number): Promise<InventoryItem | null> {
  const item = inventory.get(itemId);
  if (!item) return null;

  item.quantity = Math.max(0, item.quantity + quantityChange);
  item.updatedAt = new Date().toISOString();
  item.status = item.quantity > 0 ? "active" : "out_of_stock";

  if (item.quantity <= item.lowStockThreshold && item.quantity > 0) {
    await publishAuditEvent("merchant.low_stock_alert", { itemId, quantity: item.quantity, threshold: item.lowStockThreshold });
  }

  return item;
}

export function getInventory(merchantId: string): InventoryItem[] {
  return Array.from(inventory.values()).filter(i => i.merchantId === merchantId);
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
  // Validate splits sum to total
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

  splitPayments.set(payment.id, payment);
  await publishAuditEvent("merchant.split_payment_created", { paymentId: payment.id, splits: splits.length });
  return payment;
}

export async function settleSplit(paymentId: string, recipientId: string): Promise<SplitPayment | null> {
  const payment = splitPayments.get(paymentId);
  if (!payment) return null;

  const split = payment.splits.find(s => s.recipientId === recipientId);
  if (!split) return null;
  split.status = "settled";

  const allSettled = payment.splits.every(s => s.status === "settled");
  payment.status = allSettled ? "completed" : "partial";

  return payment;
}

// ─── Multi-Location ───────────────────────────────────────────────────────────

export async function addLocation(location: Omit<MerchantLocation, "id">): Promise<MerchantLocation> {
  const newLoc: MerchantLocation = { ...location, id: `loc_${Date.now()}` };
  locations.set(newLoc.id, newLoc);
  await publishAuditEvent("merchant.location_added", { locationId: newLoc.id, merchantId: location.merchantId });
  return newLoc;
}

export function getLocations(merchantId: string): MerchantLocation[] {
  return Array.from(locations.values()).filter(l => l.merchantId === merchantId);
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
