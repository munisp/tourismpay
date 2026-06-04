import express from "express";
import { WhatsAppWebhookHandler } from "./handlers/webhook";
import { ConversationEngine } from "./engine/conversation";
import { InsuranceIntentClassifier } from "./engine/intent";

const app = express();
app.use(express.json());

const intentClassifier = new InsuranceIntentClassifier();
const conversationEngine = new ConversationEngine(intentClassifier);
const webhookHandler = new WhatsAppWebhookHandler(conversationEngine);

// WhatsApp webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "insureportal-verify-token";

  if (mode === "subscribe" && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp message webhook
app.post("/webhook", (req, res) => webhookHandler.handle(req, res));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "whatsapp-bot" });
});

const port = process.env.PORT || 8091;
app.listen(port, () => {
  console.log(`WhatsApp Bot listening on port ${port}`);
});
