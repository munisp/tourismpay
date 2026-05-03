/**
 * TourismPay API Client for React Native
 * Connects to the same tRPC backend as the PWA and Flutter apps.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const API_BASE = __DEV__
  ? "http://localhost:3000"
  : "https://api.tourismpay.com";

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private token: string | null = null;

  async init(): Promise<void> {
    this.token = await AsyncStorage.getItem("auth_token");
  }

  private async request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {} } = options;
    const url = `${API_BASE}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Platform": "react-native",
      ...headers,
    };

    if (this.token) {
      requestHeaders["Authorization"] = `Bearer ${this.token}`;
    }

    const csrfToken = await AsyncStorage.getItem("csrf_token");
    if (csrfToken && method !== "GET") {
      requestHeaders["X-CSRF-Token"] = csrfToken;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new ApiError(response.status, errorBody);
    }

    return response.json();
  }

  async login(role: string): Promise<{ token: string; user: User }> {
    const result = await this.request<{ token: string; user: User }>(
      `/api/demo-login?role=${role}`,
      { method: "POST" }
    );
    this.token = result.token;
    await AsyncStorage.setItem("auth_token", result.token);
    return result;
  }

  async logout(): Promise<void> {
    this.token = null;
    await AsyncStorage.removeItem("auth_token");
  }

  // Tourist endpoints
  async getWallet() { return this.request<WalletData>("/api/trpc/wallet.getBalance"); }
  async getItineraries() { return this.request<Itinerary[]>("/api/trpc/itinerary.list"); }
  async createItinerary(data: CreateItineraryInput) {
    return this.request<Itinerary>("/api/trpc/itinerary.create", { method: "POST", body: data });
  }
  async getLoyaltyPoints() { return this.request<LoyaltyData>("/api/trpc/loyalty.getPoints"); }
  async getTouristExperiences() { return this.request<Experience[]>("/api/trpc/touristPortal.listExperiences"); }
  async sendPayment(data: PaymentInput) {
    return this.request<PaymentResult>("/api/trpc/wallet.send", { method: "POST", body: data });
  }
  async getExchangeRates() { return this.request<ExchangeRate[]>("/api/trpc/exchangeRates.list"); }
  async getCopilotResponse(message: string) {
    return this.request<CopilotResponse>("/api/trpc/copilot.chat", { method: "POST", body: { message } });
  }

  // Merchant endpoints
  async getMerchantRevenue() { return this.request<RevenueData>("/api/trpc/merchantRevenue.getSummary"); }
  async getMerchantProducts() { return this.request<Product[]>("/api/trpc/merchantProducts.list"); }
  async createProduct(data: CreateProductInput) {
    return this.request<Product>("/api/trpc/merchantProducts.create", { method: "POST", body: data });
  }
  async getMerchantBookings() { return this.request<Booking[]>("/api/trpc/merchantBookings.list"); }
  async getMerchantQRCodes() { return this.request<QRCode[]>("/api/trpc/qrPayment.listCodes"); }
  async generateQRCode(data: QRCodeInput) {
    return this.request<QRCode>("/api/trpc/qrPayment.generate", { method: "POST", body: data });
  }
  async getMerchantStaff() { return this.request<StaffMember[]>("/api/trpc/staffInvites.list"); }
  async getPayoutHistory() { return this.request<Payout[]>("/api/trpc/payoutSchedule.list"); }

  // Admin endpoints
  async getUsers() { return this.request<AdminUser[]>("/api/trpc/usersAdmin.list"); }
  async getAuditLogs() { return this.request<AuditLog[]>("/api/trpc/auditLogs.list"); }
  async getKybApplications() { return this.request<KybApplication[]>("/api/trpc/kybApplications.list"); }
  async getServiceHealth() { return this.request<ServiceHealthData>("/api/trpc/serviceProxy.serviceHealth"); }
  async getMiddlewareHealth() { return this.request<MiddlewareHealthData>("/api/trpc/middlewareHub.healthCheck"); }
  async getSettlementData() { return this.request<SettlementData>("/api/trpc/settlement.getSummary"); }
  async getComplianceData() { return this.request<ComplianceData>("/api/trpc/kyb.getComplianceMetrics"); }

  // Offline queue
  async syncOfflineQueue(queue: OfflineAction[]) {
    return this.request<SyncResult>("/api/trpc/offlineResilience.sync", {
      method: "POST",
      body: { actions: queue },
    });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export const api = new ApiClient();

// Type definitions
export interface User {
  id: number;
  username: string;
  role: string;
  onboardingCompleted: boolean;
}

export interface WalletData {
  balances: { currency: string; amount: number; symbol: string }[];
  totalUSD: number;
}

export interface Itinerary {
  id: number;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  activities: Activity[];
}

export interface Activity {
  id: number;
  name: string;
  time: string;
  location: string;
  cost: number;
  currency: string;
}

export interface CreateItineraryInput {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export interface LoyaltyData {
  points: number;
  tier: string;
  nextTierPoints: number;
  history: LoyaltyTransaction[];
}

export interface LoyaltyTransaction {
  id: number;
  type: string;
  points: number;
  description: string;
  date: string;
}

export interface Experience {
  id: number;
  name: string;
  description: string;
  location: string;
  price: number;
  currency: string;
  rating: number;
  imageUrl: string;
}

export interface PaymentInput {
  recipientId: string;
  amount: number;
  currency: string;
  note?: string;
}

export interface PaymentResult {
  transactionId: string;
  status: string;
  amount: number;
  currency: string;
  fee: number;
}

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  updatedAt: string;
}

export interface CopilotResponse {
  message: string;
  suggestions: string[];
}

export interface RevenueData {
  totalRevenue: number;
  currency: string;
  transactions: number;
  trend: number;
  breakdown: { category: string; amount: number }[];
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  available: boolean;
  imageUrl: string;
}

export interface CreateProductInput {
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
}

export interface Booking {
  id: number;
  customerName: string;
  date: string;
  status: string;
  amount: number;
  currency: string;
  items: string[];
}

export interface QRCode {
  id: number;
  code: string;
  amount: number;
  currency: string;
  createdAt: string;
  scans: number;
}

export interface QRCodeInput {
  amount: number;
  currency: string;
  description?: string;
}

export interface StaffMember {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
}

export interface Payout {
  id: number;
  amount: number;
  currency: string;
  status: string;
  scheduledDate: string;
  completedDate?: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
}

export interface AuditLog {
  id: number;
  action: string;
  userId: number;
  details: string;
  timestamp: string;
  ipAddress: string;
}

export interface KybApplication {
  id: number;
  businessName: string;
  country: string;
  status: string;
  submittedAt: string;
  documents: number;
}

export interface ServiceHealthData {
  services: { name: string; status: string; latency: number }[];
  uptime: number;
}

export interface MiddlewareHealthData {
  services: { name: string; status: string; language: string; port: number }[];
}

export interface SettlementData {
  pending: number;
  completed: number;
  failed: number;
  totalAmount: number;
  currency: string;
}

export interface ComplianceData {
  pendingReviews: number;
  approved: number;
  rejected: number;
  riskScore: number;
}

export interface OfflineAction {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: string[];
}
