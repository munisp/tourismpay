import TelegramBot from "node-telegram-bot-api";
import { ConversationManager } from "../engine/conversation";

export class CallbackHandler {
  constructor(private bot: TelegramBot, private conversation: ConversationManager) {}

  async handle(query: TelegramBot.CallbackQuery) {
    const chatId = query.message!.chat.id;
    const data = query.data || "";
    await this.bot.answerCallbackQuery(query.id);

    if (data === "policies") {
      this.bot.emit("text", { ...query.message, text: "/policies", from: query.from, chat: query.message!.chat });
      return;
    }
    if (data === "claims") {
      this.bot.emit("text", { ...query.message, text: "/claims", from: query.from, chat: query.message!.chat });
      return;
    }
    if (data === "file_claim") {
      this.bot.emit("text", { ...query.message, text: "/fileclaim", from: query.from, chat: query.message!.chat });
      return;
    }
    if (data === "premium") {
      this.bot.emit("text", { ...query.message, text: "/premium", from: query.from, chat: query.message!.chat });
      return;
    }
    if (data === "find_agent") {
      this.bot.emit("text", { ...query.message, text: "/agent", from: query.from, chat: query.message!.chat });
      return;
    }
    if (data === "emergency") {
      this.bot.emit("text", { ...query.message, text: "/emergency", from: query.from, chat: query.message!.chat });
      return;
    }

    // Claim type selection
    if (data.startsWith("claim_type_")) {
      const typeMap: Record<string, string> = {
        motor: "Motor Accident", health: "Health/Medical", property: "Property Damage",
        life: "Life/Death", marine: "Marine Cargo", agricultural: "Agricultural",
        travel: "Travel", fire: "Fire/Burglary",
      };
      const typeKey = data.replace("claim_type_", "");
      const response = await this.conversation.handleClaimType(chatId, typeMap[typeKey] || typeKey);
      this.bot.sendMessage(chatId, response.text, { parse_mode: "Markdown" });
    }

    // Claim submission
    if (data === "claim_submit") {
      const response = await this.conversation.submitClaim(chatId);
      this.bot.sendMessage(chatId, response.text, { parse_mode: "Markdown" });
    }

    // Payment method selection
    if (data.startsWith("pay_")) {
      const parts = data.split("_");
      const method = parts[1];
      const policyId = parts.slice(2).join("_");
      const methodNames: Record<string, string> = { bank: "Bank Transfer", card: "Card Payment", ussd: "USSD" };
      this.bot.sendMessage(chatId,
        `💳 *${methodNames[method] || method} — Policy ${policyId}*\n\n` +
        (method === "bank" ? "Transfer to:\n🏦 GTBank: 0123456789\n🏦 Zenith: 9876543210\n\nRef: INS-${policyId}\n\n_Payment will be confirmed within 1 hour._" :
        method === "ussd" ? "Dial *384*100# on your phone\nSelect \"Pay Premium\"\nEnter Policy: ${policyId}" :
        "Payment link: insureportal.ng/pay/${policyId}\n\n_Powered by Paystack_"),
        { parse_mode: "Markdown" }
      );
    }

    // Policy detail
    if (data.startsWith("policy_")) {
      const policyId = data.replace("policy_", "");
      this.bot.sendMessage(chatId, `📄 Loading policy ${policyId}...\n\nVisit insureportal.ng for full details.`);
    }
  }
}
