export interface Policy {
  id: string;
  policyNumber: string;
  type: 'Motor' | 'Health' | 'Property' | 'Life' | 'Marine' | 'Travel' | 'Agricultural' | 'Business';
  provider: string;
  status: 'active' | 'expired' | 'pending' | 'cancelled';
  premiumAmount: number;
  coverageAmount: number;
  deductible: number;
  startDate: string;
  endDate: string;
  coverageItems: Array<{ name: string; limit: number }>;
}

export interface Claim {
  id: string;
  policyId: string;
  policyNumber: string;
  type: string;
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'paid';
  amount: number;
  description: string;
  filedAt: string;
  resolvedAt?: string;
  evidence: string[];
}

export interface Agent {
  id: string;
  name: string;
  phone: string;
  email: string;
  specialty: string;
  location: { lat: number; lng: number };
  distance?: number;
  rating: number;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: 'customer' | 'agent' | 'admin';
  kycVerified: boolean;
  profileImage?: string;
}

export interface SyncQueueItem {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
}
