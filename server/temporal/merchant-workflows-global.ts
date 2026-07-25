/**
 * TourismPay Global Merchant Onboarding Workflows
 * Supports all African countries and key international markets.
 * Country-specific KYB documents, tax rules, and regulatory frameworks.
 */
import { startWorkflow, signalWorkflow, getWorkflowStatus } from "../_core/temporal-integration";
import {
  COUNTRIES, calculateTax, getKybDocuments, getSettlementDays,
} from "../_core/global-registry";

export type MerchantType = "hotel" | "restaurant" | "airbnb" | "concert" | "transport" | "nightclub" | "spa" | "retail" | "attraction" | "private_chef" | "tour_operator";

export interface GlobalMerchantOnboardingInput {
  merchantType: MerchantType;
  countryCode: string;           // Country where merchant operates
  businessName: string;
  ownerUserId: number;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  city: string;
  registrationNumber?: string;
  taxId?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankCountryCode?: string;
  settlementCurrency?: string;   // Currency for receiving settlements
  websiteUrl?: string;
  description?: string;
}

// Merchant type configuration per country
interface MerchantTypeConfig {
  platformFeePercent: number;
  settlementDays: number;
  requiredDocuments: string[];
  optionalDocuments: string[];
  minMonthlyVolume?: number;
  maxTransactionAmount?: number;
  requiresLicense: boolean;
  licenseType?: string;
}

function getMerchantConfig(merchantType: MerchantType, countryCode: string): MerchantTypeConfig {
  const country = COUNTRIES[countryCode] ?? COUNTRIES["NG"];
  const baseKybDocs = getKybDocuments(countryCode);

  const configs: Record<MerchantType, Partial<MerchantTypeConfig>> = {
    hotel: {
      platformFeePercent: 3.5,
      requiresLicense: true,
      licenseType: "Hotel/Hospitality License",
      requiredDocuments: [...baseKybDocs, "Hotel/hospitality license", "Fire safety certificate", "Health inspection certificate"],
      optionalDocuments: ["Star rating certificate", "Tourism board registration"],
    },
    restaurant: {
      platformFeePercent: 2.5,
      requiresLicense: true,
      licenseType: "Food Service License",
      requiredDocuments: [...baseKybDocs, "Food handler permit", "Health inspection certificate"],
      optionalDocuments: ["NAFDAC registration (NG)", "Halal/Kosher certification"],
    },
    airbnb: {
      platformFeePercent: 5.0,
      requiresLicense: false,
      requiredDocuments: [...baseKybDocs, "Property ownership deed or lease", "Property photos"],
      optionalDocuments: ["Short-stay permit", "Tourism registration"],
    },
    concert: {
      platformFeePercent: 3.0,
      requiresLicense: true,
      licenseType: "Event/Entertainment License",
      requiredDocuments: [...baseKybDocs, "Event permit", "Venue license", "Public liability insurance"],
      optionalDocuments: ["APRA/MCSK music license", "Security plan"],
    },
    transport: {
      platformFeePercent: 4.0,
      requiresLicense: true,
      licenseType: "Transport/Operator License",
      requiredDocuments: [...baseKybDocs, "Transport operator license", "Vehicle registration"],
      optionalDocuments: ["Fleet insurance", "Driver background checks"],
    },
    nightclub: {
      platformFeePercent: 3.5,
      requiresLicense: true,
      licenseType: "Entertainment & Liquor License",
      requiredDocuments: [...baseKybDocs, "Entertainment license", "Liquor license", "Fire safety certificate"],
      optionalDocuments: ["Age verification policy", "Security plan"],
    },
    spa: {
      platformFeePercent: 3.0,
      requiresLicense: true,
      licenseType: "Health/Beauty Services License",
      requiredDocuments: [...baseKybDocs, "Health services license", "Therapist certifications"],
      optionalDocuments: ["International spa certification"],
    },
    retail: {
      platformFeePercent: 2.0,
      requiresLicense: false,
      requiredDocuments: [...baseKybDocs, "Trade license"],
      optionalDocuments: ["Import/export license"],
    },
    attraction: {
      platformFeePercent: 3.0,
      requiresLicense: true,
      licenseType: "Tourism Attraction License",
      requiredDocuments: [...baseKybDocs, "Tourism attraction license", "Public liability insurance"],
      optionalDocuments: ["Tourism board certification"],
    },
    private_chef: {
      platformFeePercent: 4.0,
      requiresLicense: true,
      licenseType: "Food Service License",
      requiredDocuments: [...baseKybDocs, "Food handler permit", "Health certificate"],
      optionalDocuments: ["Culinary certification"],
    },
    tour_operator: {
      platformFeePercent: 4.0,
      requiresLicense: true,
      licenseType: "Tour Operator License",
      requiredDocuments: [...baseKybDocs, "Tour operator license", "Professional indemnity insurance"],
      optionalDocuments: ["IATA accreditation", "Tourism board membership"],
    },
  };

  const typeConfig = configs[merchantType] ?? configs.retail;

  return {
    platformFeePercent: typeConfig.platformFeePercent ?? 3.0,
    settlementDays: getSettlementDays(countryCode, merchantType),
    requiredDocuments: typeConfig.requiredDocuments ?? baseKybDocs,
    optionalDocuments: typeConfig.optionalDocuments ?? [],
    requiresLicense: typeConfig.requiresLicense ?? false,
    licenseType: typeConfig.licenseType,
    maxTransactionAmount: country.amlThreshold,
  };
}

export async function startGlobalMerchantOnboardingWorkflow(
  input: GlobalMerchantOnboardingInput
): Promise<{ workflowId: string; config: MerchantTypeConfig; country: typeof COUNTRIES["NG"] }> {
  const country = COUNTRIES[input.countryCode];
  if (!country) throw new Error(`Unsupported country: ${input.countryCode}`);

  const config = getMerchantConfig(input.merchantType, input.countryCode);
  const workflowId = `merchant-onboard-${input.ownerUserId}-${input.countryCode}-${Date.now()}`;

  await startWorkflow({
    workflowType: "MerchantOnboardingWorkflow",
    workflowId,
    taskQueue: "tourismpay-journeys",
    input: {
      merchantType: input.merchantType,
      countryCode: input.countryCode,
      countryName: country.name,
      currency: input.settlementCurrency ?? country.currency,
      businessName: input.businessName,
      ownerUserId: input.ownerUserId,
      businessEmail: input.businessEmail,
      businessPhone: input.businessPhone,
      businessAddress: input.businessAddress,
      city: input.city,
      registrationNumber: input.registrationNumber,
      taxId: input.taxId,
      bankAccountNumber: input.bankAccountNumber,
      bankName: input.bankName,
      bankCountryCode: input.bankCountryCode ?? input.countryCode,
      websiteUrl: input.websiteUrl,
      description: input.description,
      // Config from global registry
      platformFeePercent: config.platformFeePercent,
      settlementDays: config.settlementDays,
      requiredDocuments: config.requiredDocuments,
      optionalDocuments: config.optionalDocuments,
      requiresLicense: config.requiresLicense,
      licenseType: config.licenseType,
      vatRate: country.vatRate,
      vatName: country.vatName,
      serviceChargeRate: country.serviceChargeRate ?? 0,
      regulatoryBody: country.regulatoryBody,
      amlThreshold: country.amlThreshold,
      timezone: country.timezone,
      paymentMethods: country.paymentMethods,
      languages: country.languages,
    },
    searchAttributes: {
      "merchant-type": input.merchantType,
      "country": input.countryCode,
      "city": input.city,
    },
  });

  return { workflowId, config, country };
}

export async function signalGlobalMerchantDocumentsSubmitted(
  workflowId: string,
  documents: Array<{ type: string; url: string; verified?: boolean }>
): Promise<void> {
  await signalWorkflow(workflowId, "documentsSubmitted", { documents });
}

export async function signalGlobalMerchantKybApproved(
  workflowId: string,
  approvedBy: string,
  notes?: string
): Promise<void> {
  await signalWorkflow(workflowId, "kybApproved", { approvedBy, notes, approvedAt: Date.now() });
}

export async function signalGlobalMerchantKybRejected(
  workflowId: string,
  rejectedBy: string,
  reason: string
): Promise<void> {
  await signalWorkflow(workflowId, "kybRejected", { rejectedBy, reason, rejectedAt: Date.now() });
}

export async function getGlobalMerchantWorkflowStatus(workflowId: string) {
  return getWorkflowStatus(workflowId);
}

// ─── MERCHANT CONFIG QUERY ────────────────────────────────────────────────────

export function getMerchantOnboardingConfig(merchantType: MerchantType, countryCode: string) {
  const country = COUNTRIES[countryCode];
  if (!country) return null;
  const config = getMerchantConfig(merchantType, countryCode);
  return {
    ...config,
    country: {
      code: countryCode,
      name: country.name,
      currency: country.currency,
      vatRate: country.vatRate,
      vatName: country.vatName,
      regulatoryBody: country.regulatoryBody,
      timezone: country.timezone,
    },
  };
}
