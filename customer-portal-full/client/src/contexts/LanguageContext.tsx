import { createContext, useContext, useState, ReactNode } from "react";

type Language = "en" | "yo" | "ha" | "ig";

interface Translations {
  [key: string]: {
    en: string;
    yo: string;
    ha: string;
    ig: string;
  };
}

const translations: Translations = {
  // Navigation
  "nav.dashboard": {
    en: "Dashboard",
    yo: "Dasibodu",
    ha: "Dashboard",
    ig: "Dashboard",
  },
  "nav.policies": {
    en: "My Policies",
    yo: "Awọn Ilana Mi",
    ha: "Manufofina",
    ig: "Iwu m",
  },
  "nav.claims": {
    en: "My Claims",
    yo: "Awọn Ẹtọ Mi",
    ha: "Da'awata",
    ig: "Arịrịọ m",
  },
  "nav.payments": {
    en: "Payments",
    yo: "Awọn Isanwo",
    ha: "Biyan kuɗi",
    ig: "Ụgwọ",
  },
  "nav.profile": {
    en: "Profile",
    yo: "Profaili",
    ha: "Bayani",
    ig: "Profaịlụ",
  },
  "nav.products": {
    en: "Browse Products",
    yo: "Wo Awọn Ọja",
    ha: "Duba Kayayyaki",
    ig: "Lelee Ngwaahịa",
  },
  "nav.applications": {
    en: "My Applications",
    yo: "Awọn Ohun Elo Mi",
    ha: "Aikace-aikacena",
    ig: "Ngwa m",
  },
  "nav.kyc": {
    en: "KYC Status",
    yo: "Ipo KYC",
    ha: "Matsayin KYC",
    ig: "Ọnọdụ KYC",
  },
  "nav.blockchain": {
    en: "Policy Protection",
    yo: "Aabo Ilana",
    ha: "Kariyar Manufa",
    ig: "Nchekwa Iwu",
  },
  "nav.aiAdvisor": {
    en: "AI Advisor",
    yo: "Oludamọran AI",
    ha: "Mai ba da shawara na AI",
    ig: "Onye ndụmọdụ AI",
  },
  "nav.aiClaims": {
    en: "AI Claims Processing",
    yo: "Ṣiṣe Awọn Ẹtọ AI",
    ha: "Aiwatar da Da'awar AI",
    ig: "Nhazi Arịrịọ AI",
  },

  // Common
  "common.welcome": {
    en: "Welcome back",
    yo: "Kaabo pada",
    ha: "Barka da dawowa",
    ig: "Nnọọ azụ",
  },
  "common.logout": {
    en: "Logout",
    yo: "Jade",
    ha: "Fita",
    ig: "Pụọ",
  },
  "common.submit": {
    en: "Submit",
    yo: "Fi silẹ",
    ha: "Aika",
    ig: "Nyefee",
  },
  "common.cancel": {
    en: "Cancel",
    yo: "Fagilee",
    ha: "Soke",
    ig: "Kagbuo",
  },
  "common.save": {
    en: "Save",
    yo: "Fipamọ",
    ha: "Ajiye",
    ig: "Chekwaa",
  },
  "common.next": {
    en: "Next",
    yo: "Tẹle",
    ha: "Na gaba",
    ig: "Ọzọ",
  },
  "common.back": {
    en: "Back",
    yo: "Pada",
    ha: "Baya",
    ig: "Azụ",
  },
  "common.loading": {
    en: "Loading...",
    yo: "Nṣiṣẹ...",
    ha: "Ana lodi...",
    ig: "Na-ebu...",
  },

  // Dashboard
  "dashboard.title": {
    en: "Dashboard",
    yo: "Dasibodu",
    ha: "Dashboard",
    ig: "Dashboard",
  },
  "dashboard.activePolicies": {
    en: "Active Policies",
    yo: "Awọn Ilana Ti Nṣiṣẹ",
    ha: "Manufofin Aiki",
    ig: "Iwu na-arụ ọrụ",
  },
  "dashboard.pendingClaims": {
    en: "Pending Claims",
    yo: "Awọn Ẹtọ Ti Nduro",
    ha: "Da'awar da ke jiran",
    ig: "Arịrịọ na-echere",
  },
  "dashboard.paymentsDue": {
    en: "Payments Due",
    yo: "Awọn Isanwo Ti O Yẹ",
    ha: "Biyan kuɗi da ya kamata",
    ig: "Ụgwọ kwesịrị",
  },
  "dashboard.recentActivity": {
    en: "Recent Activity",
    yo: "Iṣẹ Aipẹ",
    ha: "Ayyukan Kwanan nan",
    ig: "Ọrụ ọhụrụ",
  },

  // Insurance Types
  "insurance.health": {
    en: "Health Insurance",
    yo: "Iṣeduro Ilera",
    ha: "Inshorar Lafiya",
    ig: "Inshọransị ahụike",
  },
  "insurance.auto": {
    en: "Auto Insurance",
    yo: "Iṣeduro Ọkọ",
    ha: "Inshorar Mota",
    ig: "Inshọransị ụgbọ ala",
  },
  "insurance.property": {
    en: "Property Insurance",
    yo: "Iṣeduro Ohun-ini",
    ha: "Inshorar Dukiya",
    ig: "Inshọransị akụ",
  },
  "insurance.life": {
    en: "Life Insurance",
    yo: "Iṣeduro Aye",
    ha: "Inshorar Rayuwa",
    ig: "Inshọransị ndụ",
  },

  // Claims
  "claims.fileNew": {
    en: "File New Claim",
    yo: "Fi Ẹtọ Tuntun Silẹ",
    ha: "Shigar da sabuwar da'awa",
    ig: "Tinye arịrịọ ọhụrụ",
  },
  "claims.status": {
    en: "Claim Status",
    yo: "Ipo Ẹtọ",
    ha: "Matsayin Da'awa",
    ig: "Ọnọdụ arịrịọ",
  },
  "claims.approved": {
    en: "Approved",
    yo: "Ti Fọwọsi",
    ha: "An amince",
    ig: "Akwadoro",
  },
  "claims.pending": {
    en: "Pending",
    yo: "Nduro",
    ha: "Jiran",
    ig: "Na-echere",
  },
  "claims.rejected": {
    en: "Rejected",
    yo: "Ti Kọ",
    ha: "An ƙi",
    ig: "Ajụrụ",
  },

  // Payments
  "payments.payNow": {
    en: "Pay Now",
    yo: "San Bayi",
    ha: "Biya Yanzu",
    ig: "Kwụọ ugbu a",
  },
  "payments.history": {
    en: "Payment History",
    yo: "Itan Isanwo",
    ha: "Tarihin Biyan kuɗi",
    ig: "Akụkọ ụgwọ",
  },
  "payments.amount": {
    en: "Amount",
    yo: "Iye",
    ha: "Adadin",
    ig: "Ego",
  },

  // AI Features
  "ai.advisor.title": {
    en: "AI Insurance Advisor",
    yo: "Oludamọran Iṣeduro AI",
    ha: "Mai ba da shawara na Inshora na AI",
    ig: "Onye ndụmọdụ Inshọransị AI",
  },
  "ai.advisor.greeting": {
    en: "Hello! I'm your AI Insurance Advisor. How can I help you today?",
    yo: "Pẹlẹ o! Mo jẹ Oludamọran Iṣeduro AI rẹ. Bawo ni mo ṣe le ran ọ lọwọ loni?",
    ha: "Sannu! Ni ne mai ba ku shawara na Inshora na AI. Ta yaya zan iya taimaka muku yau?",
    ig: "Ndewo! Abụ m onye ndụmọdụ Inshọransị AI gị. Kedu ka m ga-esi nyere gị aka taa?",
  },
  "ai.claims.title": {
    en: "AI Claims Adjudication",
    yo: "Idajọ Awọn Ẹtọ AI",
    ha: "Yanke hukunci kan Da'awar AI",
    ig: "Ikpe Arịrịọ AI",
  },

  // Settings
  "settings.language": {
    en: "Language",
    yo: "Ede",
    ha: "Harshe",
    ig: "Asụsụ",
  },
  "settings.darkMode": {
    en: "Dark Mode",
    yo: "Ipo Dudu",
    ha: "Yanayin Duhu",
    ig: "Ọnọdụ ọchịchịrị",
  },
  "settings.notifications": {
    en: "Notifications",
    yo: "Awọn Iwifunni",
    ha: "Sanarwa",
    ig: "Ọkwa",
  },

  // Onboarding
  "onboarding.welcome": {
    en: "Welcome to InsurePortal!",
    yo: "Kaabo si InsurePortal!",
    ha: "Barka da zuwa InsurePortal!",
    ig: "Nnọọ na InsurePortal!",
  },
  "onboarding.getStarted": {
    en: "Get Started",
    yo: "Bẹrẹ",
    ha: "Fara",
    ig: "Malite",
  },
  "onboarding.personalInfo": {
    en: "Personal Information",
    yo: "Alaye Ti Ara Ẹni",
    ha: "Bayanan Sirri",
    ig: "Ozi onwe",
  },
  "onboarding.verification": {
    en: "Identity Verification",
    yo: "Ijẹrisi Idanimọ",
    ha: "Tabbatar da Asali",
    ig: "Nyocha njirimara",
  },

  // Errors
  "error.generic": {
    en: "Something went wrong. Please try again.",
    yo: "Nkan kan ṣẹlẹ. Jọwọ gbiyanju lẹẹkansi.",
    ha: "Wani abu ya faru. Da fatan za a sake gwadawa.",
    ig: "Ihe ọjọọ mere. Biko nwaa ọzọ.",
  },
  "error.network": {
    en: "Network error. Please check your connection.",
    yo: "Aṣiṣe nẹtiwọki. Jọwọ ṣayẹwo asopọ rẹ.",
    ha: "Kuskuren hanyar sadarwa. Da fatan za a duba haɗin ku.",
    ig: "Njehie netwọk. Biko lelee njikọ gị.",
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  languages: { code: Language; name: string; nativeName: string }[];
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const availableLanguages: { code: Language; name: string; nativeName: string }[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "ha", name: "Hausa", nativeName: "Hausa" },
  { code: "ig", name: "Igbo", nativeName: "Igbo" },
];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    return (saved as Language) || "en";
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("language", lang);
  };

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    return translation[language] || translation.en;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: handleSetLanguage,
        t,
        languages: availableLanguages,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
