/**
 * Unleash Feature Flags — TypeScript SDK Integration
 * Used by Node.js services and React/React Native frontends
 */

import { UnleashClient } from 'unleash-proxy-client';

// ============================================================
// Feature Flag Definitions
// ============================================================
export enum FeatureFlag {
  // Claims
  CLAIMS_AI_FRAUD_DETECTION = 'claims.ai-fraud-detection',
  CLAIMS_AUTO_APPROVAL = 'claims.auto-approval',
  CLAIMS_DOCUMENT_OCR = 'claims.document-ocr',
  CLAIMS_REAL_TIME_STATUS = 'claims.real-time-status',

  // Underwriting
  UNDERWRITING_ML_RISK_SCORING = 'underwriting.ml-risk-scoring',
  UNDERWRITING_REAL_TIME_PRICING = 'underwriting.real-time-pricing',
  UNDERWRITING_PARAMETRIC_TRIGGERS = 'underwriting.parametric-triggers',

  // Payments
  PAYMENTS_MOBILE_MONEY = 'payments.mobile-money',
  PAYMENTS_CRYPTO = 'payments.crypto',
  PAYMENTS_BNPL = 'payments.buy-now-pay-later',
  PAYMENTS_INSTANT_SETTLEMENT = 'payments.instant-settlement',
  PAYMENTS_MULTI_CURRENCY = 'payments.multi-currency',

  // Customer Experience
  CUSTOMER_AI_CHATBOT = 'customer.ai-chatbot',
  CUSTOMER_SELF_SERVICE_PORTAL = 'customer.self-service-portal',
  CUSTOMER_POLICY_COMPARISON = 'customer.policy-comparison',
  CUSTOMER_DIGITAL_ONBOARDING = 'customer.digital-onboarding',
  CUSTOMER_BIOMETRIC_AUTH = 'customer.biometric-auth',

  // Analytics
  ANALYTICS_REAL_TIME_DASHBOARD = 'analytics.real-time-dashboard',
  ANALYTICS_PREDICTIVE_CHURN = 'analytics.predictive-churn',
  ANALYTICS_GEOSPATIAL = 'analytics.geospatial',

  // Infrastructure
  INFRA_MAINTENANCE_MODE = 'infra.maintenance-mode',
  INFRA_READ_ONLY_MODE = 'infra.read-only-mode',
  INFRA_DARK_LAUNCH_V2_API = 'infra.dark-launch-v2-api',

  // Compliance
  COMPLIANCE_GDPR_STRICT_MODE = 'compliance.gdpr-strict-mode',
  COMPLIANCE_NDPR_ENFORCEMENT = 'compliance.ndpr-enforcement',
  COMPLIANCE_PII_MASKING_ENHANCED = 'compliance.pii-masking-enhanced',

  // Mobile
  MOBILE_BIOMETRIC_CLAIM_SUBMISSION = 'mobile.biometric-claim-submission',
  MOBILE_OFFLINE_MODE = 'mobile.offline-mode',
  MOBILE_PUSH_NOTIFICATIONS_V2 = 'mobile.push-notifications-v2',
  MOBILE_AR_DAMAGE_ASSESSMENT = 'mobile.ar-damage-assessment',
}

// ============================================================
// Context
// ============================================================
export interface FlagContext {
  userId?: string;
  sessionId?: string;
  properties?: {
    region?: string;
    plan_tier?: 'basic' | 'standard' | 'premium' | 'enterprise';
    policy_type?: string;
    role?: string;
    [key: string]: string | undefined;
  };
}

// ============================================================
// Client Configuration
// ============================================================
const UNLEASH_URL =
  process.env.UNLEASH_URL ||
  'http://unleash-edge.unleash.svc.cluster.local:3063/api';

const UNLEASH_CLIENT_KEY =
  process.env.UNLEASH_CLIENT_KEY || 'default:production.unleash-insecure-api-token';

let _client: UnleashClient | null = null;

export function getUnleashClient(): UnleashClient {
  if (!_client) {
    _client = new UnleashClient({
      url: UNLEASH_URL,
      clientKey: UNLEASH_CLIENT_KEY,
      appName: process.env.SERVICE_NAME || 'insurance-service',
      environment: process.env.ENVIRONMENT || 'production',
      refreshInterval: 15,
      metricsInterval: 60,
    });

    _client.on('error', (err: Error) => {
      console.warn('[Unleash] Client error:', err.message);
    });

    _client.on('ready', () => {
      console.info('[Unleash] Client ready');
    });

    _client.start();
  }
  return _client;
}

// ============================================================
// Flag Evaluation
// ============================================================
export function isEnabled(
  flag: FeatureFlag,
  context?: FlagContext,
  fallback = false,
): boolean {
  try {
    const client = getUnleashClient();

    if (context?.userId) {
      client.updateContext({ userId: context.userId, properties: context.properties });
    }

    return client.isEnabled(flag, undefined, fallback);
  } catch (err) {
    console.warn(`[Unleash] Flag evaluation failed for ${flag}:`, err);
    return fallback;
  }
}

export function getVariant(
  flag: FeatureFlag,
  context?: FlagContext,
): { name: string; enabled: boolean; payload?: { type: string; value: string } } {
  try {
    const client = getUnleashClient();

    if (context?.userId) {
      client.updateContext({ userId: context.userId, properties: context.properties });
    }

    return client.getVariant(flag);
  } catch (err) {
    console.warn(`[Unleash] Variant evaluation failed for ${flag}:`, err);
    return { name: 'disabled', enabled: false };
  }
}

// ============================================================
// React Hook (for React / React Native)
// ============================================================
export function useFeatureFlag(flag: FeatureFlag, context?: FlagContext): boolean {
  // This is a simplified hook — in production use @unleash/proxy-client-react
  // which provides real-time updates via the FlagProvider context
  return isEnabled(flag, context, false);
}

export function useFeatureFlags(
  flags: FeatureFlag[],
  context?: FlagContext,
): Record<string, boolean> {
  return flags.reduce(
    (acc, flag) => {
      acc[flag] = isEnabled(flag, context, false);
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

// ============================================================
// Middleware for Express/Fastify
// ============================================================
export function featureFlagMiddleware(
  flag: FeatureFlag,
  fallback = false,
  getUserId?: (req: any) => string | undefined,
) {
  return (req: any, res: any, next: () => void) => {
    const userId = getUserId ? getUserId(req) : req.user?.id;
    const context: FlagContext = { userId };

    if (isEnabled(flag, context, fallback)) {
      next();
    } else {
      res.status(404).json({
        error: 'Feature not available',
        flag: flag,
      });
    }
  };
}

export function killSwitchMiddleware(flag: FeatureFlag) {
  return (req: any, res: any, next: () => void) => {
    if (isEnabled(flag, undefined, false)) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'This feature is currently disabled for maintenance.',
      });
    } else {
      next();
    }
  };
}

// ============================================================
// All flags for a user (API response enrichment)
// ============================================================
export function getAllFlagsForUser(
  userId: string,
  properties?: FlagContext['properties'],
): Record<string, boolean> {
  const context: FlagContext = { userId, properties };

  const relevantFlags = [
    FeatureFlag.CLAIMS_AI_FRAUD_DETECTION,
    FeatureFlag.CLAIMS_AUTO_APPROVAL,
    FeatureFlag.CLAIMS_DOCUMENT_OCR,
    FeatureFlag.PAYMENTS_MOBILE_MONEY,
    FeatureFlag.PAYMENTS_CRYPTO,
    FeatureFlag.PAYMENTS_BNPL,
    FeatureFlag.PAYMENTS_MULTI_CURRENCY,
    FeatureFlag.CUSTOMER_AI_CHATBOT,
    FeatureFlag.CUSTOMER_POLICY_COMPARISON,
    FeatureFlag.CUSTOMER_DIGITAL_ONBOARDING,
    FeatureFlag.CUSTOMER_BIOMETRIC_AUTH,
    FeatureFlag.ANALYTICS_REAL_TIME_DASHBOARD,
    FeatureFlag.ANALYTICS_GEOSPATIAL,
    FeatureFlag.MOBILE_BIOMETRIC_CLAIM_SUBMISSION,
    FeatureFlag.MOBILE_OFFLINE_MODE,
    FeatureFlag.MOBILE_AR_DAMAGE_ASSESSMENT,
    FeatureFlag.MOBILE_PUSH_NOTIFICATIONS_V2,
  ];

  return relevantFlags.reduce(
    (acc, flag) => {
      acc[flag] = isEnabled(flag, context, false);
      return acc;
    },
    {} as Record<string, boolean>,
  );
}
