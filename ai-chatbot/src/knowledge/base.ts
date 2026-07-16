import { SupportedLanguage } from "../language/detector";

interface FAQEntry {
  question: Record<string, string>;
  answer: Record<string, string>;
  intent: string;
  keywords: string[];
  actions: Array<{ label: string; action: string }>;
}

interface MatchResult {
  answer: string;
  confidence: number;
  intent: string;
  actions: Array<{ label: string; action: string }>;
}

export class KnowledgeBase {
  private faqs: FAQEntry[] = [
    {
      question: {
        en: "How do I buy motor insurance?",
        ha: "Yaya zan sayi inshorar mota?",
        pcm: "How I go buy motor insurance?",
      },
      answer: {
        en: "You can buy motor insurance through:\n1. USSD: Dial *384*NGAPP#\n2. WhatsApp: Message +234-800-NGAPP\n3. Our portal: portal.ngapp.ng\n\nThird party starts from \u20A65,000/year.",
        ha: "Kuna iya sayen inshorar mota ta:\n1. USSD: Buga *384*NGAPP#\n2. WhatsApp: Aika sako zuwa +234-800-NGAPP\n3. Shafin mu: portal.ngapp.ng",
        pcm: "You fit buy motor insurance like this:\n1. USSD: Dial *384*NGAPP#\n2. WhatsApp: Send message to +234-800-NGAPP\n3. Website: portal.ngapp.ng\n\nThird party dey start from \u20A65,000/year.",
      },
      intent: "buy_motor",
      keywords: ["motor", "car", "vehicle", "insurance", "buy", "mota", "sayi"],
      actions: [
        { label: "Get a Quote", action: "motor_quote" },
        { label: "Talk to Agent", action: "talk_to_agent" },
      ],
    },
    {
      question: {
        en: "How do I file a claim?",
        pcm: "How I go file claim?",
      },
      answer: {
        en: "To file a claim:\n1. WhatsApp: Send photos + description to +234-800-NGAPP\n2. USSD: Dial *384*NGAPP# > Option 4\n3. Portal: portal.ngapp.ng/claims\n\nClaims under \u20A650,000 are auto-approved in under 4 hours.",
        pcm: "To file claim:\n1. WhatsApp: Send photos + wetin happen to +234-800-NGAPP\n2. USSD: Dial *384*NGAPP# > Option 4\n3. Website: portal.ngapp.ng/claims\n\nSmall claims under \u20A650,000 go approve fast fast.",
      },
      intent: "file_claim",
      keywords: ["claim", "file", "accident", "stolen", "damage", "report"],
      actions: [
        { label: "File Claim Now", action: "file_claim" },
        { label: "Check Claim Status", action: "claim_status" },
      ],
    },
    {
      question: { en: "What is microinsurance?" },
      answer: {
        en: "Microinsurance is affordable insurance for everyone:\n\n\u2022 Hospital Cash: \u20A6500/month for \u20A65,000/day cover\n\u2022 Funeral Cover: \u20A6500/month for \u20A6500,000 payout\n\u2022 Device Protect: \u20A6200/month\n\u2022 Crop Shield: \u20A61,000/season\n\nSign up in under 2 minutes via USSD or WhatsApp!",
      },
      intent: "microinsurance_info",
      keywords: ["micro", "cheap", "affordable", "small", "low cost"],
      actions: [
        { label: "View Products", action: "micro_products" },
        { label: "Sign Up", action: "micro_enroll" },
      ],
    },
  ];

  findAnswer(query: string, lang: SupportedLanguage): MatchResult | null {
    const lowerQuery = query.toLowerCase();

    for (const faq of this.faqs) {
      const matchScore = faq.keywords.reduce((score, kw) => {
        return score + (lowerQuery.includes(kw.toLowerCase()) ? 1 : 0);
      }, 0);

      if (matchScore >= 2) {
        const answer = faq.answer[lang] || faq.answer.en || Object.values(faq.answer)[0];
        return {
          answer,
          confidence: Math.min(0.95, 0.5 + matchScore * 0.15),
          intent: faq.intent,
          actions: faq.actions,
        };
      }
    }
    return null;
  }

  getFAQ() {
    return this.faqs.map((f) => ({
      question: f.question.en || Object.values(f.question)[0],
      intent: f.intent,
    }));
  }
}
