/**
 * API Service — connects to TourismPay backend (tRPC over HTTP)
 */
const API_BASE = __DEV__
  ? "http://localhost:5000/api/trpc"
  : "https://api.tourismpay.com/api/trpc";

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.result?.data ?? json;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Channel Manager API ────────────────────────────────────────────────────

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

export const channelManagerAPI = {
  listChannels: (establishmentId: number, token: string) =>
    request<ChannelStatus[]>("channelManager.listChannels", {
      method: "POST",
      body: { establishmentId },
      token,
    }),

  connect: (data: { establishmentId: number; channel: string; config: ChannelConfig }, token: string) =>
    request<{ success: boolean; channelId: string }>("channelManager.connect", {
      method: "POST",
      body: data,
      token,
    }),

  disconnect: (data: { establishmentId: number; channel: string }, token: string) =>
    request<{ success: boolean }>("channelManager.disconnect", {
      method: "POST",
      body: data,
      token,
    }),

  triggerSync: (data: { establishmentId: number; channel: string }, token: string) =>
    request<{ success: boolean; syncedAt: string }>("channelManager.triggerSync", {
      method: "POST",
      body: data,
      token,
    }),

  inboundBookings: (establishmentId: number, token: string) =>
    request<{ bookings: InboundBooking[]; total: number }>("channelManager.inboundBookings", {
      method: "POST",
      body: { establishmentId, limit: 50 },
      token,
    }),

  mapProduct: (
    data: { establishmentId: number; productId: number; channel: string; roomTypeCode: string; ratePlanCode?: string },
    token: string
  ) =>
    request<{ success: boolean }>("channelManager.mapProduct", {
      method: "POST",
      body: data,
      token,
    }),
};
