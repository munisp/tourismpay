import { Request, Response } from "express";
import { TermiiProvider } from "../providers/termii";
import { AfricasTalkingProvider } from "../providers/africas-talking";
import { renderTemplate } from "../templates/insurance";

export class SMSRouter {
  private primary: TermiiProvider;
  private fallback: AfricasTalkingProvider;
  private deliveryLog: Map<string, { to: string; status: string; timestamp: number }> = new Map();

  constructor() {
    this.primary = new TermiiProvider();
    this.fallback = new AfricasTalkingProvider();
  }

  async send(req: Request, res: Response) {
    const { to, message, priority } = req.body;
    if (!to || !message) return res.status(400).json({ error: "to and message required" });

    const normalized = this.normalizePhone(to);
    let result = await this.primary.send(normalized, message);
    if (!result.success) {
      result = await this.fallback.send(normalized, message);
    }
    if (result.messageId) {
      this.deliveryLog.set(result.messageId, { to: normalized, status: "sent", timestamp: Date.now() });
    }
    res.json(result);
  }

  async sendBulk(req: Request, res: Response) {
    const { recipients, message } = req.body;
    if (!recipients?.length || !message) return res.status(400).json({ error: "recipients and message required" });

    const normalized = recipients.map((r: string) => this.normalizePhone(r));
    const results = await this.primary.sendBulk(normalized, message);
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      const retries = await Promise.all(failed.map((f) => this.fallback.send(f.to, message)));
      failed.forEach((f, i) => { if (retries[i].success) { f.success = true; } });
    }
    res.json({ total: results.length, delivered: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length, results });
  }

  async sendTemplate(req: Request, res: Response) {
    const { to, template, language, variables } = req.body;
    if (!to || !template) return res.status(400).json({ error: "to and template required" });

    try {
      const message = renderTemplate(template, language || "en", variables || {});
      const normalized = this.normalizePhone(to);
      let result = await this.primary.send(normalized, message);
      if (!result.success) result = await this.fallback.send(normalized, message);
      res.json({ ...result, message });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async deliveryReport(req: Request, res: Response) {
    const { message_id, status } = req.body;
    if (message_id && this.deliveryLog.has(message_id)) {
      this.deliveryLog.set(message_id, { ...this.deliveryLog.get(message_id)!, status, timestamp: Date.now() });
    }
    res.json({ received: true });
  }

  async getStatus(req: Request, res: Response) {
    const { messageId } = req.params;
    const log = this.deliveryLog.get(messageId);
    if (!log) return res.status(404).json({ error: "Message not found" });
    res.json(log);
  }

  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, "");
    if (cleaned.startsWith("0")) cleaned = "+234" + cleaned.slice(1);
    if (cleaned.startsWith("234") && !cleaned.startsWith("+")) cleaned = "+" + cleaned;
    if (!cleaned.startsWith("+")) cleaned = "+234" + cleaned;
    return cleaned;
  }
}
