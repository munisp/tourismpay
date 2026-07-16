import { Request, Response } from "express";
import { ConversationEngine } from "../engine/conversation";
import { WhatsAppClient } from "../clients/whatsapp";

export class WhatsAppWebhookHandler {
  private engine: ConversationEngine;
  private client: WhatsAppClient;

  constructor(engine: ConversationEngine) {
    this.engine = engine;
    this.client = new WhatsAppClient();
  }

  async handle(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      if (body.object !== "whatsapp_business_account") {
        res.sendStatus(404);
        return;
      }

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== "messages") continue;

          const messages = change.value?.messages || [];
          for (const message of messages) {
            const from = message.from;
            const text = message.text?.body || "";
            const messageType = message.type;

            let userInput = text;
            if (messageType === "interactive") {
              userInput =
                message.interactive?.button_reply?.id ||
                message.interactive?.list_reply?.id ||
                text;
            }

            const response = await this.engine.processMessage(from, userInput);
            await this.client.sendMessage(from, response);
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("Webhook error:", error);
      res.sendStatus(500);
    }
  }
}
