/**
 * i18n support for React Native mobile app.
 * Matches PWA and Flutter i18n with 5 languages.
 */
export const SUPPORTED_LOCALES = ["en", "fr", "pt", "sw", "ar"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const translations: Record<Locale, Record<string, string>> = {
  en: {
    "app.name": "TourismPay",
    "nav.home": "Home",
    "nav.wallet": "Wallet",
    "nav.itinerary": "Itinerary",
    "nav.loyalty": "Loyalty",
    "nav.settings": "Settings",
    "action.send": "Send",
    "action.receive": "Receive",
    "action.scan": "Scan QR",
    "action.swap": "Swap",
    "offline.pending": "Pending Offline",
    "offline.syncing": "Syncing...",
    "offline.synced": "All Synced",
    "auth.login": "Login",
    "auth.logout": "Logout",
    "merchant.dashboard": "Business Dashboard",
    "merchant.products": "Products",
    "merchant.bookings": "Bookings",
    "admin.dashboard": "Admin Dashboard",
    "admin.users": "Users",
    "admin.compliance": "Compliance",
  },
  fr: {
    "app.name": "TourismPay",
    "nav.home": "Accueil",
    "nav.wallet": "Portefeuille",
    "nav.itinerary": "Itinéraire",
    "nav.loyalty": "Fidélité",
    "nav.settings": "Paramètres",
    "action.send": "Envoyer",
    "action.receive": "Recevoir",
    "action.scan": "Scanner QR",
    "action.swap": "Échanger",
    "offline.pending": "En attente hors ligne",
    "offline.syncing": "Synchronisation...",
    "offline.synced": "Tout synchronisé",
    "auth.login": "Connexion",
    "auth.logout": "Déconnexion",
    "merchant.dashboard": "Tableau de bord",
    "merchant.products": "Produits",
    "merchant.bookings": "Réservations",
    "admin.dashboard": "Tableau admin",
    "admin.users": "Utilisateurs",
    "admin.compliance": "Conformité",
  },
  pt: {
    "app.name": "TourismPay",
    "nav.home": "Início",
    "nav.wallet": "Carteira",
    "nav.itinerary": "Itinerário",
    "nav.loyalty": "Fidelidade",
    "nav.settings": "Configurações",
    "action.send": "Enviar",
    "action.receive": "Receber",
    "action.scan": "Escanear QR",
    "action.swap": "Trocar",
    "offline.pending": "Pendente offline",
    "offline.syncing": "Sincronizando...",
    "offline.synced": "Tudo sincronizado",
    "auth.login": "Entrar",
    "auth.logout": "Sair",
    "merchant.dashboard": "Painel de negócios",
    "merchant.products": "Produtos",
    "merchant.bookings": "Reservas",
    "admin.dashboard": "Painel admin",
    "admin.users": "Usuários",
    "admin.compliance": "Conformidade",
  },
  sw: {
    "app.name": "TourismPay",
    "nav.home": "Nyumbani",
    "nav.wallet": "Mkoba",
    "nav.itinerary": "Ratiba",
    "nav.loyalty": "Uaminifu",
    "nav.settings": "Mipangilio",
    "action.send": "Tuma",
    "action.receive": "Pokea",
    "action.scan": "Changanua QR",
    "action.swap": "Badilisha",
    "offline.pending": "Inasubiri nje ya mtandao",
    "offline.syncing": "Inasawazisha...",
    "offline.synced": "Yote yamesawazishwa",
    "auth.login": "Ingia",
    "auth.logout": "Toka",
    "merchant.dashboard": "Dashibodi ya biashara",
    "merchant.products": "Bidhaa",
    "merchant.bookings": "Uhifadhi",
    "admin.dashboard": "Dashibodi ya msimamizi",
    "admin.users": "Watumiaji",
    "admin.compliance": "Utiifu",
  },
  ar: {
    "app.name": "TourismPay",
    "nav.home": "الرئيسية",
    "nav.wallet": "المحفظة",
    "nav.itinerary": "خط السير",
    "nav.loyalty": "الولاء",
    "nav.settings": "الإعدادات",
    "action.send": "إرسال",
    "action.receive": "استلام",
    "action.scan": "مسح QR",
    "action.swap": "تبادل",
    "offline.pending": "معلق بلا اتصال",
    "offline.syncing": "جاري المزامنة...",
    "offline.synced": "تمت المزامنة",
    "auth.login": "دخول",
    "auth.logout": "خروج",
    "merchant.dashboard": "لوحة الأعمال",
    "merchant.products": "المنتجات",
    "merchant.bookings": "الحجوزات",
    "admin.dashboard": "لوحة المشرف",
    "admin.users": "المستخدمون",
    "admin.compliance": "الامتثال",
  },
};

let currentLocale: Locale = "en";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function t(key: string): string {
  return translations[currentLocale]?.[key] ?? translations.en[key] ?? key;
}

export function getLocale(): Locale {
  return currentLocale;
}
