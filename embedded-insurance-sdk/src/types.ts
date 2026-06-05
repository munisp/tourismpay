export interface EmbeddedConfig {
  apiKey: string;
  partnerId: string;
  environment: "sandbox" | "production";
  baseUrl?: string;
  webhookUrl?: string;
  theme?: {
    primaryColor?: string;
    fontFamily?: string;
    borderRadius?: string;
  };
}

export interface InsuranceProduct {
  id: string;
  name: string;
  type: "motor" | "life" | "health" | "funeral" | "device" | "travel" | "crop";
  description: string;
  minPremium: number;
  maxCoverage: number;
  currency: string;
  features: string[];
}

export interface QuoteRequest {
  productId: string;
  customerData: {
    name: string;
    phone: string;
    email?: string;
    dateOfBirth?: string;
  };
  coverageData: Record<string, unknown>;
}

export interface Quote {
  id: string;
  productId: string;
  premium: number;
  premiumFrequency: "monthly" | "quarterly" | "annually";
  coverage: number;
  currency: string;
  validUntil: string;
  breakdown: {
    basePremium: number;
    tax: number;
    levy: number;
    discount: number;
    total: number;
  };
}

export interface Policy {
  id: string;
  policyNumber: string;
  productId: string;
  status: "active" | "lapsed" | "cancelled" | "expired";
  premium: number;
  coverage: number;
  startDate: string;
  endDate: string;
  customerName: string;
  certificateUrl?: string;
}

export interface Claim {
  id: string;
  policyId: string;
  claimNumber: string;
  type: string;
  status: "submitted" | "reviewing" | "approved" | "denied" | "paid";
  amount: number;
  description: string;
  createdAt: string;
}

export type PaymentMethod = "mobile_money" | "bank_transfer" | "card" | "ussd";

export interface PaymentRequest {
  quoteId: string;
  method: PaymentMethod;
  mobileNumber?: string;
  provider?: string;
}

export interface WebhookEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  partnerId: string;
}
