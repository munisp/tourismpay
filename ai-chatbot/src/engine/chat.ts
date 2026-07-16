import { KnowledgeBase } from "../knowledge/base";
import { LanguageDetector, SupportedLanguage } from "../language/detector";

interface ChatResponse {
  reply: string;
  language: SupportedLanguage;
  confidence: number;
  intent: string;
  suggested_actions: Array<{ label: string; action: string }>;
  session_id: string;
}

export class ChatEngine {
  private kb: KnowledgeBase;
  private langDetector: LanguageDetector;
  private sessions: Map<string, { language: SupportedLanguage; history: string[] }> = new Map();

  constructor(kb: KnowledgeBase, langDetector: LanguageDetector) {
    this.kb = kb;
    this.langDetector = langDetector;
  }

  async respond(sessionId: string, message: string, preferredLang?: string): Promise<ChatResponse> {
    const lang = (preferredLang as SupportedLanguage) || this.langDetector.detect(message);

    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { language: lang, history: [] };
      this.sessions.set(sessionId, session);
    }
    session.history.push(message);

    const faqMatch = this.kb.findAnswer(message, lang);
    if (faqMatch) {
      return {
        reply: faqMatch.answer,
        language: lang,
        confidence: faqMatch.confidence,
        intent: faqMatch.intent,
        suggested_actions: faqMatch.actions,
        session_id: sessionId,
      };
    }

    const greeting = this.getGreeting(lang);
    return {
      reply: greeting,
      language: lang,
      confidence: 0.7,
      intent: "general_inquiry",
      suggested_actions: [
        { label: this.translate("Buy Insurance", lang), action: "buy_insurance" },
        { label: this.translate("File a Claim", lang), action: "file_claim" },
        { label: this.translate("Check My Policy", lang), action: "check_policy" },
        { label: this.translate("Talk to Agent", lang), action: "talk_to_agent" },
      ],
      session_id: sessionId,
    };
  }

  private getGreeting(lang: SupportedLanguage): string {
    const greetings: Record<SupportedLanguage, string> = {
      en: "Hello! I'm your NGApp insurance assistant. How can I help you today?",
      ha: "Sannu! Ni ne mataimakin inshorar NGApp. Yaya zan taimaka muku yau?",
      yo: "Pele o! Mo je iranlowo iṣeduro NGApp rẹ. Bawo ni mo ṣe le ran ọ lọwọ loni?",
      ig: "Ndewo! Abu m onye enyemaka mkpuchi NGApp gi. Kedu ka m ga-esi nyere gi aka taa?",
      pcm: "How far! I be your NGApp insurance helper. Wetin I fit help you with today?",
      fr: "Bonjour! Je suis votre assistant assurance NGApp. Comment puis-je vous aider?",
      ar: "مرحبا! أنا مساعد التأمين NGApp الخاص بك. كيف يمكنني مساعدتك اليوم؟",
    };
    return greetings[lang] || greetings.en;
  }

  private translate(text: string, lang: SupportedLanguage): string {
    const translations: Record<string, Record<SupportedLanguage, string>> = {
      "Buy Insurance": {
        en: "Buy Insurance", ha: "Sayi Inshora", yo: "Ra Iṣeduro",
        ig: "Zụta Mkpuchi", pcm: "Buy Insurance", fr: "Acheter Assurance", ar: "شراء تأمين",
      },
      "File a Claim": {
        en: "File a Claim", ha: "Shigar da Ƙara", yo: "Ṣe Ẹtọ",
        ig: "Tinye Arịrịọ", pcm: "Make Claim", fr: "Déposer Réclamation", ar: "تقديم مطالبة",
      },
      "Check My Policy": {
        en: "Check My Policy", ha: "Duba Siyasar ta", yo: "Ṣayẹwo Eto mi",
        ig: "Lelee Iwu m", pcm: "Check My Policy", fr: "Vérifier Police", ar: "تحقق من وثيقتي",
      },
      "Talk to Agent": {
        en: "Talk to Agent", ha: "Yi magana da wakili", yo: "Bá Aṣoju sọrọ",
        ig: "Kwurịtara Onye nnọchite", pcm: "Talk to Person", fr: "Parler à Agent", ar: "تحدث إلى وكيل",
      },
    };
    return translations[text]?.[lang] || text;
  }
}
