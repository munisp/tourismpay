/**
 * API Service — comprehensive tRPC client for all TourismPay backend endpoints.
 * Supports authentication, retry logic, and offline queue integration.
 */
import { secureStorage } from "./secureStorage";

declare const __DEV__: boolean;

const API_BASE = __DEV__
  ? "http://localhost:5000/api/trpc"
  : "https://api.tourismpay.com/api/trpc";

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
  timeout?: number;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, timeout = 15000 } = opts;
  let token = opts.token;
  if (!token) token = (await secureStorage.getToken()) ?? undefined;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const url = method === "GET" && body
      ? `${API_BASE}/${path}?input=${encodeURIComponent(JSON.stringify(body))}`
      : `${API_BASE}/${path}`;

    const res = await fetch(url, {
      method,
      headers,
      body: method === "POST" ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (refreshed) return request(path, { ...opts, token: refreshed });
      throw new Error("SESSION_EXPIRED");
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const json: any = await res.json();
    return json.result?.data ?? json;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshToken(): Promise<string | null> {
  const refresh = await secureStorage.getRefreshToken();
  if (!refresh) return null;

  try {
    const res = await fetch(`${API_BASE}/auth.refreshToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });

    if (!res.ok) return null;
    const { token, refreshToken: newRefresh } = (await res.json()) as { token: string; refreshToken?: string };
    await secureStorage.setToken(token);
    if (newRefresh) await secureStorage.setRefreshToken(newRefresh);
    return token;
  } catch {
    return null;
  }
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (email: string, password: string) =>
    request<{ token: string; refreshToken: string; user: UserProfile }>("auth.login", {
      method: "POST",
      body: { email, password },
    }),

  register: (data: { name: string; email: string; password: string; role: string }) =>
    request<{ token: string; user: UserProfile }>("auth.register", {
      method: "POST",
      body: data,
    }),

  logout: () => request<void>("auth.logout", { method: "POST" }),

  getProfile: () => request<UserProfile>("auth.getProfile"),

  updateProfile: (data: Partial<UserProfile>) =>
    request<UserProfile>("auth.updateProfile", { method: "POST", body: data }),
};

// ─── Wallet API ──────────────────────────────────────────────────────────────

export const walletAPI = {
  getBalances: () => request<WalletBalance[]>("wallet.getBalances"),

  send: (data: { to: string; amount: number; currency: string; note?: string; idempotencyKey: string }) =>
    request<Transaction>("wallet.send", { method: "POST", body: data }),

  swap: (data: { fromCurrency: string; toCurrency: string; amount: number; idempotencyKey: string }) =>
    request<{ txId: string; rate: number; received: number }>("wallet.swap", { method: "POST", body: data }),

  getTransactions: (params?: { limit?: number; offset?: number; currency?: string }) =>
    request<{ transactions: Transaction[]; total: number }>("wallet.getTransactions", {
      method: "POST",
      body: params ?? { limit: 50 },
    }),

  getFxRate: (from: string, to: string) =>
    request<{ rate: number; timestamp: number }>("wallet.getFxRate", {
      method: "POST",
      body: { from, to },
    }),

  topUp: (data: { amount: number; currency: string; method: string }) =>
    request<{ paymentUrl: string; txId: string }>("wallet.topUp", { method: "POST", body: data }),

  getSpendingLimits: () => request<SpendingLimits>("wallet.getSpendingLimits"),
};

// ─── Merchant API ────────────────────────────────────────────────────────────

export const merchantAPI = {
  getDashboardStats: () =>
    request<MerchantStats>("merchant.getDashboardStats"),

  getRevenue: (period: "day" | "week" | "month" | "year") =>
    request<RevenueData>("merchantRevenue.getRevenue", { method: "POST", body: { period } }),

  getProducts: () => request<Product[]>("merchantProducts.getProducts"),

  createProduct: (data: Partial<Product>) =>
    request<Product>("merchantProducts.createProduct", { method: "POST", body: data }),

  updateProduct: (id: number, data: Partial<Product>) =>
    request<Product>("merchantProducts.updateProduct", { method: "POST", body: { id, ...data } }),

  getBookings: (params?: { status?: string; limit?: number }) =>
    request<{ bookings: Booking[]; total: number }>("bookings.getBookings", {
      method: "POST",
      body: params ?? { limit: 50 },
    }),

  getQRCodes: () => request<QRCode[]>("qrPayment.getQRCodes"),

  generateQR: (data: { amount: number; currency: string; description?: string }) =>
    request<QRCode>("qrPayment.generateQR", { method: "POST", body: data }),

  getPayouts: () => request<Payout[]>("merchant.getPayouts"),

  getStaff: () => request<StaffMember[]>("merchant.getStaff"),

  getAvailability: () => request<AvailabilitySlot[]>("merchant.getAvailability"),

  updateAvailability: (slots: AvailabilitySlot[]) =>
    request<void>("merchant.updateAvailability", { method: "POST", body: { slots } }),

  getKPIs: () => request<KPIData>("merchant.getKPIs"),

  getDeals: () => request<Deal[]>("merchant.getDeals"),
};

// ─── Tourist API ─────────────────────────────────────────────────────────────

export const touristAPI = {
  discoverExperiences: (params?: { category?: string; location?: string; limit?: number }) =>
    request<Experience[]>("tourist.discover", { method: "POST", body: params ?? {} }),

  getEstablishments: (params?: { category?: string; lat?: number; lng?: number; radius?: number }) =>
    request<Establishment[]>("tourist.getEstablishments", { method: "POST", body: params ?? {} }),

  getEstablishmentDetail: (id: number) =>
    request<Establishment>("tourist.getEstablishmentDetail", { method: "POST", body: { id } }),

  createBooking: (data: { establishmentId: number; productId: number; date: string; guests: number }) =>
    request<Booking>("bookings.create", { method: "POST", body: data }),

  getItinerary: () => request<ItineraryItem[]>("tourist.getItinerary"),

  addToItinerary: (item: Partial<ItineraryItem>) =>
    request<ItineraryItem>("tourist.addToItinerary", { method: "POST", body: item }),

  getTripSummary: (shareToken?: string) =>
    request<TripSummary>("tourist.getTripSummary", { method: "POST", body: { shareToken } }),

  searchDestinations: (query: string) =>
    request<SearchResult[]>("tourist.search", { method: "POST", body: { query } }),
};

// ─── Channel Manager API ─────────────────────────────────────────────────────

export const channelManagerAPI = {
  listChannels: (establishmentId: number) =>
    request<ChannelStatus[]>("channelManager.listChannels", {
      method: "POST",
      body: { establishmentId },
    }),

  connect: (data: { establishmentId: number; channel: string; config: ChannelConfig }) =>
    request<{ success: boolean; channelId: string }>("channelManager.connect", {
      method: "POST",
      body: data,
    }),

  disconnect: (data: { establishmentId: number; channel: string }) =>
    request<{ success: boolean }>("channelManager.disconnect", { method: "POST", body: data }),

  triggerSync: (data: { establishmentId: number; channel: string }) =>
    request<{ success: boolean; syncedAt: string }>("channelManager.triggerSync", {
      method: "POST",
      body: data,
    }),

  inboundBookings: (establishmentId: number) =>
    request<{ bookings: InboundBooking[]; total: number }>("channelManager.inboundBookings", {
      method: "POST",
      body: { establishmentId, limit: 50 },
    }),

  mapProduct: (data: { establishmentId: number; productId: number; channel: string; roomTypeCode: string }) =>
    request<{ success: boolean }>("channelManager.mapProduct", { method: "POST", body: data }),

  getRateParity: (establishmentId: number) =>
    request<RateParityData[]>("channelManager.getRateParity", {
      method: "POST",
      body: { establishmentId },
    }),
};

// ─── Admin API ───────────────────────────────────────────────────────────────

export const adminAPI = {
  getKYBApplications: (params?: { status?: string }) =>
    request<KYBApplication[]>("admin.getKYBApplications", { method: "POST", body: params ?? {} }),

  approveKYB: (applicationId: number) =>
    request<void>("admin.approveKYB", { method: "POST", body: { applicationId } }),

  rejectKYB: (applicationId: number, reason: string) =>
    request<void>("admin.rejectKYB", { method: "POST", body: { applicationId, reason } }),

  getUsers: (params?: { role?: string; limit?: number }) =>
    request<{ users: UserProfile[]; total: number }>("admin.getUsers", { method: "POST", body: params ?? {} }),

  getAuditLog: (params?: { limit?: number; action?: string }) =>
    request<AuditEntry[]>("admin.getAuditLog", { method: "POST", body: params ?? { limit: 100 } }),

  getBISDashboard: () => request<BISDashboardData>("bis.getDashboard"),

  getServiceHealth: () => request<ServiceHealthData[]>("admin.getServiceHealth"),

  getExchangeRates: () => request<ExchangeRateData[]>("admin.getExchangeRates"),

  getFinanceOverview: () => request<FinanceOverview>("admin.getFinanceOverview"),

  killSwitch: (data: { entityType: string; entityId: string; reason: string }) =>
    request<void>("admin.killSwitch", { method: "POST", body: data }),
};

// ─── Loyalty API ─────────────────────────────────────────────────────────────

export const loyaltyAPI = {
  getPoints: () => request<LoyaltyPoints>("loyalty.getPoints"),

  getTier: () => request<LoyaltyTier>("loyalty.getTier"),

  getRewards: () => request<Reward[]>("loyalty.getRewards"),

  redeemReward: (rewardId: number) =>
    request<{ success: boolean; pointsSpent: number }>("loyalty.redeem", {
      method: "POST",
      body: { rewardId },
    }),

  getReferralCode: () => request<{ code: string; uses: number }>("loyalty.getReferralCode"),
};

// ─── Payment Switch API ──────────────────────────────────────────────────────

export const paymentSwitchAPI = {
  getDashboard: () => request<PSSummary>("paymentSwitch.getDashboard"),

  getGatewayStatus: () => request<GatewayStatus[]>("paymentSwitch.getGatewayStatus"),

  getRemittances: () => request<Remittance[]>("paymentSwitch.getRemittances"),

  getRateAlerts: () => request<RateAlert[]>("paymentSwitch.getRateAlerts"),

  getSettlements: () => request<Settlement[]>("paymentSwitch.getSettlements"),

  getNOCMetrics: () => request<NOCMetrics>("paymentSwitch.getNOCMetrics"),
};

// ─── Notifications API ───────────────────────────────────────────────────────

export const notificationsAPI = {
  getAll: (params?: { limit?: number; unreadOnly?: boolean }) =>
    request<AppNotification[]>("notifications.getAll", { method: "POST", body: params ?? { limit: 50 } }),

  markRead: (id: string) =>
    request<void>("notifications.markRead", { method: "POST", body: { id } }),

  markAllRead: () => request<void>("notifications.markAllRead", { method: "POST" }),

  getUnreadCount: () => request<{ count: number }>("notifications.getUnreadCount"),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: "merchant" | "tourist" | "admin";
  establishmentId?: number;
  avatar?: string;
  phone?: string;
  kycLevel?: number;
  createdAt: string;
}

export interface WalletBalance {
  currency: string;
  symbol: string;
  amount: number;
  flag: string;
  availableBalance: number;
  pendingBalance: number;
}

export interface Transaction {
  id: string;
  type: "send" | "receive" | "swap" | "topup" | "payment" | "refund";
  amount: number;
  currency: string;
  counterparty: string;
  note?: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
}

export interface SpendingLimits {
  daily: { used: number; limit: number };
  monthly: { used: number; limit: number };
  singleTx: number;
}

export interface MerchantStats {
  todayRevenue: number;
  todayTransactions: number;
  activeBookings: number;
  channelSync: number;
  revenueChange: number;
  currency: string;
}

export interface RevenueData {
  total: number;
  currency: string;
  dataPoints: { date: string; amount: number }[];
  breakdown: { category: string; amount: number }[];
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  quantity: number;
  imageUrl?: string;
  active: boolean;
}

export interface Booking {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  totalAmount: number;
  currency: string;
  guests: number;
  source: string;
}

export interface QRCode {
  id: string;
  amount: number;
  currency: string;
  description?: string;
  qrData: string;
  status: "active" | "used" | "expired";
  createdAt: string;
}

export interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed";
  scheduledDate: string;
  method: string;
}

export interface StaffMember {
  id: number;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  lastActive: string;
}

export interface AvailabilitySlot {
  date: string;
  available: boolean;
  capacity: number;
  booked: number;
}

export interface KPIData {
  occupancy: number;
  revpar: number;
  adr: number;
  guestSatisfaction: number;
  repeatRate: number;
}

export interface Deal {
  id: number;
  title: string;
  discount: number;
  validUntil: string;
  redemptions: number;
  revenue: number;
}

export interface Experience {
  id: number;
  name: string;
  category: string;
  price: number;
  currency: string;
  rating: number;
  reviewCount: number;
  location: string;
  imageUrl?: string;
  lat?: number;
  lng?: number;
}

export interface Establishment {
  id: number;
  name: string;
  category: string;
  description: string;
  location: string;
  lat: number;
  lng: number;
  rating: number;
  priceRange: string;
  imageUrl?: string;
  amenities: string[];
}

export interface ItineraryItem {
  id: string;
  day: number;
  time: string;
  activity: string;
  location: string;
  cost: number;
  currency: string;
  booked: boolean;
}

export interface TripSummary {
  totalDays: number;
  totalCost: number;
  currency: string;
  destinations: string[];
  activities: number;
  shareToken: string;
}

export interface SearchResult {
  id: number;
  name: string;
  type: "establishment" | "experience" | "destination";
  location: string;
  rating?: number;
}

export interface ChannelStatus {
  name: string;
  displayName: string;
  connected: boolean;
  status: string;
  lastSyncAt: string | null;
  connectedAt?: string | null;
}

export interface ChannelConfig {
  apiKey: string;
  apiSecret: string;
  propertyId?: string;
  environment: "sandbox" | "production";
}

export interface InboundBooking {
  id: string;
  channelName: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  partySize: number;
  totalPrice: number;
  currency: string;
  status: string;
  receivedAt: string;
}

export interface RateParityData {
  channel: string;
  yourRate: number;
  channelRate: number;
  parity: boolean;
  difference: number;
}

export interface KYBApplication {
  id: number;
  businessName: string;
  applicantName: string;
  status: "pending" | "approved" | "rejected" | "under_review";
  submittedAt: string;
  type: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  details?: string;
}

export interface BISDashboardData {
  openInvestigations: number;
  completedThisMonth: number;
  averageDuration: number;
  riskBreakdown: { level: string; count: number }[];
}

export interface ServiceHealthData {
  service: string;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  uptime: number;
  lastCheck: string;
}

export interface ExchangeRateData {
  pair: string;
  rate: number;
  change24h: number;
  lastUpdate: string;
}

export interface FinanceOverview {
  totalVolume: number;
  totalFees: number;
  currency: string;
  activeWallets: number;
  pendingSettlements: number;
}

export interface LoyaltyPoints {
  balance: number;
  lifetime: number;
  pendingPoints: number;
  expiringPoints: number;
  expiryDate?: string;
}

export interface LoyaltyTier {
  current: "bronze" | "silver" | "gold" | "platinum";
  pointsToNext: number;
  benefits: string[];
}

export interface Reward {
  id: number;
  name: string;
  description: string;
  pointsCost: number;
  category: string;
  available: boolean;
  imageUrl?: string;
}

export interface PSSummary {
  totalVolume24h: number;
  activeGateways: number;
  pendingSettlements: number;
  failureRate: number;
}

export interface GatewayStatus {
  name: string;
  status: "active" | "degraded" | "down";
  volume24h: number;
  successRate: number;
}

export interface Remittance {
  id: string;
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  status: string;
  createdAt: string;
  recipient: string;
}

export interface RateAlert {
  id: string;
  pair: string;
  targetRate: number;
  currentRate: number;
  direction: "above" | "below";
  triggered: boolean;
}

export interface Settlement {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed";
  scheduledDate: string;
  merchantName: string;
}

export interface NOCMetrics {
  activeAlerts: number;
  responseTime: number;
  uptime: number;
  slaBreaches: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
}
