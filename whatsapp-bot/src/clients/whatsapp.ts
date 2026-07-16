import axios from "axios";

export class WhatsAppClient {
  private apiUrl: string;
  private token: string;
  private phoneNumberId: string;

  constructor() {
    this.apiUrl = "https://graph.facebook.com/v18.0";
    this.token = process.env.WHATSAPP_TOKEN || "";
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  }

  async sendMessage(
    to: string,
    response: {
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
  ): Promise<void> {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;

    let payload: Record<string, unknown>;

    if (response.buttons && response.buttons.length > 0) {
      payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: response.text },
          action: {
            buttons: response.buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      };
    } else if (response.list) {
      payload = {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: response.text },
          action: {
            button: response.list.title,
            sections: response.list.sections,
          },
        },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: response.text },
      };
    }

    if (!this.token) {
      console.log(`[DRY RUN] Would send to ${to}:`, JSON.stringify(payload, null, 2));
      return;
    }

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async sendDocument(to: string, documentUrl: string, caption: string): Promise<void> {
    const url = `${this.apiUrl}/${this.phoneNumberId}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        link: documentUrl,
        caption,
      },
    };

    if (!this.token) {
      console.log(`[DRY RUN] Would send document to ${to}:`, caption);
      return;
    }

    await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
  }
}
