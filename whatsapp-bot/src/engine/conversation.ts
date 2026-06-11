import { InsuranceIntentClassifier, InsuranceIntent } from "./intent";

interface ConversationState {
  phone: string;
  intent: InsuranceIntent | null;
  step: number;
  data: Record<string, string>;
  lastActive: number;
}

export interface BotResponse {
  text: string;
  buttons?: Array<{ id: string; title: string }>;
  list?: {
    title: string;
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  };
}

export class ConversationEngine {
  private states: Map<string, ConversationState> = new Map();
  private classifier: InsuranceIntentClassifier;

  constructor(classifier: InsuranceIntentClassifier) {
    this.classifier = classifier;
  }

  async processMessage(phone: string, text: string): Promise<BotResponse> {
    let state = this.states.get(phone);
    if (!state || Date.now() - state.lastActive > 10 * 60 * 1000) {
      state = { phone, intent: null, step: 0, data: {}, lastActive: Date.now() };
      this.states.set(phone, state);
    }
    state.lastActive = Date.now();

    if (text.toLowerCase() === "menu" || text === "0") {
      state.intent = null;
      state.step = 0;
      return this.mainMenu();
    }

    if (!state.intent || state.step === 0) {
      const intent = this.classifier.classify(text);
      state.intent = intent;
      state.step = 1;
      return this.handleIntent(state, text);
    }

    return this.continueFlow(state, text);
  }

  private mainMenu(): BotResponse {
    return {
      text:
        "Welcome to *TourismPay* \u{1F6E1}\n\n" +
        "How can I help you today?\n\n" +
        "Type a number or describe what you need:",
      list: {
        title: "Insurance Services",
        sections: [
          {
            title: "Buy Insurance",
            rows: [
              { id: "buy_motor", title: "Motor Insurance", description: "Third party from \u20A65,000/yr" },
              { id: "buy_life", title: "Life Cover", description: "Term life from \u20A62,000/mo" },
              { id: "buy_funeral", title: "Funeral Cover", description: "From \u20A6500/month" },
              { id: "buy_health", title: "Hospital Cash", description: "\u20A65,000/day cover" },
            ],
          },
          {
            title: "Manage",
            rows: [
              { id: "check_policy", title: "Check My Policy" },
              { id: "file_claim", title: "File a Claim" },
              { id: "pay_premium", title: "Pay Premium" },
              { id: "talk_agent", title: "Talk to Agent" },
            ],
          },
        ],
      },
    };
  }

  private handleIntent(state: ConversationState, _text: string): BotResponse {
    switch (state.intent) {
      case "greeting":
        state.intent = null;
        state.step = 0;
        return this.mainMenu();

      case "buy_motor_insurance":
        return {
          text: "*Motor Insurance* \u{1F697}\n\nWhich type of cover?",
          buttons: [
            { id: "motor_tp", title: "Third Party" },
            { id: "motor_comp", title: "Comprehensive" },
            { id: "motor_quote", title: "Get a Quote" },
          ],
        };

      case "file_claim":
        return {
          text: "I\'m sorry to hear that. Let me help you file a claim.\n\nPlease enter your *policy number*:",
        };

      case "check_policy":
        return {
          text: "Please enter your *policy number* and I\'ll look it up for you:",
        };

      case "pay_premium":
        return {
          text: "To pay your premium, please enter your *policy number*:",
        };

      case "talk_to_agent":
        return {
          text:
            "I\'ll connect you with a human agent.\n\n" +
            "\u{1F4DE} Call: +234-800-INSURE-1\n" +
            "\u{1F4E7} Email: support@insureportal.ng\n\n" +
            "An agent will call you back within 15 minutes during business hours (8am-8pm WAT).",
        };

      case "help":
        state.intent = null;
        state.step = 0;
        return this.mainMenu();

      default:
        state.intent = null;
        state.step = 0;
        return {
          text:
            "I didn\'t quite understand that. Here\'s what I can help with:\n\n" +
            "\u2022 Buy motor, life, health or funeral insurance\n" +
            "\u2022 File a claim\n" +
            "\u2022 Check your policy status\n" +
            "\u2022 Pay your premium\n\n" +
            "Type *menu* to see all options.",
        };
    }
  }

  private continueFlow(state: ConversationState, text: string): BotResponse {
    switch (state.intent) {
      case "file_claim":
        return this.claimFlow(state, text);
      case "check_policy":
        return this.policyCheckFlow(state, text);
      case "pay_premium":
        return this.paymentFlow(state, text);
      case "buy_motor_insurance":
        return this.motorFlow(state, text);
      default:
        state.intent = null;
        state.step = 0;
        return this.mainMenu();
    }
  }

  private claimFlow(state: ConversationState, text: string): BotResponse {
    if (state.step === 1) {
      state.data.policyNumber = text;
      state.step = 2;
      return {
        text: "What type of claim?",
        buttons: [
          { id: "claim_accident", title: "Accident" },
          { id: "claim_theft", title: "Theft" },
          { id: "claim_other", title: "Other" },
        ],
      };
    }
    if (state.step === 2) {
      state.data.claimType = text;
      state.step = 3;
      return { text: "Please describe what happened:" };
    }
    if (state.step === 3) {
      state.data.description = text;
      state.step = 4;
      return {
        text: "Please send a photo of the damage/incident (or type *skip*):",
      };
    }

    const claimRef = "NGA-CLM-" + Date.now().toString(36).toUpperCase();
    state.intent = null;
    state.step = 0;
    return {
      text:
        `*Claim Registered* \u2705\n\n` +
        `Claim No: *${claimRef}*\n` +
        `Policy: ${state.data.policyNumber}\n` +
        `Type: ${state.data.claimType}\n\n` +
        `An adjuster will contact you within 24 hours.\n` +
        `Track your claim anytime by typing *check claim*.`,
    };
  }

  private policyCheckFlow(state: ConversationState, text: string): BotResponse {
    state.intent = null;
    state.step = 0;
    return {
      text:
        `*Policy Details* \u{1F4CB}\n\n` +
        `Policy: *${text}*\n` +
        `Status: Active \u2705\n` +
        `Type: Motor Third Party\n` +
        `Expiry: 31/12/2026\n` +
        `Next Payment: \u20A65,000 due 01/07/2026`,
    };
  }

  private paymentFlow(state: ConversationState, text: string): BotResponse {
    if (state.step === 1) {
      state.data.policyNumber = text;
      state.step = 2;
      return {
        text:
          `*Payment for ${text}*\n\n` +
          `Amount Due: \u20A65,000\n\n` +
          "How would you like to pay?",
        buttons: [
          { id: "pay_momo", title: "Mobile Money" },
          { id: "pay_bank", title: "Bank Transfer" },
          { id: "pay_card", title: "Debit Card" },
        ],
      };
    }
    state.intent = null;
    state.step = 0;
    return {
      text:
        `*Payment Initiated* \u{1F4B3}\n\n` +
        `Amount: \u20A65,000\n` +
        `Policy: ${state.data.policyNumber}\n` +
        `Ref: PAY-${Date.now().toString(36).toUpperCase()}\n\n` +
        `You will receive a payment link via SMS shortly.`,
    };
  }

  private motorFlow(state: ConversationState, text: string): BotResponse {
    if (state.step === 1) {
      state.data.coverType = text;
      state.step = 2;
      return { text: "Enter your *vehicle registration number*:" };
    }
    if (state.step === 2) {
      state.data.vehicleReg = text;
      state.step = 3;
      return { text: "Enter your *vehicle value* in Naira:" };
    }
    state.intent = null;
    state.step = 0;
    const policyRef = "NGA-MTR-" + Date.now().toString(36).toUpperCase();
    return {
      text:
        `*Quote Ready* \u{1F4B0}\n\n` +
        `Vehicle: ${state.data.vehicleReg}\n` +
        `Cover: ${state.data.coverType}\n` +
        `Premium: \u20A65,000/year\n\n` +
        `Policy: *${policyRef}*\n\n` +
        "Reply *confirm* to purchase or *menu* to go back.",
    };
  }
}
