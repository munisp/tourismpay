/**
 * Africa GDS SDK — TypeScript client for external applications.
 *
 * Usage:
 *   import { GDSClient } from "@tourismpay/gds-sdk";
 *
 *   const gds = new GDSClient({
 *     baseUrl: "https://gds-api.tourismpay.com",
 *     apiKey: "gds_your_api_key_here",
 *   });
 *
 *   // Search properties
 *   const results = await gds.search({ destination: "Masai Mara", checkIn: "2025-06-01", checkOut: "2025-06-05" });
 *
 *   // Book a property
 *   const booking = await gds.createReservation({ propertyId: "prop_xxx", ... });
 *
 *   // Check commission
 *   const commission = await gds.getCommission();
 */

export interface GDSClientConfig {
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  tenantId?: string;
  timeout?: number;
  sandbox?: boolean;
}

export interface SearchParams {
  destination?: string;
  country?: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  rooms?: number;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  starRating?: number;
  mealPlan?: string;
  sortBy?: "relevance" | "price_asc" | "price_desc" | "rating";
  page?: number;
  pageSize?: number;
  currency?: string;
}

export interface CreateReservationParams {
  propertyId: string;
  roomTypeCode: string;
  ratePlanCode?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms?: number;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestCountry: string;
  specialRequests?: string;
}

export interface AvailabilityCheckParams {
  propertyId: string;
  roomType?: string;
  checkIn: string;
  checkOut: string;
  rooms?: number;
}

export interface AgentRegistrationParams {
  agencyName: string;
  agentName: string;
  email: string;
  phone: string;
  country: string;
  iataCode?: string;
  preferredCurrency?: string;
}

export interface WebhookRegistrationParams {
  url: string;
  events?: string[];
}

export class GDSClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: GDSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.timeout = config.timeout || 30000;
    this.headers = {
      "Content-Type": "application/json",
    };

    if (config.apiKey) {
      this.headers["X-GDS-API-Key"] = config.apiKey;
    }
    if (config.bearerToken) {
      this.headers["Authorization"] = `Bearer ${config.bearerToken}`;
    }
    if (config.tenantId) {
      this.headers["X-GDS-Tenant-ID"] = config.tenantId;
    }
  }

  // --- Health ---

  async health(): Promise<{ status: string; service: string; version: string }> {
    return this.get("/health");
  }

  // --- Search ---

  async search(params: SearchParams): Promise<any> {
    const query = new URLSearchParams();
    if (params.destination) query.set("destination", params.destination);
    if (params.country) query.set("country", params.country);
    query.set("checkIn", params.checkIn);
    query.set("checkOut", params.checkOut);
    if (params.guests) query.set("guests", params.guests.toString());
    if (params.rooms) query.set("rooms", params.rooms.toString());
    if (params.propertyType) query.set("type", params.propertyType);
    if (params.minPrice) query.set("minPrice", params.minPrice.toString());
    if (params.maxPrice) query.set("maxPrice", params.maxPrice.toString());
    if (params.starRating) query.set("starRating", params.starRating.toString());
    if (params.sortBy) query.set("sortBy", params.sortBy);
    if (params.page) query.set("page", params.page.toString());
    if (params.pageSize) query.set("pageSize", params.pageSize.toString());
    if (params.currency) query.set("currency", params.currency);
    return this.get(`/api/v1/gds/search?${query.toString()}`);
  }

  async suggest(query: string, limit?: number): Promise<{ suggestions: string[] }> {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set("limit", limit.toString());
    return this.get(`/api/v1/gds/search/suggest?${params.toString()}`);
  }

  async trending(): Promise<any> {
    return this.get("/api/v1/gds/search/trending");
  }

  // --- Properties ---

  async listProperties(filters?: { country?: string; type?: string; starRating?: number; page?: number }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.country) params.set("country", filters.country);
    if (filters?.type) params.set("type", filters.type);
    if (filters?.starRating) params.set("star_rating", filters.starRating.toString());
    if (filters?.page) params.set("page", filters.page.toString());
    return this.get(`/api/v1/gds/properties?${params.toString()}`);
  }

  async getProperty(id: string): Promise<any> {
    return this.get(`/api/v1/gds/properties/${id}`);
  }

  async registerProperty(property: any): Promise<any> {
    return this.post("/api/v1/gds/properties", property);
  }

  // --- Availability ---

  async checkAvailability(params: AvailabilityCheckParams): Promise<any> {
    const query = new URLSearchParams({
      propertyId: params.propertyId,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
    });
    if (params.roomType) query.set("roomType", params.roomType);
    if (params.rooms) query.set("rooms", params.rooms.toString());
    return this.get(`/api/v1/gds/availability/check?${query.toString()}`);
  }

  async bulkCheckAvailability(properties: AvailabilityCheckParams[]): Promise<any> {
    return this.post("/api/v1/gds/availability/bulk-check", { properties });
  }

  // --- Reservations ---

  async createReservation(params: CreateReservationParams): Promise<any> {
    return this.post("/api/v1/gds/reservations", params);
  }

  async getReservation(id: string): Promise<any> {
    return this.get(`/api/v1/gds/reservations/${id}`);
  }

  async listReservations(filters?: { status?: string; page?: number }): Promise<any> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.page) params.set("page", filters.page.toString());
    return this.get(`/api/v1/gds/reservations?${params.toString()}`);
  }

  async modifyReservation(id: string, changes: any): Promise<any> {
    return this.patch(`/api/v1/gds/reservations/${id}`, changes);
  }

  async cancelReservation(id: string, reason: string): Promise<any> {
    return this.post(`/api/v1/gds/reservations/${id}/cancel`, { reason });
  }

  // --- Agents ---

  async registerAgent(params: AgentRegistrationParams): Promise<any> {
    return this.post("/api/v1/gds/agents/register", params);
  }

  async getAgentProfile(): Promise<any> {
    return this.get("/api/v1/gds/agents/me");
  }

  async getCommission(): Promise<any> {
    return this.get("/api/v1/gds/agents/commission");
  }

  async getCommissionHistory(page?: number): Promise<any> {
    const params = new URLSearchParams();
    if (page) params.set("page", page.toString());
    return this.get(`/api/v1/gds/agents/commission/history?${params.toString()}`);
  }

  async requestPayout(method: string, amount: number, currency: string, destination: string): Promise<any> {
    return this.post("/api/v1/gds/agents/payout", { method, amount, currency, destination });
  }

  // --- Rates ---

  async getRates(propertyId: string, dateFrom?: string, dateTo?: string): Promise<any> {
    const params = new URLSearchParams({ propertyId });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return this.get(`/api/v1/gds/rates?${params.toString()}`);
  }

  async getDynamicPrice(propertyId: string, roomType: string, date: string, baseRate: number): Promise<any> {
    const params = new URLSearchParams({ propertyId, roomType, date, baseRate: baseRate.toString() });
    return this.get(`/api/v1/gds/rates/dynamic?${params.toString()}`);
  }

  // --- Distribution ---

  async registerWebhook(params: WebhookRegistrationParams): Promise<any> {
    return this.post("/api/v1/gds/distribution/webhooks", params);
  }

  async listWebhooks(): Promise<any> {
    return this.get("/api/v1/gds/distribution/webhooks");
  }

  async getDistributionStats(): Promise<any> {
    return this.get("/api/v1/gds/distribution/stats");
  }

  // --- Analytics ---

  async getBookingMetrics(period?: string): Promise<any> {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    return this.get(`/api/v1/gds/analytics/bookings?${params.toString()}`);
  }

  async getMarketIntelligence(destination: string, country: string): Promise<any> {
    const params = new URLSearchParams({ destination, country });
    return this.get(`/api/v1/gds/analytics/market?${params.toString()}`);
  }

  async getDemandForecast(destination: string, date: string): Promise<any> {
    const params = new URLSearchParams({ destination, date });
    return this.get(`/api/v1/gds/analytics/forecast/demand?${params.toString()}`);
  }

  // --- HTTP Methods ---

  private async get(path: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw new GDSError(response.status, await response.text());
    return response.json();
  }

  private async post(path: string, body: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw new GDSError(response.status, await response.text());
    return response.json();
  }

  private async patch(path: string, body: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw new GDSError(response.status, await response.text());
    return response.json();
  }

  private async del(path: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.headers,
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!response.ok) throw new GDSError(response.status, await response.text());
    return response.json();
  }

  // ─── Metering ─────────────────────────────────────────────────

  /** Get current metered token usage. */
  async getMeteredUsage(): Promise<any> { return this.get("/api/v1/gds/metering/usage"); }

  /** Get quota status and remaining tokens. */
  async getQuota(): Promise<any> { return this.get("/api/v1/gds/metering/quota"); }

  /** List available metering plans. */
  async getMeteringPlans(): Promise<any> { return this.get("/api/v1/gds/metering/plans"); }

  /** Get token costs per operation. */
  async getTokenCosts(): Promise<any> { return this.get("/api/v1/gds/metering/costs"); }

  /** Upgrade metering plan. */
  async upgradePlan(plan: string): Promise<any> { return this.post("/api/v1/gds/metering/upgrade", { plan }); }

  /** Purchase additional tokens. */
  async purchaseTokens(amount: number): Promise<any> { return this.post("/api/v1/gds/metering/tokens/purchase", { amount }); }

  /** Get current period invoice. */
  async getInvoice(): Promise<any> { return this.get("/api/v1/gds/metering/invoice"); }

  // ─── Sandbox ──────────────────────────────────────────────────

  /** Create a sandbox API key. */
  async createSandboxKey(name: string, role: string = "agent"): Promise<any> { return this.post("/api/v1/gds/sandbox/keys", { name, role }); }

  /** List sandbox API keys. */
  async listSandboxKeys(): Promise<any> { return this.get("/api/v1/gds/sandbox/keys"); }

  /** Revoke a sandbox API key. */
  async revokeSandboxKey(id: string): Promise<any> { return this.del(`/api/v1/gds/sandbox/keys/${id}`); }

  /** Get all sandbox mock data. */
  async getSandboxData(): Promise<any> { return this.get("/api/v1/gds/sandbox/data"); }

  /** Get sandbox properties. */
  async getSandboxProperties(country?: string, type?: string): Promise<any> {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (type) params.set("type", type);
    const qs = params.toString();
    return this.get(`/api/v1/gds/sandbox/data/properties${qs ? `?${qs}` : ""}`);
  }

  /** Reset sandbox to initial state. */
  async resetSandbox(): Promise<any> { return this.post("/api/v1/gds/sandbox/reset", {}); }

  /** Get sandbox test card numbers. */
  async getTestCards(): Promise<any> { return this.get("/api/v1/gds/sandbox/test-cards"); }

  /** Test webhook delivery. */
  async testWebhook(url: string, event: string = "reservation.created"): Promise<any> {
    return this.post("/api/v1/gds/sandbox/webhooks/test", { url, event });
  }

  /** Get developer quick-start guide. */
  async getSandboxGuide(): Promise<any> { return this.get("/api/v1/gds/sandbox/guide"); }
}

export class GDSError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`GDS API error ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}
