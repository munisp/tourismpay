import TelegramBot from "node-telegram-bot-api";
import { ConversationManager } from "../engine/conversation";

export class InsuranceCommandHandler {
  constructor(private bot: TelegramBot, private conversation: ConversationManager) {}

  async handleStart(msg: TelegramBot.Message) {
    const name = msg.from?.first_name || "there";
    const text = `🏦 *Welcome to InsurePortal, ${name}!*\n\nYour insurance companion on Telegram.\n\n*What I can do:*\n📋 /policies — View your insurance policies\n📝 /claims — View your claims\n🆕 /fileclaim — File a new claim\n💳 /premium — Check premium payments\n📍 /agent — Find nearby agents\n🆘 /emergency — Emergency contacts\n🌐 /language en|ha|yo|ig — Change language\n\n_Send me a message and I'll help you with insurance queries!_\n\n🔐 *NAICOM Licensed | NDPR Compliant*`;
    this.bot.sendMessage(msg.chat.id, text, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 My Policies", callback_data: "policies" }, { text: "📝 My Claims", callback_data: "claims" }],
          [{ text: "🆕 File Claim", callback_data: "file_claim" }, { text: "💳 Pay Premium", callback_data: "premium" }],
          [{ text: "📍 Find Agent", callback_data: "find_agent" }, { text: "🆘 Emergency", callback_data: "emergency" }],
        ],
      },
    });
  }

  async handleHelp(msg: TelegramBot.Message) {
    this.bot.sendMessage(msg.chat.id,
      "*InsurePortal Bot Commands:*\n\n" +
      "/start — Welcome & main menu\n" +
      "/policies — List your active policies\n" +
      "/claims — View claim history\n" +
      "/fileclaim — Start filing a new claim\n" +
      "/status [claim-id] — Check claim status\n" +
      "/premium — Premium payment info\n" +
      "/pay [policy-id] — Pay premium\n" +
      "/agent — Find nearest agent (share location)\n" +
      "/emergency — Emergency contacts\n" +
      "/language [en|ha|yo|ig] — Set language\n" +
      "/help — Show this message\n\n" +
      "_You can also send me photos as claim evidence, or share your location to find agents._",
      { parse_mode: "Markdown" }
    );
  }

  async handlePolicies(msg: TelegramBot.Message) {
    const policies = await this.conversation.getPolicies(msg.chat.id);
    if (policies.length === 0) {
      this.bot.sendMessage(msg.chat.id, "📋 You don't have any policies yet.\n\nVisit insureportal.ng to get covered!");
      return;
    }
    let text = "📋 *Your Insurance Policies:*\n\n";
    policies.forEach((p, i) => {
      const statusEmoji = p.status === "active" ? "🟢" : p.status === "expired" ? "🔴" : "🟡";
      text += `${i + 1}. *${p.type} Insurance*\n   ${statusEmoji} ${p.status.toUpperCase()}\n   📄 ${p.policyNumber}\n   💰 ₦${p.premiumAmount.toLocaleString()}/yr\n   📅 Expires: ${new Date(p.endDate).toLocaleDateString()}\n\n`;
    });
    const keyboard = policies.slice(0, 5).map((p) => [{ text: `View ${p.type} (${p.policyNumber})`, callback_data: `policy_${p.id}` }]);
    this.bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: keyboard } });
  }

  async handleClaims(msg: TelegramBot.Message) {
    const claims = await this.conversation.getClaims(msg.chat.id);
    if (claims.length === 0) {
      this.bot.sendMessage(msg.chat.id, "📝 No claims found.\n\nUse /fileclaim to submit a new claim.");
      return;
    }
    let text = "📝 *Your Claims:*\n\n";
    claims.forEach((c, i) => {
      const statusEmoji = c.status === "approved" ? "✅" : c.status === "rejected" ? "❌" : c.status === "processing" ? "⏳" : "🕐";
      text += `${i + 1}. *${c.type}* — ${statusEmoji} ${c.status}\n   #${c.id.slice(-8)} | ₦${c.amount.toLocaleString()}\n   Filed: ${new Date(c.filedAt).toLocaleDateString()}\n\n`;
    });
    this.bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  }

  async handleFileClaim(msg: TelegramBot.Message) {
    await this.conversation.startClaimFlow(msg.chat.id);
    this.bot.sendMessage(msg.chat.id, "🆕 *File a New Claim*\n\nSelect the type of claim:", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚗 Motor", callback_data: "claim_type_motor" }, { text: "🏥 Health", callback_data: "claim_type_health" }],
          [{ text: "🏠 Property", callback_data: "claim_type_property" }, { text: "❤️ Life", callback_data: "claim_type_life" }],
          [{ text: "🚢 Marine", callback_data: "claim_type_marine" }, { text: "🌾 Agricultural", callback_data: "claim_type_agricultural" }],
          [{ text: "✈️ Travel", callback_data: "claim_type_travel" }, { text: "🔥 Fire/Burglary", callback_data: "claim_type_fire" }],
        ],
      },
    });
  }

  async handlePremium(msg: TelegramBot.Message) {
    const premiums = await this.conversation.getPremiumDue(msg.chat.id);
    if (premiums.length === 0) {
      this.bot.sendMessage(msg.chat.id, "💳 No premiums due at this time. All payments up to date! ✅");
      return;
    }
    let text = "💳 *Premium Payments Due:*\n\n";
    premiums.forEach((p, i) => {
      text += `${i + 1}. *${p.type}* — ₦${p.amount.toLocaleString()}\n   Policy: ${p.policyNumber}\n   Due: ${new Date(p.dueDate).toLocaleDateString()}\n\n`;
    });
    text += "_Reply with /pay [policy-number] to make a payment_";
    this.bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
  }

  async handleFindAgent(msg: TelegramBot.Message) {
    this.bot.sendMessage(msg.chat.id, "📍 *Find an Insurance Agent*\n\nShare your location and I'll find agents near you:", {
      parse_mode: "Markdown",
      reply_markup: {
        keyboard: [[{ text: "📍 Share My Location", request_location: true }]],
        resize_keyboard: true, one_time_keyboard: true,
      },
    });
  }

  async handleClaimStatus(msg: TelegramBot.Message, claimId: string) {
    const claim = await this.conversation.getClaimStatus(msg.chat.id, claimId);
    if (!claim) {
      this.bot.sendMessage(msg.chat.id, `❓ Claim #${claimId} not found.`);
      return;
    }
    const emoji = claim.status === "approved" ? "✅" : claim.status === "rejected" ? "❌" : "⏳";
    this.bot.sendMessage(msg.chat.id,
      `${emoji} *Claim Status: ${claim.status.toUpperCase()}*\n\n` +
      `Type: ${claim.type}\nAmount: ₦${claim.amount.toLocaleString()}\nFiled: ${new Date(claim.filedAt).toLocaleDateString()}\n\n` +
      (claim.timeline ? `*Latest Update:*\n${claim.timeline}` : ""),
      { parse_mode: "Markdown" }
    );
  }

  async handlePayPremium(msg: TelegramBot.Message, policyId: string) {
    this.bot.sendMessage(msg.chat.id,
      `💳 *Pay Premium for Policy ${policyId}*\n\nSelect payment method:`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏦 Bank Transfer", callback_data: `pay_bank_${policyId}` }],
          [{ text: "💳 Card (Paystack)", callback_data: `pay_card_${policyId}` }],
          [{ text: "📱 USSD (*384*100#)", callback_data: `pay_ussd_${policyId}` }],
        ],
      },
    });
  }

  async handleEmergency(msg: TelegramBot.Message) {
    this.bot.sendMessage(msg.chat.id,
      "🆘 *Emergency Contacts*\n\n" +
      "📞 InsurePortal Emergency: +234-800-INSURE-1\n" +
      "📞 NAICOM Complaints: +234-9-4620430\n" +
      "👮 Nigeria Police: 199\n" +
      "🚗 FRSC (Road Accidents): 122\n" +
      "🔥 Fire Service: 199\n" +
      "🚑 Ambulance (LASAMBUS): 112\n\n" +
      "_For motor accidents: Take photos, ensure safety, then use /fileclaim_",
      { parse_mode: "Markdown" }
    );
  }

  async handleLanguage(msg: TelegramBot.Message, lang: string) {
    const supported: Record<string, string> = { en: "English", ha: "Hausa", yo: "Yoruba", ig: "Igbo" };
    if (!supported[lang]) {
      this.bot.sendMessage(msg.chat.id, "Supported languages: en (English), ha (Hausa), yo (Yoruba), ig (Igbo)");
      return;
    }
    await this.conversation.setLanguage(msg.chat.id, lang);
    this.bot.sendMessage(msg.chat.id, `🌐 Language set to *${supported[lang]}*`, { parse_mode: "Markdown" });
  }
}
