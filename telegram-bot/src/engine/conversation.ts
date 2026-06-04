import axios from "axios";

interface ConversationState {
  chatId: number;
  step: string;
  data: Record<string, string>;
  language: string;
  lastActive: number;
}

interface BotResponse {
  text: string;
  keyboard?: Array<Array<{ text: string; callback_data: string }>>;
}

export class ConversationManager {
  private states: Map<number, ConversationState> = new Map();
  private apiBase: string;

  constructor(apiBase: string) {
    this.apiBase = apiBase;
  }

  private getState(chatId: number): ConversationState {
    if (!this.states.has(chatId)) {
      this.states.set(chatId, { chatId, step: "idle", data: {}, language: "en", lastActive: Date.now() });
    }
    const state = this.states.get(chatId)!;
    state.lastActive = Date.now();
    return state;
  }

  async processMessage(chatId: number, text: string, _langCode?: string): Promise<BotResponse> {
    const state = this.getState(chatId);

    if (text.toLowerCase() === "menu" || text === "0") {
      state.step = "idle";
      return {
        text: "📋 *Main Menu*\n\nWhat would you like to do?",
        keyboard: [
          [{ text: "📋 Policies", callback_data: "policies" }, { text: "📝 Claims", callback_data: "claims" }],
          [{ text: "🆕 File Claim", callback_data: "file_claim" }, { text: "💳 Premium", callback_data: "premium" }],
        ],
      };
    }

    if (state.step === "claim_description") {
      state.data.description = text;
      state.step = "claim_amount";
      return { text: "💰 What is the estimated claim amount? (in Naira, e.g., 500000)" };
    }

    if (state.step === "claim_amount") {
      const amount = parseInt(text.replace(/[₦,\s]/g, ""), 10);
      if (isNaN(amount)) return { text: "Please enter a valid amount (numbers only):" };
      state.data.amount = amount.toString();
      state.step = "claim_evidence";
      return {
        text: `📸 Please send photos of the incident as evidence.\n\nOr press Done to submit without photos.`,
        keyboard: [[{ text: "✅ Done — Submit Claim", callback_data: "claim_submit" }]],
      };
    }

    if (state.step === "claim_evidence") {
      return { text: "📸 Send photos or press Done to submit.", keyboard: [[{ text: "✅ Done — Submit Claim", callback_data: "claim_submit" }]] };
    }

    // Default: NLP-like intent detection
    const lower = text.toLowerCase();
    if (lower.includes("policy") || lower.includes("coverage")) {
      return { text: "📋 Use /policies to see your insurance policies, or /premium to check payments." };
    }
    if (lower.includes("claim") || lower.includes("accident") || lower.includes("damage")) {
      return { text: "📝 Use /fileclaim to file a new claim, or /claims to check existing ones." };
    }
    if (lower.includes("pay") || lower.includes("premium")) {
      return { text: "💳 Use /premium to see due payments or /pay [policy-number] to make a payment." };
    }
    if (lower.includes("agent") || lower.includes("help") || lower.includes("office")) {
      return { text: "📍 Use /agent and share your location to find nearby agents." };
    }
    if (lower.includes("emergency") || lower.includes("urgent")) {
      return { text: "🆘 Use /emergency for emergency contact numbers." };
    }

    return {
      text: "I can help you with insurance services! Try:\n\n📋 /policies\n📝 /fileclaim\n💳 /premium\n📍 /agent\n🆘 /emergency\n\nOr just describe what you need!",
    };
  }

  async startClaimFlow(chatId: number): Promise<void> {
    const state = this.getState(chatId);
    state.step = "claim_type";
    state.data = {};
  }

  async handleClaimType(chatId: number, type: string): Promise<BotResponse> {
    const state = this.getState(chatId);
    state.data.type = type;
    state.step = "claim_description";
    return { text: `📝 *${type} Claim*\n\nPlease describe the incident in detail:` };
  }

  async handlePhoto(chatId: number, fileId: string): Promise<void> {
    const state = this.getState(chatId);
    if (!state.data.photos) state.data.photos = "";
    state.data.photos += (state.data.photos ? "," : "") + fileId;
  }

  async handleDocument(chatId: number, fileId: string, fileName: string): Promise<void> {
    const state = this.getState(chatId);
    if (!state.data.documents) state.data.documents = "";
    state.data.documents += (state.data.documents ? "," : "") + `${fileId}:${fileName}`;
  }

  async submitClaim(chatId: number): Promise<BotResponse> {
    const state = this.getState(chatId);
    try {
      await axios.post(`${this.apiBase}/api/v1/claims`, {
        type: state.data.type,
        description: state.data.description,
        amount: parseInt(state.data.amount || "0", 10),
        evidence: state.data.photos?.split(",").filter(Boolean) || [],
        source: "telegram",
        chatId,
      });
      state.step = "idle";
      state.data = {};
      return { text: "✅ *Claim Submitted Successfully!*\n\nYou'll receive updates here as your claim is processed.\n\nUse /claims to check status." };
    } catch {
      return { text: "❌ Failed to submit claim. Please try again or call +234-800-INSURE-1." };
    }
  }

  async getPolicies(chatId: number): Promise<any[]> {
    try {
      const res = await axios.get(`${this.apiBase}/api/v1/policies`, { params: { chatId } });
      return res.data.policies || [];
    } catch { return []; }
  }

  async getClaims(chatId: number): Promise<any[]> {
    try {
      const res = await axios.get(`${this.apiBase}/api/v1/claims`, { params: { chatId } });
      return res.data.claims || [];
    } catch { return []; }
  }

  async getClaimStatus(chatId: number, claimId: string): Promise<any | null> {
    try {
      const res = await axios.get(`${this.apiBase}/api/v1/claims/${claimId}`, { params: { chatId } });
      return res.data;
    } catch { return null; }
  }

  async getPremiumDue(chatId: number): Promise<any[]> {
    try {
      const res = await axios.get(`${this.apiBase}/api/v1/premiums/due`, { params: { chatId } });
      return res.data.premiums || [];
    } catch { return []; }
  }

  async findNearbyAgents(lat: number, lng: number): Promise<any[]> {
    try {
      const res = await axios.get(`${this.apiBase}/api/v1/agents/nearby`, { params: { lat, lng, radius: 25 } });
      return res.data.agents || [];
    } catch { return []; }
  }

  async setLanguage(chatId: number, lang: string): Promise<void> {
    const state = this.getState(chatId);
    state.language = lang;
  }
}
