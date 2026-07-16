export type InsuranceIntent =
  | "greeting"
  | "buy_motor_insurance"
  | "buy_life_insurance"
  | "buy_health_insurance"
  | "buy_funeral_cover"
  | "file_claim"
  | "check_policy"
  | "pay_premium"
  | "get_quote"
  | "talk_to_agent"
  | "help"
  | "unknown";

interface IntentPattern {
  intent: InsuranceIntent;
  patterns: RegExp[];
}

export class InsuranceIntentClassifier {
  private intentPatterns: IntentPattern[] = [
    {
      intent: "greeting",
      patterns: [/^(hi|hello|hey|good (morning|afternoon|evening)|howdy)/i],
    },
    {
      intent: "buy_motor_insurance",
      patterns: [
        /\b(motor|car|vehicle|auto)\s*(insurance|cover|policy)/i,
        /\binsure\s*(my)?\s*(car|vehicle)/i,
        /\bthird\s*party/i,
        /\bcomprehensive\s*(cover|insurance)?/i,
      ],
    },
    {
      intent: "buy_life_insurance",
      patterns: [
        /\b(life|term)\s*(insurance|cover|policy)/i,
        /\blife\s*cover/i,
      ],
    },
    {
      intent: "buy_health_insurance",
      patterns: [
        /\b(health|medical|hospital)\s*(insurance|cover|plan)/i,
        /\bHMO/i,
      ],
    },
    {
      intent: "buy_funeral_cover",
      patterns: [
        /\b(funeral|burial|death)\s*(cover|insurance|plan)/i,
      ],
    },
    {
      intent: "file_claim",
      patterns: [
        /\b(file|make|submit|lodge|report)\s*(a)?\s*claim/i,
        /\b(accident|stolen|theft|fire|damage)/i,
        /\bmy\s*car\s*(hit|crash|accident|stolen)/i,
      ],
    },
    {
      intent: "check_policy",
      patterns: [
        /\b(check|view|see|status)\s*(my)?\s*polic/i,
        /\bpolicy\s*(status|details|number)/i,
      ],
    },
    {
      intent: "pay_premium",
      patterns: [
        /\b(pay|payment|renew)\s*(my)?\s*(premium|policy|insurance)/i,
        /\bhow\s*(much|to)\s*pay/i,
      ],
    },
    {
      intent: "get_quote",
      patterns: [
        /\b(quote|price|cost|how much)/i,
        /\bhow\s*much\s*(is|does|for)/i,
      ],
    },
    {
      intent: "talk_to_agent",
      patterns: [
        /\b(agent|human|person|speak|talk|call)\s*(to)?/i,
        /\bcustomer\s*(service|support|care)/i,
      ],
    },
    {
      intent: "help",
      patterns: [/\b(help|menu|options|what can you do)/i],
    },
  ];

  classify(text: string): InsuranceIntent {
    for (const { intent, patterns } of this.intentPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return intent;
        }
      }
    }
    return "unknown";
  }
}
