import axios from "axios";

export class AfricasTalkingProvider {
  private apiKey: string;
  private username: string;
  private senderId: string;
  private baseUrl = "https://api.africastalking.com/version1/messaging";

  constructor() {
    this.apiKey = process.env.AT_API_KEY || "";
    this.username = process.env.AT_USERNAME || "sandbox";
    this.senderId = process.env.AT_SENDER_ID || "INSUREPORTAL";
  }

  async send(to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const params = new URLSearchParams({ username: this.username, to, message, from: this.senderId });
      const res = await axios.post(this.baseUrl, params.toString(), {
        headers: { apiKey: this.apiKey, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      });
      const recipient = res.data?.SMSMessageData?.Recipients?.[0];
      return { success: recipient?.statusCode === 101, messageId: recipient?.messageId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
