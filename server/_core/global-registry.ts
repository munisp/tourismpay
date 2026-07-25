/**
 * TourismPay Global Location Registry
 * Comprehensive registry of all supported countries, cities, currencies,
 * tax rules, payment methods, and regulatory frameworks.
 *
 * Nigeria is the PRIMARY destination hub (all journeys converge here),
 * but the platform supports tourists from ANY origin country and
 * merchants operating across all supported markets.
 */

// ─── CURRENCY DEFINITIONS ────────────────────────────────────────────────────

export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  minAmount: number;
  maxAmount: number;
  isStablecoin?: boolean;
  isCrypto?: boolean;
  paymentRails: string[];
}

export const CURRENCIES: Record<string, CurrencyConfig> = {
  // African Currencies
  NGN: { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2, minAmount: 100, maxAmount: 100_000_000, paymentRails: ["bank_transfer", "ussd", "card", "wallet", "enaira"] },
  GHS: { code: "GHS", name: "Ghanaian Cedi", symbol: "₵", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["bank_transfer", "mobile_money", "card"] },
  KES: { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2, minAmount: 100, maxAmount: 5_000_000, paymentRails: ["bank_transfer", "mpesa", "card"] },
  ZAR: { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2, minAmount: 10, maxAmount: 1_000_000, paymentRails: ["bank_transfer", "card", "eft"] },
  EGP: { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2, minAmount: 10, maxAmount: 5_000_000, paymentRails: ["bank_transfer", "card", "instapay"] },
  MAD: { code: "MAD", name: "Moroccan Dirham", symbol: "MAD", decimals: 2, minAmount: 10, maxAmount: 1_000_000, paymentRails: ["bank_transfer", "card"] },
  TZS: { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", decimals: 0, minAmount: 1000, maxAmount: 100_000_000, paymentRails: ["bank_transfer", "mobile_money", "card"] },
  UGX: { code: "UGX", name: "Ugandan Shilling", symbol: "USh", decimals: 0, minAmount: 1000, maxAmount: 100_000_000, paymentRails: ["bank_transfer", "mobile_money"] },
  ETB: { code: "ETB", name: "Ethiopian Birr", symbol: "Br", decimals: 2, minAmount: 10, maxAmount: 1_000_000, paymentRails: ["bank_transfer", "card"] },
  XOF: { code: "XOF", name: "West African CFA Franc", symbol: "CFA", decimals: 0, minAmount: 500, maxAmount: 50_000_000, paymentRails: ["bank_transfer", "mobile_money", "card"] },
  XAF: { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA", decimals: 0, minAmount: 500, maxAmount: 50_000_000, paymentRails: ["bank_transfer", "mobile_money", "card"] },
  RWF: { code: "RWF", name: "Rwandan Franc", symbol: "FRw", decimals: 0, minAmount: 1000, maxAmount: 100_000_000, paymentRails: ["bank_transfer", "mobile_money", "momo"] },
  MZN: { code: "MZN", name: "Mozambican Metical", symbol: "MT", decimals: 2, minAmount: 10, maxAmount: 1_000_000, paymentRails: ["bank_transfer", "mpesa"] },
  ZMW: { code: "ZMW", name: "Zambian Kwacha", symbol: "ZK", decimals: 2, minAmount: 10, maxAmount: 500_000, paymentRails: ["bank_transfer", "mobile_money"] },
  BWP: { code: "BWP", name: "Botswana Pula", symbol: "P", decimals: 2, minAmount: 5, maxAmount: 500_000, paymentRails: ["bank_transfer", "card"] },
  NAD: { code: "NAD", name: "Namibian Dollar", symbol: "N$", decimals: 2, minAmount: 5, maxAmount: 500_000, paymentRails: ["bank_transfer", "card"] },
  MUR: { code: "MUR", name: "Mauritian Rupee", symbol: "Rs", decimals: 2, minAmount: 50, maxAmount: 5_000_000, paymentRails: ["bank_transfer", "card"] },
  SCR: { code: "SCR", name: "Seychellois Rupee", symbol: "SR", decimals: 2, minAmount: 10, maxAmount: 500_000, paymentRails: ["bank_transfer", "card"] },

  // Major International Currencies
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, minAmount: 1, maxAmount: 1_000_000, paymentRails: ["card", "wire", "ach", "paypal", "stripe", "wise"] },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["card", "wire", "faster_payments", "wise"] },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["card", "wire", "sepa", "wise"] },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "CA$", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["card", "wire", "interac", "wise"] },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["card", "wire", "payid", "wise"] },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0, minAmount: 100, maxAmount: 50_000_000, paymentRails: ["card", "wire", "paypay"] },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2, minAmount: 10, maxAmount: 5_000_000, paymentRails: ["card", "wire", "alipay", "wechat_pay"] },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2, minAmount: 100, maxAmount: 50_000_000, paymentRails: ["card", "upi", "neft", "wise"] },
  AED: { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2, minAmount: 5, maxAmount: 2_000_000, paymentRails: ["card", "wire", "wise"] },
  SAR: { code: "SAR", name: "Saudi Riyal", symbol: "﷼", decimals: 2, minAmount: 5, maxAmount: 2_000_000, paymentRails: ["card", "wire", "stcpay"] },
  BRL: { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2, minAmount: 5, maxAmount: 1_000_000, paymentRails: ["card", "pix", "boleto"] },
  MXN: { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2, minAmount: 20, maxAmount: 5_000_000, paymentRails: ["card", "wire", "spei"] },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["card", "wire", "paynow"] },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "Fr", decimals: 2, minAmount: 1, maxAmount: 500_000, paymentRails: ["card", "wire", "twint"] },
  SEK: { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2, minAmount: 10, maxAmount: 5_000_000, paymentRails: ["card", "wire", "swish"] },
  NOK: { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2, minAmount: 10, maxAmount: 5_000_000, paymentRails: ["card", "wire", "vipps"] },

  // Stablecoins & Crypto
  USDC: { code: "USDC", name: "USD Coin", symbol: "USDC", decimals: 6, minAmount: 1, maxAmount: 1_000_000, isStablecoin: true, paymentRails: ["ethereum", "polygon", "solana", "tron"] },
  USDT: { code: "USDT", name: "Tether USD", symbol: "USDT", decimals: 6, minAmount: 1, maxAmount: 1_000_000, isStablecoin: true, paymentRails: ["ethereum", "tron", "bsc", "polygon"] },
  DAI:  { code: "DAI",  name: "Dai Stablecoin", symbol: "DAI", decimals: 18, minAmount: 1, maxAmount: 500_000, isStablecoin: true, paymentRails: ["ethereum", "polygon"] },
  BTC:  { code: "BTC",  name: "Bitcoin", symbol: "₿", decimals: 8, minAmount: 0.0001, maxAmount: 10, isCrypto: true, paymentRails: ["bitcoin", "lightning"] },
  ETH:  { code: "ETH",  name: "Ethereum", symbol: "Ξ", decimals: 18, minAmount: 0.001, maxAmount: 100, isCrypto: true, paymentRails: ["ethereum"] },
  CNGN: { code: "CNGN", name: "cNGN Stablecoin", symbol: "cNGN", decimals: 6, minAmount: 100, maxAmount: 100_000_000, isStablecoin: true, paymentRails: ["ethereum", "polygon"] },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);
export const FIAT_CURRENCIES = Object.keys(CURRENCIES).filter(c => !CURRENCIES[c].isStablecoin && !CURRENCIES[c].isCrypto);
export const STABLECOINS = Object.keys(CURRENCIES).filter(c => CURRENCIES[c].isStablecoin);

// ─── COUNTRY DEFINITIONS ─────────────────────────────────────────────────────

export interface CountryConfig {
  code: string;           // ISO 3166-1 alpha-2
  name: string;
  region: string;
  currency: string;
  dialCode: string;
  languages: string[];
  vatRate: number;        // Standard VAT/GST rate (decimal)
  vatName: string;        // Local name for VAT
  hasVat: boolean;
  touristTaxRate?: number;
  serviceChargeRate?: number;
  airports: AirportConfig[];
  paymentMethods: string[];
  kybDocuments: string[];
  settlementDays: number;
  amlThreshold: number;   // Amount in local currency requiring enhanced KYC
  regulatoryBody: string;
  timezone: string;
  isDestinationHub: boolean; // Primary tourist destination
}

export interface AirportConfig {
  code: string;
  name: string;
  city: string;
  isInternational: boolean;
}

export const COUNTRIES: Record<string, CountryConfig> = {
  // ── AFRICA: PRIMARY MARKETS ──────────────────────────────────────────────
  NG: {
    code: "NG", name: "Nigeria", region: "West Africa", currency: "NGN",
    dialCode: "+234", languages: ["English", "Yoruba", "Hausa", "Igbo"],
    vatRate: 0.075, vatName: "VAT", hasVat: true,
    serviceChargeRate: 0.10,
    airports: [
      { code: "LOS", name: "Murtala Muhammed International Airport", city: "Lagos", isInternational: true },
      { code: "ABV", name: "Nnamdi Azikiwe International Airport", city: "Abuja", isInternational: true },
      { code: "PHC", name: "Port Harcourt International Airport", city: "Port Harcourt", isInternational: true },
      { code: "KAN", name: "Mallam Aminu Kano International Airport", city: "Kano", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "ussd", "card", "wallet", "enaira", "pos"],
    kybDocuments: ["CAC certificate", "Tax Identification Number", "Director ID", "Utility bill", "Bank statement"],
    settlementDays: 1, amlThreshold: 5_000_000,
    regulatoryBody: "CBN / FIRS / EFCC",
    timezone: "Africa/Lagos", isDestinationHub: true,
  },
  GH: {
    code: "GH", name: "Ghana", region: "West Africa", currency: "GHS",
    dialCode: "+233", languages: ["English", "Twi", "Ga", "Ewe"],
    vatRate: 0.125, vatName: "VAT", hasVat: true,
    airports: [
      { code: "ACC", name: "Kotoka International Airport", city: "Accra", isInternational: true },
      { code: "KMS", name: "Kumasi Airport", city: "Kumasi", isInternational: false },
    ],
    paymentMethods: ["bank_transfer", "mobile_money", "card", "momo"],
    kybDocuments: ["Business registration", "TIN", "Director ID", "Utility bill"],
    settlementDays: 1, amlThreshold: 50_000,
    regulatoryBody: "Bank of Ghana / GRA",
    timezone: "Africa/Accra", isDestinationHub: true,
  },
  KE: {
    code: "KE", name: "Kenya", region: "East Africa", currency: "KES",
    dialCode: "+254", languages: ["English", "Swahili"],
    vatRate: 0.16, vatName: "VAT", hasVat: true,
    airports: [
      { code: "NBO", name: "Jomo Kenyatta International Airport", city: "Nairobi", isInternational: true },
      { code: "MBA", name: "Moi International Airport", city: "Mombasa", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "mpesa", "card", "pesalink"],
    kybDocuments: ["Business registration", "KRA PIN", "Director ID", "Utility bill"],
    settlementDays: 1, amlThreshold: 1_000_000,
    regulatoryBody: "CBK / KRA",
    timezone: "Africa/Nairobi", isDestinationHub: true,
  },
  ZA: {
    code: "ZA", name: "South Africa", region: "Southern Africa", currency: "ZAR",
    dialCode: "+27", languages: ["English", "Zulu", "Xhosa", "Afrikaans"],
    vatRate: 0.15, vatName: "VAT", hasVat: true,
    airports: [
      { code: "JNB", name: "O.R. Tambo International Airport", city: "Johannesburg", isInternational: true },
      { code: "CPT", name: "Cape Town International Airport", city: "Cape Town", isInternational: true },
      { code: "DUR", name: "King Shaka International Airport", city: "Durban", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "card", "eft", "snapscan", "zapper"],
    kybDocuments: ["CIPC registration", "Tax clearance", "Director ID", "Utility bill"],
    settlementDays: 1, amlThreshold: 25_000,
    regulatoryBody: "SARB / SARS / FIC",
    timezone: "Africa/Johannesburg", isDestinationHub: true,
  },
  EG: {
    code: "EG", name: "Egypt", region: "North Africa", currency: "EGP",
    dialCode: "+20", languages: ["Arabic", "English"],
    vatRate: 0.14, vatName: "VAT", hasVat: true,
    touristTaxRate: 0.02,
    airports: [
      { code: "CAI", name: "Cairo International Airport", city: "Cairo", isInternational: true },
      { code: "HRG", name: "Hurghada International Airport", city: "Hurghada", isInternational: true },
      { code: "SSH", name: "Sharm el-Sheikh International Airport", city: "Sharm el-Sheikh", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "card", "instapay", "fawry"],
    kybDocuments: ["Commercial register", "Tax card", "Director ID", "Utility bill"],
    settlementDays: 2, amlThreshold: 500_000,
    regulatoryBody: "CBE / ETA",
    timezone: "Africa/Cairo", isDestinationHub: true,
  },
  MA: {
    code: "MA", name: "Morocco", region: "North Africa", currency: "MAD",
    dialCode: "+212", languages: ["Arabic", "French", "Amazigh"],
    vatRate: 0.20, vatName: "TVA", hasVat: true,
    touristTaxRate: 0.015,
    airports: [
      { code: "CMN", name: "Mohammed V International Airport", city: "Casablanca", isInternational: true },
      { code: "RAK", name: "Marrakech Menara Airport", city: "Marrakech", isInternational: true },
      { code: "FEZ", name: "Fes-Saïss Airport", city: "Fez", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "card", "cmi"],
    kybDocuments: ["RC registration", "Patente", "Director ID", "Utility bill"],
    settlementDays: 2, amlThreshold: 100_000,
    regulatoryBody: "Bank Al-Maghrib / DGI",
    timezone: "Africa/Casablanca", isDestinationHub: true,
  },
  TZ: {
    code: "TZ", name: "Tanzania", region: "East Africa", currency: "TZS",
    dialCode: "+255", languages: ["Swahili", "English"],
    vatRate: 0.18, vatName: "VAT", hasVat: true,
    airports: [
      { code: "DAR", name: "Julius Nyerere International Airport", city: "Dar es Salaam", isInternational: true },
      { code: "JRO", name: "Kilimanjaro International Airport", city: "Kilimanjaro", isInternational: true },
      { code: "ZNZ", name: "Abeid Amani Karume International Airport", city: "Zanzibar", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "mobile_money", "card", "tigopesa", "mpesa"],
    kybDocuments: ["Business license", "TIN", "Director ID", "Utility bill"],
    settlementDays: 2, amlThreshold: 2_000_000,
    regulatoryBody: "BOT / TRA",
    timezone: "Africa/Dar_es_Salaam", isDestinationHub: true,
  },
  RW: {
    code: "RW", name: "Rwanda", region: "East Africa", currency: "RWF",
    dialCode: "+250", languages: ["Kinyarwanda", "English", "French"],
    vatRate: 0.18, vatName: "VAT", hasVat: true,
    airports: [
      { code: "KGL", name: "Kigali International Airport", city: "Kigali", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "mobile_money", "card", "momo"],
    kybDocuments: ["RDB registration", "TIN", "Director ID", "Utility bill"],
    settlementDays: 1, amlThreshold: 1_000_000,
    regulatoryBody: "BNR / RRA",
    timezone: "Africa/Kigali", isDestinationHub: true,
  },
  SN: {
    code: "SN", name: "Senegal", region: "West Africa", currency: "XOF",
    dialCode: "+221", languages: ["French", "Wolof"],
    vatRate: 0.18, vatName: "TVA", hasVat: true,
    airports: [
      { code: "DSS", name: "Blaise Diagne International Airport", city: "Dakar", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "mobile_money", "card", "orange_money", "wave"],
    kybDocuments: ["RCCM registration", "NINEA", "Director ID", "Utility bill"],
    settlementDays: 2, amlThreshold: 5_000_000,
    regulatoryBody: "BCEAO / DGI",
    timezone: "Africa/Dakar", isDestinationHub: false,
  },
  CI: {
    code: "CI", name: "Côte d'Ivoire", region: "West Africa", currency: "XOF",
    dialCode: "+225", languages: ["French"],
    vatRate: 0.18, vatName: "TVA", hasVat: true,
    airports: [
      { code: "ABJ", name: "Félix-Houphouët-Boigny International Airport", city: "Abidjan", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "mobile_money", "card", "orange_money", "mtn_momo"],
    kybDocuments: ["RCCM registration", "DGI certificate", "Director ID"],
    settlementDays: 2, amlThreshold: 5_000_000,
    regulatoryBody: "BCEAO / DGI",
    timezone: "Africa/Abidjan", isDestinationHub: false,
  },
  ET: {
    code: "ET", name: "Ethiopia", region: "East Africa", currency: "ETB",
    dialCode: "+251", languages: ["Amharic", "English"],
    vatRate: 0.15, vatName: "VAT", hasVat: true,
    airports: [
      { code: "ADD", name: "Addis Ababa Bole International Airport", city: "Addis Ababa", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "card", "telebirr"],
    kybDocuments: ["Business license", "TIN", "Director ID", "Utility bill"],
    settlementDays: 2, amlThreshold: 500_000,
    regulatoryBody: "NBE / ERCA",
    timezone: "Africa/Addis_Ababa", isDestinationHub: false,
  },
  UG: {
    code: "UG", name: "Uganda", region: "East Africa", currency: "UGX",
    dialCode: "+256", languages: ["English", "Luganda"],
    vatRate: 0.18, vatName: "VAT", hasVat: true,
    airports: [
      { code: "EBB", name: "Entebbe International Airport", city: "Entebbe", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "mobile_money", "card", "mtn_momo", "airtel_money"],
    kybDocuments: ["URSB registration", "TIN", "Director ID", "Utility bill"],
    settlementDays: 2, amlThreshold: 5_000_000,
    regulatoryBody: "BOU / URA",
    timezone: "Africa/Kampala", isDestinationHub: false,
  },
  MU: {
    code: "MU", name: "Mauritius", region: "Indian Ocean", currency: "MUR",
    dialCode: "+230", languages: ["English", "French", "Creole"],
    vatRate: 0.15, vatName: "VAT", hasVat: true,
    touristTaxRate: 0.02,
    airports: [
      { code: "MRU", name: "Sir Seewoosagur Ramgoolam International Airport", city: "Port Louis", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "card", "juice"],
    kybDocuments: ["Business registration", "TAN", "Director ID"],
    settlementDays: 1, amlThreshold: 500_000,
    regulatoryBody: "BOM / MRA",
    timezone: "Indian/Mauritius", isDestinationHub: true,
  },
  SC: {
    code: "SC", name: "Seychelles", region: "Indian Ocean", currency: "SCR",
    dialCode: "+248", languages: ["Seychellois Creole", "English", "French"],
    vatRate: 0.15, vatName: "VAT", hasVat: true,
    touristTaxRate: 0.03,
    airports: [
      { code: "SEZ", name: "Seychelles International Airport", city: "Mahé", isInternational: true },
    ],
    paymentMethods: ["bank_transfer", "card"],
    kybDocuments: ["Business registration", "TAN", "Director ID"],
    settlementDays: 2, amlThreshold: 100_000,
    regulatoryBody: "CBS / SRC",
    timezone: "Indian/Mahe", isDestinationHub: true,
  },

  // ── TOURIST ORIGIN COUNTRIES ─────────────────────────────────────────────
  US: {
    code: "US", name: "United States", region: "North America", currency: "USD",
    dialCode: "+1", languages: ["English"],
    vatRate: 0, vatName: "Sales Tax (varies by state)", hasVat: false,
    airports: [
      { code: "JFK", name: "John F. Kennedy International Airport", city: "New York", isInternational: true },
      { code: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", isInternational: true },
      { code: "IAD", name: "Dulles International Airport", city: "Washington DC", isInternational: true },
      { code: "ORD", name: "O'Hare International Airport", city: "Chicago", isInternational: true },
      { code: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", city: "Atlanta", isInternational: true },
      { code: "HOU", name: "William P. Hobby Airport", city: "Houston", isInternational: true },
    ],
    paymentMethods: ["card", "ach", "wire", "paypal", "apple_pay", "google_pay", "zelle"],
    kybDocuments: ["EIN", "Articles of incorporation", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 10_000,
    regulatoryBody: "FinCEN / IRS / OCC",
    timezone: "America/New_York", isDestinationHub: false,
  },
  GB: {
    code: "GB", name: "United Kingdom", region: "Europe", currency: "GBP",
    dialCode: "+44", languages: ["English"],
    vatRate: 0.20, vatName: "VAT", hasVat: true,
    airports: [
      { code: "LHR", name: "London Heathrow Airport", city: "London", isInternational: true },
      { code: "LGW", name: "London Gatwick Airport", city: "London", isInternational: true },
      { code: "MAN", name: "Manchester Airport", city: "Manchester", isInternational: true },
      { code: "BHX", name: "Birmingham Airport", city: "Birmingham", isInternational: true },
    ],
    paymentMethods: ["card", "faster_payments", "bacs", "wise", "revolut", "monzo"],
    kybDocuments: ["Companies House registration", "UTR", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 10_000,
    regulatoryBody: "FCA / HMRC",
    timezone: "Europe/London", isDestinationHub: false,
  },
  EU: {
    code: "EU", name: "European Union", region: "Europe", currency: "EUR",
    dialCode: "+", languages: ["Multiple"],
    vatRate: 0.20, vatName: "VAT", hasVat: true,
    airports: [
      { code: "CDG", name: "Charles de Gaulle Airport", city: "Paris", isInternational: true },
      { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", isInternational: true },
      { code: "AMS", name: "Amsterdam Schiphol Airport", city: "Amsterdam", isInternational: true },
      { code: "FCO", name: "Leonardo da Vinci International Airport", city: "Rome", isInternational: true },
      { code: "MAD", name: "Adolfo Suárez Madrid–Barajas Airport", city: "Madrid", isInternational: true },
    ],
    paymentMethods: ["card", "sepa", "wire", "wise", "revolut"],
    kybDocuments: ["EU business registration", "VAT number", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 10_000,
    regulatoryBody: "ECB / National FCA",
    timezone: "Europe/Paris", isDestinationHub: false,
  },
  CA: {
    code: "CA", name: "Canada", region: "North America", currency: "CAD",
    dialCode: "+1", languages: ["English", "French"],
    vatRate: 0.05, vatName: "GST/HST", hasVat: true,
    airports: [
      { code: "YYZ", name: "Toronto Pearson International Airport", city: "Toronto", isInternational: true },
      { code: "YVR", name: "Vancouver International Airport", city: "Vancouver", isInternational: true },
      { code: "YUL", name: "Montréal-Trudeau International Airport", city: "Montreal", isInternational: true },
    ],
    paymentMethods: ["card", "interac", "wire", "wise"],
    kybDocuments: ["Business registration", "BN", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 10_000,
    regulatoryBody: "OSFI / CRA / FINTRAC",
    timezone: "America/Toronto", isDestinationHub: false,
  },
  AE: {
    code: "AE", name: "United Arab Emirates", region: "Middle East", currency: "AED",
    dialCode: "+971", languages: ["Arabic", "English"],
    vatRate: 0.05, vatName: "VAT", hasVat: true,
    airports: [
      { code: "DXB", name: "Dubai International Airport", city: "Dubai", isInternational: true },
      { code: "AUH", name: "Abu Dhabi International Airport", city: "Abu Dhabi", isInternational: true },
    ],
    paymentMethods: ["card", "wire", "wise", "apple_pay"],
    kybDocuments: ["Trade license", "TRN", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 55_000,
    regulatoryBody: "CBUAE / FTA",
    timezone: "Asia/Dubai", isDestinationHub: false,
  },
  CN: {
    code: "CN", name: "China", region: "Asia", currency: "CNY",
    dialCode: "+86", languages: ["Mandarin"],
    vatRate: 0.13, vatName: "增值税 (VAT)", hasVat: true,
    airports: [
      { code: "PEK", name: "Beijing Capital International Airport", city: "Beijing", isInternational: true },
      { code: "PVG", name: "Shanghai Pudong International Airport", city: "Shanghai", isInternational: true },
      { code: "CAN", name: "Guangzhou Baiyun International Airport", city: "Guangzhou", isInternational: true },
    ],
    paymentMethods: ["card", "wire", "alipay", "wechat_pay", "unionpay"],
    kybDocuments: ["Business license", "Unified social credit code", "Director ID"],
    settlementDays: 2, amlThreshold: 50_000,
    regulatoryBody: "PBOC / SAT",
    timezone: "Asia/Shanghai", isDestinationHub: false,
  },
  IN: {
    code: "IN", name: "India", region: "Asia", currency: "INR",
    dialCode: "+91", languages: ["Hindi", "English", "Multiple"],
    vatRate: 0.18, vatName: "GST", hasVat: true,
    airports: [
      { code: "DEL", name: "Indira Gandhi International Airport", city: "New Delhi", isInternational: true },
      { code: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", city: "Mumbai", isInternational: true },
      { code: "BLR", name: "Kempegowda International Airport", city: "Bangalore", isInternational: true },
    ],
    paymentMethods: ["card", "upi", "neft", "imps", "wise"],
    kybDocuments: ["GST registration", "PAN", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 500_000,
    regulatoryBody: "RBI / CBDT",
    timezone: "Asia/Kolkata", isDestinationHub: false,
  },
  BR: {
    code: "BR", name: "Brazil", region: "South America", currency: "BRL",
    dialCode: "+55", languages: ["Portuguese"],
    vatRate: 0.12, vatName: "ICMS/ISS", hasVat: true,
    airports: [
      { code: "GRU", name: "São Paulo/Guarulhos International Airport", city: "São Paulo", isInternational: true },
      { code: "GIG", name: "Rio de Janeiro/Galeão International Airport", city: "Rio de Janeiro", isInternational: true },
    ],
    paymentMethods: ["card", "pix", "boleto", "wire"],
    kybDocuments: ["CNPJ", "Contrato social", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 50_000,
    regulatoryBody: "BCB / Receita Federal",
    timezone: "America/Sao_Paulo", isDestinationHub: false,
  },
  AU: {
    code: "AU", name: "Australia", region: "Oceania", currency: "AUD",
    dialCode: "+61", languages: ["English"],
    vatRate: 0.10, vatName: "GST", hasVat: true,
    airports: [
      { code: "SYD", name: "Sydney Kingsford Smith Airport", city: "Sydney", isInternational: true },
      { code: "MEL", name: "Melbourne Airport", city: "Melbourne", isInternational: true },
    ],
    paymentMethods: ["card", "payid", "bpay", "wire", "wise"],
    kybDocuments: ["ABN", "ACN", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 10_000,
    regulatoryBody: "APRA / AUSTRAC / ATO",
    timezone: "Australia/Sydney", isDestinationHub: false,
  },
  SG: {
    code: "SG", name: "Singapore", region: "Asia", currency: "SGD",
    dialCode: "+65", languages: ["English", "Mandarin", "Malay", "Tamil"],
    vatRate: 0.09, vatName: "GST", hasVat: true,
    airports: [
      { code: "SIN", name: "Singapore Changi Airport", city: "Singapore", isInternational: true },
    ],
    paymentMethods: ["card", "paynow", "wire", "wise"],
    kybDocuments: ["ACRA registration", "UEN", "Director ID", "Bank statement"],
    settlementDays: 1, amlThreshold: 20_000,
    regulatoryBody: "MAS / IRAS",
    timezone: "Asia/Singapore", isDestinationHub: false,
  },
};

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRIES);
export const DESTINATION_HUBS = Object.keys(COUNTRIES).filter(c => COUNTRIES[c].isDestinationHub);
export const AFRICAN_COUNTRIES = Object.keys(COUNTRIES).filter(c =>
  ["West Africa", "East Africa", "North Africa", "Southern Africa", "Central Africa", "Indian Ocean"].includes(COUNTRIES[c].region)
);

// ─── CITY REGISTRY ────────────────────────────────────────────────────────────

export interface CityConfig {
  name: string;
  countryCode: string;
  state?: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isCapital?: boolean;
  isTouristHub?: boolean;
  popularNeighborhoods?: string[];
  touristAttractions?: string[];
}

export const CITIES: Record<string, CityConfig> = {
  // Nigeria
  "Lagos": { name: "Lagos", countryCode: "NG", state: "Lagos", latitude: 6.5244, longitude: 3.3792, timezone: "Africa/Lagos", isTouristHub: true, popularNeighborhoods: ["Ikoyi", "Victoria Island", "Lekki", "Ikeja", "Surulere", "Yaba"], touristAttractions: ["Nike Art Gallery", "Lekki Conservation Centre", "National Museum", "Balogun Market"] },
  "Abuja": { name: "Abuja", countryCode: "NG", state: "FCT", latitude: 9.0765, longitude: 7.3986, timezone: "Africa/Lagos", isCapital: true, isTouristHub: true, popularNeighborhoods: ["Maitama", "Asokoro", "Wuse", "Garki", "Gwarinpa"] },
  "Port Harcourt": { name: "Port Harcourt", countryCode: "NG", state: "Rivers", latitude: 4.8156, longitude: 7.0498, timezone: "Africa/Lagos", isTouristHub: false },
  "Kano": { name: "Kano", countryCode: "NG", state: "Kano", latitude: 12.0022, longitude: 8.5920, timezone: "Africa/Lagos", isTouristHub: true },
  "Ibadan": { name: "Ibadan", countryCode: "NG", state: "Oyo", latitude: 7.3775, longitude: 3.9470, timezone: "Africa/Lagos", isTouristHub: false },
  "Calabar": { name: "Calabar", countryCode: "NG", state: "Cross River", latitude: 4.9517, longitude: 8.3220, timezone: "Africa/Lagos", isTouristHub: true, touristAttractions: ["Calabar Carnival", "Cross River National Park"] },
  // Ghana
  "Accra": { name: "Accra", countryCode: "GH", latitude: 5.6037, longitude: -0.1870, timezone: "Africa/Accra", isCapital: true, isTouristHub: true },
  // Kenya
  "Nairobi": { name: "Nairobi", countryCode: "KE", latitude: -1.2921, longitude: 36.8219, timezone: "Africa/Nairobi", isCapital: true, isTouristHub: true },
  "Mombasa": { name: "Mombasa", countryCode: "KE", latitude: -4.0435, longitude: 39.6682, timezone: "Africa/Nairobi", isTouristHub: true },
  // South Africa
  "Cape Town": { name: "Cape Town", countryCode: "ZA", latitude: -33.9249, longitude: 18.4241, timezone: "Africa/Johannesburg", isTouristHub: true },
  "Johannesburg": { name: "Johannesburg", countryCode: "ZA", latitude: -26.2041, longitude: 28.0473, timezone: "Africa/Johannesburg", isTouristHub: true },
  // Egypt
  "Cairo": { name: "Cairo", countryCode: "EG", latitude: 30.0444, longitude: 31.2357, timezone: "Africa/Cairo", isCapital: true, isTouristHub: true },
  "Hurghada": { name: "Hurghada", countryCode: "EG", latitude: 27.2579, longitude: 33.8116, timezone: "Africa/Cairo", isTouristHub: true },
  // Morocco
  "Marrakech": { name: "Marrakech", countryCode: "MA", latitude: 31.6295, longitude: -7.9811, timezone: "Africa/Casablanca", isTouristHub: true },
  "Casablanca": { name: "Casablanca", countryCode: "MA", latitude: 33.5731, longitude: -7.5898, timezone: "Africa/Casablanca", isTouristHub: true },
  // Tanzania
  "Dar es Salaam": { name: "Dar es Salaam", countryCode: "TZ", latitude: -6.7924, longitude: 39.2083, timezone: "Africa/Dar_es_Salaam", isTouristHub: true },
  "Zanzibar": { name: "Zanzibar", countryCode: "TZ", latitude: -6.1659, longitude: 39.2026, timezone: "Africa/Dar_es_Salaam", isTouristHub: true },
  // Rwanda
  "Kigali": { name: "Kigali", countryCode: "RW", latitude: -1.9441, longitude: 30.0619, timezone: "Africa/Kigali", isCapital: true, isTouristHub: true },
  // International
  "New York": { name: "New York", countryCode: "US", state: "New York", latitude: 40.7128, longitude: -74.0060, timezone: "America/New_York", isTouristHub: false },
  "Washington DC": { name: "Washington DC", countryCode: "US", latitude: 38.9072, longitude: -77.0369, timezone: "America/New_York", isCapital: true, isTouristHub: false },
  "London": { name: "London", countryCode: "GB", latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London", isTouristHub: false },
  "Dubai": { name: "Dubai", countryCode: "AE", latitude: 25.2048, longitude: 55.2708, timezone: "Asia/Dubai", isTouristHub: false },
  "Paris": { name: "Paris", countryCode: "EU", latitude: 48.8566, longitude: 2.3522, timezone: "Europe/Paris", isTouristHub: false },
};

// ─── TAX RULES ENGINE ─────────────────────────────────────────────────────────

export interface TaxCalculation {
  vatRate: number;
  vatAmount: number;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  touristTaxRate: number;
  touristTaxAmount: number;
  totalTaxAmount: number;
  totalWithTax: number;
  breakdown: Record<string, number>;
}

export function calculateTax(
  amount: number,
  countryCode: string,
  merchantType: string,
  isTourist: boolean = false
): TaxCalculation {
  const country = COUNTRIES[countryCode] ?? COUNTRIES["NG"];

  const vatRate = country.hasVat ? country.vatRate : 0;
  const vatAmount = amount * vatRate;

  // Service charge applies to hospitality merchants
  const serviceChargeApplicable = ["hotel", "restaurant", "nightclub", "spa"].includes(merchantType);
  const serviceChargeRate = serviceChargeApplicable ? (country.serviceChargeRate ?? 0.10) : 0;
  const serviceChargeAmount = amount * serviceChargeRate;

  // Tourist tax applies to tourists in countries that have it
  const touristTaxRate = isTourist ? (country.touristTaxRate ?? 0) : 0;
  const touristTaxAmount = amount * touristTaxRate;

  const totalTaxAmount = vatAmount + serviceChargeAmount + touristTaxAmount;
  const totalWithTax = amount + totalTaxAmount;

  return {
    vatRate, vatAmount,
    serviceChargeRate, serviceChargeAmount,
    touristTaxRate, touristTaxAmount,
    totalTaxAmount, totalWithTax,
    breakdown: {
      [country.vatName]: vatAmount,
      ...(serviceChargeAmount > 0 ? { "Service Charge": serviceChargeAmount } : {}),
      ...(touristTaxAmount > 0 ? { "Tourist Tax": touristTaxAmount } : {}),
    },
  };
}

// ─── PAYMENT RAIL RESOLVER ────────────────────────────────────────────────────

export interface PaymentRailConfig {
  rail: string;
  name: string;
  supportedCurrencies: string[];
  supportedCountries: string[];
  minAmount: number;
  maxAmount: number;
  processingTimeMinutes: number;
  feePercent: number;
  feeFixed: number;
}

export const PAYMENT_RAILS: Record<string, PaymentRailConfig> = {
  bank_transfer: { rail: "bank_transfer", name: "Bank Transfer", supportedCurrencies: FIAT_CURRENCIES, supportedCountries: SUPPORTED_COUNTRIES, minAmount: 1, maxAmount: 10_000_000, processingTimeMinutes: 1440, feePercent: 0.001, feeFixed: 0 },
  card: { rail: "card", name: "Card Payment", supportedCurrencies: FIAT_CURRENCIES, supportedCountries: SUPPORTED_COUNTRIES, minAmount: 1, maxAmount: 500_000, processingTimeMinutes: 1, feePercent: 0.015, feeFixed: 0 },
  ussd: { rail: "ussd", name: "USSD", supportedCurrencies: ["NGN"], supportedCountries: ["NG"], minAmount: 100, maxAmount: 1_000_000, processingTimeMinutes: 1, feePercent: 0, feeFixed: 50 },
  mpesa: { rail: "mpesa", name: "M-Pesa", supportedCurrencies: ["KES", "TZS", "GHS", "MZN"], supportedCountries: ["KE", "TZ", "GH", "MZ"], minAmount: 1, maxAmount: 300_000, processingTimeMinutes: 1, feePercent: 0.01, feeFixed: 0 },
  mobile_money: { rail: "mobile_money", name: "Mobile Money", supportedCurrencies: ["GHS", "XOF", "XAF", "UGX", "RWF", "TZS"], supportedCountries: ["GH", "SN", "CI", "UG", "RW", "TZ"], minAmount: 1, maxAmount: 10_000_000, processingTimeMinutes: 1, feePercent: 0.01, feeFixed: 0 },
  wire: { rail: "wire", name: "Wire Transfer (SWIFT)", supportedCurrencies: FIAT_CURRENCIES, supportedCountries: SUPPORTED_COUNTRIES, minAmount: 100, maxAmount: 10_000_000, processingTimeMinutes: 2880, feePercent: 0, feeFixed: 25 },
  wise: { rail: "wise", name: "Wise (TransferWise)", supportedCurrencies: ["USD", "GBP", "EUR", "CAD", "AUD", "SGD", "INR", "NGN", "GHS", "KES"], supportedCountries: SUPPORTED_COUNTRIES, minAmount: 1, maxAmount: 1_000_000, processingTimeMinutes: 60, feePercent: 0.005, feeFixed: 0 },
  sepa: { rail: "sepa", name: "SEPA Transfer", supportedCurrencies: ["EUR"], supportedCountries: ["EU"], minAmount: 1, maxAmount: 1_000_000, processingTimeMinutes: 60, feePercent: 0, feeFixed: 0 },
  faster_payments: { rail: "faster_payments", name: "UK Faster Payments", supportedCurrencies: ["GBP"], supportedCountries: ["GB"], minAmount: 1, maxAmount: 250_000, processingTimeMinutes: 1, feePercent: 0, feeFixed: 0 },
  ach: { rail: "ach", name: "ACH (US)", supportedCurrencies: ["USD"], supportedCountries: ["US"], minAmount: 1, maxAmount: 1_000_000, processingTimeMinutes: 1440, feePercent: 0.003, feeFixed: 0 },
  upi: { rail: "upi", name: "UPI (India)", supportedCurrencies: ["INR"], supportedCountries: ["IN"], minAmount: 1, maxAmount: 100_000, processingTimeMinutes: 1, feePercent: 0, feeFixed: 0 },
  alipay: { rail: "alipay", name: "Alipay", supportedCurrencies: ["CNY", "USD", "EUR"], supportedCountries: ["CN"], minAmount: 1, maxAmount: 500_000, processingTimeMinutes: 1, feePercent: 0.006, feeFixed: 0 },
  pix: { rail: "pix", name: "PIX (Brazil)", supportedCurrencies: ["BRL"], supportedCountries: ["BR"], minAmount: 1, maxAmount: 1_000_000, processingTimeMinutes: 1, feePercent: 0, feeFixed: 0 },
  enaira: { rail: "enaira", name: "eNaira (CBDC)", supportedCurrencies: ["NGN"], supportedCountries: ["NG"], minAmount: 100, maxAmount: 10_000_000, processingTimeMinutes: 1, feePercent: 0, feeFixed: 0 },
  stablecoin: { rail: "stablecoin", name: "Stablecoin (USDC/USDT/DAI)", supportedCurrencies: STABLECOINS, supportedCountries: SUPPORTED_COUNTRIES, minAmount: 1, maxAmount: 1_000_000, processingTimeMinutes: 5, feePercent: 0.001, feeFixed: 0 },
  crypto: { rail: "crypto", name: "Cryptocurrency (BTC/ETH)", supportedCurrencies: ["BTC", "ETH"], supportedCountries: SUPPORTED_COUNTRIES, minAmount: 0.0001, maxAmount: 100, processingTimeMinutes: 30, feePercent: 0.001, feeFixed: 0 },
};

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

/** Get the best payment rails for a given origin → destination currency pair */
export function getPaymentRails(fromCurrency: string, toCurrency: string, fromCountry: string): PaymentRailConfig[] {
  return Object.values(PAYMENT_RAILS).filter(rail =>
    rail.supportedCurrencies.includes(fromCurrency) &&
    rail.supportedCountries.includes(fromCountry)
  ).sort((a, b) => a.processingTimeMinutes - b.processingTimeMinutes);
}

/** Get the nearest airport for a given country */
export function getPrimaryAirport(countryCode: string): AirportConfig | null {
  const country = COUNTRIES[countryCode];
  if (!country) return null;
  return country.airports.find(a => a.isInternational) ?? country.airports[0] ?? null;
}

/** Get the AML threshold in USD equivalent (approximate) */
export function getAmlThresholdUsd(countryCode: string, fxRateToUsd: number): number {
  const country = COUNTRIES[countryCode];
  if (!country) return 10_000;
  return country.amlThreshold / fxRateToUsd;
}

/** Get the settlement days for a merchant in a given country */
export function getSettlementDays(countryCode: string, merchantType: string): number {
  const country = COUNTRIES[countryCode] ?? COUNTRIES["NG"];
  // Concert and event merchants always T+3 regardless of country
  if (merchantType === "concert") return 3;
  if (merchantType === "airbnb") return 2;
  return country.settlementDays;
}

/** Get KYB document requirements for a merchant in a given country */
export function getKybDocuments(countryCode: string): string[] {
  const country = COUNTRIES[countryCode] ?? COUNTRIES["NG"];
  return country.kybDocuments;
}

/** Get all cities for a country */
export function getCitiesForCountry(countryCode: string): CityConfig[] {
  return Object.values(CITIES).filter(c => c.countryCode === countryCode);
}

/** Resolve the destination country from a city name */
export function getCountryForCity(cityName: string): CountryConfig | null {
  const city = CITIES[cityName];
  if (!city) return null;
  return COUNTRIES[city.countryCode] ?? null;
}

/** Get all supported tourist destination cities */
export function getTouristDestinations(): CityConfig[] {
  return Object.values(CITIES).filter(c => c.isTouristHub);
}

/** Get diaspora corridors (origin → destination pairs) */
export const DIASPORA_CORRIDORS: Array<{ from: string; to: string; currency: string; label: string }> = [
  { from: "US", to: "NG", currency: "USD", label: "Nigerian Diaspora (USA → Nigeria)" },
  { from: "GB", to: "NG", currency: "GBP", label: "Nigerian Diaspora (UK → Nigeria)" },
  { from: "CA", to: "NG", currency: "CAD", label: "Nigerian Diaspora (Canada → Nigeria)" },
  { from: "EU", to: "NG", currency: "EUR", label: "Nigerian Diaspora (Europe → Nigeria)" },
  { from: "AE", to: "NG", currency: "AED", label: "Nigerian Diaspora (UAE → Nigeria)" },
  { from: "US", to: "GH", currency: "USD", label: "Ghanaian Diaspora (USA → Ghana)" },
  { from: "GB", to: "GH", currency: "GBP", label: "Ghanaian Diaspora (UK → Ghana)" },
  { from: "US", to: "KE", currency: "USD", label: "Kenyan Diaspora (USA → Kenya)" },
  { from: "GB", to: "KE", currency: "GBP", label: "Kenyan Diaspora (UK → Kenya)" },
  { from: "US", to: "ZA", currency: "USD", label: "South African Diaspora (USA → South Africa)" },
  { from: "CN", to: "NG", currency: "CNY", label: "Chinese Business Traveler (China → Nigeria)" },
  { from: "IN", to: "NG", currency: "INR", label: "Indian Business Traveler (India → Nigeria)" },
  { from: "BR", to: "NG", currency: "BRL", label: "Brazilian Business Traveler (Brazil → Nigeria)" },
];
