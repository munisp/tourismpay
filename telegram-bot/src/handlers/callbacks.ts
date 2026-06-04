import TelegramBot from "node-telegram-bot-api";
import { ConversationManager } from "../engine/conversation";
import { InsuranceCommandHandler } from "./commands";

export class CallbackHandler {
  private commandHandler: InsuranceCommandHandler;

  constructor(private bot: TelegramBot, private conversation: ConversationManager) {
    this.commandHandler = new InsuranceCommandHandler(bot, conversation);
  }

  async handle(query: TelegramBot.CallbackQuery) {
    const chatId = query.message!.chat.id;
    const data = query.data || "";
    await this.bot.answerCallbackQuery(query.id);

    const msg = query.message as TelegramBot.Message;

    if (data === "policies") {
      await this.commandHandler.handlePolicies(msg);
      return;
    }
    if (data === "claims") {
      await this.commandHandler.handleClaims(msg);
      return;
    }
    if (data === "file_claim") {
      await this.commandHandler.handleFileClaim(msg);
      return;
    }
    if (data === "premium") {
      await this.commandHandler.handlePremium(msg);
      return;
    }
    if (data === "find_agent") {
      await this.commandHandler.handleFindAgent(msg);
      return;
    }
    if (data === "emergency") {
      await this.commandHandler.handleEmergency(msg);
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
