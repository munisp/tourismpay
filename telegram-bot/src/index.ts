import express from "express";
import TelegramBot from "node-telegram-bot-api";
import { InsuranceCommandHandler } from "./handlers/commands";
import { ConversationManager } from "./engine/conversation";
import { CallbackHandler } from "./handlers/callbacks";

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_BOT_TOKEN || "";
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || "";
const apiBase = process.env.API_URL || "http://localhost:5000";

const bot = new TelegramBot(token, { polling: !webhookUrl });
const conversationManager = new ConversationManager(apiBase);
const commandHandler = new InsuranceCommandHandler(bot, conversationManager);
const callbackHandler = new CallbackHandler(bot, conversationManager);

// Register commands
bot.onText(/\/start/, (msg) => commandHandler.handleStart(msg));
bot.onText(/\/help/, (msg) => commandHandler.handleHelp(msg));
bot.onText(/\/policies/, (msg) => commandHandler.handlePolicies(msg));
bot.onText(/\/claims/, (msg) => commandHandler.handleClaims(msg));
bot.onText(/\/fileclaim/, (msg) => commandHandler.handleFileClaim(msg));
bot.onText(/\/premium/, (msg) => commandHandler.handlePremium(msg));
bot.onText(/\/agent/, (msg) => commandHandler.handleFindAgent(msg));
bot.onText(/\/status (.+)/, (msg, match) => commandHandler.handleClaimStatus(msg, match![1]));
bot.onText(/\/pay (.+)/, (msg, match) => commandHandler.handlePayPremium(msg, match![1]));
bot.onText(/\/emergency/, (msg) => commandHandler.handleEmergency(msg));
bot.onText(/\/language (.+)/, (msg, match) => commandHandler.handleLanguage(msg, match![1]));

// Handle callback queries (inline buttons)
bot.on("callback_query", (query) => callbackHandler.handle(query));

// Handle free-text messages (conversational flow)
bot.on("message", (msg) => {
  if (msg.text?.startsWith("/")) return; // skip commands
  conversationManager.processMessage(msg.chat.id, msg.text || "", msg.from?.language_code).then((response) => {
    if (response.keyboard) {
      bot.sendMessage(msg.chat.id, response.text, {
        reply_markup: { inline_keyboard: response.keyboard },
        parse_mode: "Markdown",
      });
    } else {
      bot.sendMessage(msg.chat.id, response.text, { parse_mode: "Markdown" });
    }
  });
});

// Handle photos (claim evidence)
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  const photoId = msg.photo![msg.photo!.length - 1].file_id;
  await conversationManager.handlePhoto(chatId, photoId);
  bot.sendMessage(chatId, "📸 Photo received and attached to your claim evidence.");
});

// Handle documents (policy documents)
bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  if (msg.document) {
    await conversationManager.handleDocument(chatId, msg.document.file_id, msg.document.file_name || "document");
    bot.sendMessage(chatId, "📎 Document received and attached.");
  }
});

// Handle location (agent locator)
bot.on("location", async (msg) => {
  if (msg.location) {
    const agents = await conversationManager.findNearbyAgents(msg.location.latitude, msg.location.longitude);
    if (agents.length === 0) {
      bot.sendMessage(msg.chat.id, "😔 No agents found within 25km of your location.");
      return;
    }
    let response = "📍 *Nearby Insurance Agents:*\n\n";
    agents.forEach((agent, i) => {
      response += `${i + 1}. *${agent.name}*\n   📞 ${agent.phone}\n   🏢 ${agent.specialty}\n   📏 ${agent.distance.toFixed(1)} km away\n\n`;
    });
    bot.sendMessage(msg.chat.id, response, { parse_mode: "Markdown" });
  }
});

// Webhook endpoint
if (webhookUrl) {
  app.post(`/webhook/${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
  bot.setWebHook(`${webhookUrl}/webhook/${token}`);
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "telegram-bot", uptime: process.uptime() });
});

const port = process.env.PORT || 8094;
app.listen(port, () => {
  console.log(`TourismPay Telegram Bot running on port ${port}`);
});
