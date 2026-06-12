/**
 * i18n Infrastructure (1.2)
 * 
 * Multi-language support for African tourism audience.
 * Supports English, French, Swahili, Portuguese, Arabic.
 * Includes locale-aware currency/date formatting.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Locale = "en" | "fr" | "sw" | "pt" | "ar";

export interface Translation {
  [key: string]: string | Translation;
}

interface CurrencyFormatOptions {
  currency: string;
  locale?: Locale;
  minimumFractionDigits?: number;
}

// ─── Translations ─────────────────────────────────────────────────────────────

const translations: Record<Locale, Translation> = {
  en: {
    common: {
      welcome: "Welcome to TourismPay",
      login: "Sign In",
      logout: "Sign Out",
      dashboard: "Dashboard",
      payments: "Payments",
      settings: "Settings",
      search: "Search",
      cancel: "Cancel",
      confirm: "Confirm",
      save: "Save",
      loading: "Loading...",
      error: "An error occurred",
      retry: "Try Again",
      back: "Back",
      next: "Next",
      done: "Done",
    },
    payment: {
      send: "Send Money",
      receive: "Receive Payment",
      amount: "Amount",
      recipient: "Recipient",
      confirmed: "Payment Confirmed",
      pending: "Payment Pending",
      failed: "Payment Failed",
      scan_qr: "Scan QR Code",
      enter_amount: "Enter amount to send",
      review_payment: "Review Payment",
      total_with_fees: "Total (incl. fees)",
      fx_rate: "Exchange Rate",
      estimated_arrival: "Estimated Arrival",
    },
    merchant: {
      dashboard: "Merchant Dashboard",
      daily_revenue: "Today's Revenue",
      transactions: "Transactions",
      settlements: "Settlements",
      qr_code: "Your QR Code",
      generate_qr: "Generate Payment QR",
      payout: "Request Payout",
      inventory: "Inventory",
    },
    tourist: {
      explore: "Explore Destinations",
      wallet: "My Wallet",
      convert: "Convert Currency",
      nearby: "Nearby Merchants",
      insurance: "Travel Insurance",
      carbon_offset: "Carbon Offset",
      loyalty: "Loyalty Rewards",
      offline_pay: "Offline Payment",
    },
    kyc: {
      verify_identity: "Verify Your Identity",
      document_upload: "Upload Document",
      selfie_required: "Selfie Required",
      processing: "Verification in Progress",
      approved: "Verified",
      rejected: "Verification Failed",
    },
  },
  fr: {
    common: {
      welcome: "Bienvenue sur TourismPay",
      login: "Se connecter",
      logout: "Se déconnecter",
      dashboard: "Tableau de bord",
      payments: "Paiements",
      settings: "Paramètres",
      search: "Rechercher",
      cancel: "Annuler",
      confirm: "Confirmer",
      save: "Enregistrer",
      loading: "Chargement...",
      error: "Une erreur est survenue",
      retry: "Réessayer",
      back: "Retour",
      next: "Suivant",
      done: "Terminé",
    },
    payment: {
      send: "Envoyer de l'argent",
      receive: "Recevoir un paiement",
      amount: "Montant",
      recipient: "Destinataire",
      confirmed: "Paiement confirmé",
      pending: "Paiement en attente",
      failed: "Paiement échoué",
      scan_qr: "Scanner le code QR",
      enter_amount: "Saisir le montant",
      review_payment: "Vérifier le paiement",
      total_with_fees: "Total (frais inclus)",
      fx_rate: "Taux de change",
      estimated_arrival: "Arrivée estimée",
    },
    merchant: {
      dashboard: "Tableau de bord marchand",
      daily_revenue: "Revenu du jour",
      transactions: "Transactions",
      settlements: "Règlements",
      qr_code: "Votre code QR",
      generate_qr: "Générer un QR de paiement",
      payout: "Demander un virement",
      inventory: "Inventaire",
    },
    tourist: {
      explore: "Explorer les destinations",
      wallet: "Mon portefeuille",
      convert: "Convertir la devise",
      nearby: "Marchands à proximité",
      insurance: "Assurance voyage",
      carbon_offset: "Compensation carbone",
      loyalty: "Récompenses fidélité",
      offline_pay: "Paiement hors ligne",
    },
    kyc: {
      verify_identity: "Vérifier votre identité",
      document_upload: "Télécharger un document",
      selfie_required: "Selfie requis",
      processing: "Vérification en cours",
      approved: "Vérifié",
      rejected: "Vérification échouée",
    },
  },
  sw: {
    common: {
      welcome: "Karibu TourismPay",
      login: "Ingia",
      logout: "Ondoka",
      dashboard: "Dashibodi",
      payments: "Malipo",
      settings: "Mipangilio",
      search: "Tafuta",
      cancel: "Ghairi",
      confirm: "Thibitisha",
      save: "Hifadhi",
      loading: "Inapakia...",
      error: "Kosa limetokea",
      retry: "Jaribu tena",
      back: "Rudi",
      next: "Endelea",
      done: "Imekamilika",
    },
    payment: {
      send: "Tuma pesa",
      receive: "Pokea malipo",
      amount: "Kiasi",
      recipient: "Mpokeaji",
      confirmed: "Malipo yamethibitishwa",
      pending: "Malipo yanasubiri",
      failed: "Malipo yameshindikana",
      scan_qr: "Changanua msimbo wa QR",
      enter_amount: "Ingiza kiasi",
      review_payment: "Kagua malipo",
      total_with_fees: "Jumla (pamoja na ada)",
      fx_rate: "Kiwango cha ubadilishaji",
      estimated_arrival: "Muda wa kuwasili",
    },
    merchant: {
      dashboard: "Dashibodi ya mfanyabiashara",
      daily_revenue: "Mapato ya leo",
      transactions: "Miamala",
      settlements: "Makazi",
      qr_code: "Msimbo wako wa QR",
      generate_qr: "Tengeneza QR ya malipo",
      payout: "Omba malipo",
      inventory: "Hesabu",
    },
    tourist: {
      explore: "Gundua maeneo",
      wallet: "Mkoba wangu",
      convert: "Badilisha sarafu",
      nearby: "Wafanyabiashara karibu",
      insurance: "Bima ya safari",
      carbon_offset: "Fidia kaboni",
      loyalty: "Zawadi za uaminifu",
      offline_pay: "Malipo bila mtandao",
    },
    kyc: {
      verify_identity: "Thibitisha utambulisho",
      document_upload: "Pakia hati",
      selfie_required: "Picha ya uso inahitajika",
      processing: "Uthibitishaji unaendelea",
      approved: "Umethibitishwa",
      rejected: "Uthibitishaji umeshindikana",
    },
  },
  pt: {
    common: {
      welcome: "Bem-vindo ao TourismPay",
      login: "Entrar",
      logout: "Sair",
      dashboard: "Painel",
      payments: "Pagamentos",
      settings: "Configurações",
      search: "Pesquisar",
      cancel: "Cancelar",
      confirm: "Confirmar",
      save: "Salvar",
      loading: "Carregando...",
      error: "Ocorreu um erro",
      retry: "Tentar novamente",
      back: "Voltar",
      next: "Próximo",
      done: "Concluído",
    },
    payment: {
      send: "Enviar dinheiro",
      receive: "Receber pagamento",
      amount: "Valor",
      recipient: "Destinatário",
      confirmed: "Pagamento confirmado",
      pending: "Pagamento pendente",
      failed: "Pagamento falhou",
      scan_qr: "Escanear código QR",
      enter_amount: "Insira o valor",
      review_payment: "Revisar pagamento",
      total_with_fees: "Total (com taxas)",
      fx_rate: "Taxa de câmbio",
      estimated_arrival: "Chegada estimada",
    },
    merchant: {
      dashboard: "Painel do comerciante",
      daily_revenue: "Receita do dia",
      transactions: "Transações",
      settlements: "Liquidações",
      qr_code: "Seu código QR",
      generate_qr: "Gerar QR de pagamento",
      payout: "Solicitar pagamento",
      inventory: "Inventário",
    },
    tourist: {
      explore: "Explorar destinos",
      wallet: "Minha carteira",
      convert: "Converter moeda",
      nearby: "Comerciantes próximos",
      insurance: "Seguro de viagem",
      carbon_offset: "Compensação de carbono",
      loyalty: "Recompensas de fidelidade",
      offline_pay: "Pagamento offline",
    },
    kyc: {
      verify_identity: "Verificar identidade",
      document_upload: "Enviar documento",
      selfie_required: "Selfie necessária",
      processing: "Verificação em andamento",
      approved: "Verificado",
      rejected: "Verificação falhou",
    },
  },
  ar: {
    common: {
      welcome: "مرحبا بكم في TourismPay",
      login: "تسجيل الدخول",
      logout: "تسجيل الخروج",
      dashboard: "لوحة التحكم",
      payments: "المدفوعات",
      settings: "الإعدادات",
      search: "بحث",
      cancel: "إلغاء",
      confirm: "تأكيد",
      save: "حفظ",
      loading: "جاري التحميل...",
      error: "حدث خطأ",
      retry: "أعد المحاولة",
      back: "رجوع",
      next: "التالي",
      done: "تم",
    },
    payment: {
      send: "إرسال أموال",
      receive: "استلام دفعة",
      amount: "المبلغ",
      recipient: "المستلم",
      confirmed: "تم تأكيد الدفع",
      pending: "الدفع قيد الانتظار",
      failed: "فشل الدفع",
      scan_qr: "مسح رمز QR",
      enter_amount: "أدخل المبلغ",
      review_payment: "مراجعة الدفع",
      total_with_fees: "المجموع (شامل الرسوم)",
      fx_rate: "سعر الصرف",
      estimated_arrival: "وقت الوصول المقدر",
    },
    merchant: {
      dashboard: "لوحة تحكم التاجر",
      daily_revenue: "إيرادات اليوم",
      transactions: "المعاملات",
      settlements: "التسويات",
      qr_code: "رمز QR الخاص بك",
      generate_qr: "إنشاء QR للدفع",
      payout: "طلب سحب",
      inventory: "المخزون",
    },
    tourist: {
      explore: "استكشاف الوجهات",
      wallet: "محفظتي",
      convert: "تحويل العملة",
      nearby: "تجار قريبون",
      insurance: "تأمين السفر",
      carbon_offset: "تعويض الكربون",
      loyalty: "مكافآت الولاء",
      offline_pay: "الدفع بدون إنترنت",
    },
    kyc: {
      verify_identity: "التحقق من الهوية",
      document_upload: "رفع المستند",
      selfie_required: "صورة شخصية مطلوبة",
      processing: "التحقق جاري",
      approved: "تم التحقق",
      rejected: "فشل التحقق",
    },
  },
};

// ─── Core Functions ───────────────────────────────────────────────────────────

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string>): string {
  const parts = key.split(".");
  let result: string | Translation = translations[currentLocale];

  for (const part of parts) {
    if (typeof result === "string") return key;
    result = result[part];
    if (!result) {
      // Fallback to English
      result = translations.en;
      for (const p of parts) {
        if (typeof result === "string") return key;
        result = result[p];
        if (!result) return key;
      }
      break;
    }
  }

  let text = typeof result === "string" ? result : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{{${k}}}`, v);
    }
  }
  return text;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

const LOCALE_MAP: Record<Locale, string> = {
  en: "en-US",
  fr: "fr-FR",
  sw: "sw-KE",
  pt: "pt-BR",
  ar: "ar-EG",
};

export function formatCurrency(amount: number, options: CurrencyFormatOptions): string {
  const locale = LOCALE_MAP[options.locale || currentLocale];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: options.currency,
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
  }).format(amount);
}

export function formatDate(date: Date | string, style: "short" | "long" | "relative" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const locale = LOCALE_MAP[currentLocale];

  if (style === "relative") {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const diff = (d.getTime() - Date.now()) / 1000;
    if (Math.abs(diff) < 60) return rtf.format(Math.round(diff), "second");
    if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), "minute");
    if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), "hour");
    return rtf.format(Math.round(diff / 86400), "day");
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: style === "short" ? "short" : "full",
    timeStyle: style === "short" ? "short" : undefined,
  }).format(d);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat(LOCALE_MAP[currentLocale]).format(num);
}

export function getSupportedLocales(): { code: Locale; name: string; nativeName: string }[] {
  return [
    { code: "en", name: "English", nativeName: "English" },
    { code: "fr", name: "French", nativeName: "Français" },
    { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
    { code: "pt", name: "Portuguese", nativeName: "Português" },
    { code: "ar", name: "Arabic", nativeName: "العربية" },
  ];
}
