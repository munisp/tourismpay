import axios from "axios";

export class TermiiProvider {
  private apiKey: string;
  private senderId: string;
  private baseUrl = "https://api.ng.termii.com/api";

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || "";
    this.senderId = process.env.TERMII_SENDER_ID || "INSUREPORTAL";
  }

  async send(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const res = await axios.post(`${this.baseUrl}/sms/send`, {
        to, from: this.senderId, sms: message, type: "plain", channel: "generic", api_key: this.apiKey,
      });
      return { success: true, messageId: res.data.message_id };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.message || err.message };
    }
  }

  async sendBulk(recipients: string[], message: string): Promise<Array<{ to: string; success: boolean; messageId?: string }>> {
    const results = await Promise.allSettled(recipients.map((to) => this.send(to, message)));
    return recipients.map((to, i) => {
      const result = results[i];
      if (result.status === "fulfilled") return { to, ...result.value };
      return { to, success: false };
    });
  }

  async getDeliveryStatus(messageId: string): Promise<{ status: string }> {
    try {
      const res = await axios.get(`${this.baseUrl}/sms/inbox`, { params: { api_key: this.apiKey, message_id: messageId } });
      return { status: res.data.status || "unknown" };
    } catch { return { status: "unknown" }; }
  }
}
