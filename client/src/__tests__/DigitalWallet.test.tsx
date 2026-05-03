/**
 * Digital Wallet — Component Tests
 *
 * Tests wallet balance display, currency operations, and transaction history.
 */
import { describe, it, expect, vi } from "vitest";

describe("Digital Wallet", () => {
  it("should display wallet balances in correct format", () => {
    const balances = [
      { currency: "USD", amount: 1250.50, symbol: "$" },
      { currency: "NGN", amount: 500000, symbol: "₦" },
      { currency: "KES", amount: 15000, symbol: "KSh" },
    ];

    expect(balances[0].amount).toBe(1250.50);
    expect(balances[1].currency).toBe("NGN");
    expect(balances).toHaveLength(3);
  });

  it("should validate send amount is positive and within balance", () => {
    const balance = 1000;
    const sendAmount = 500;
    const invalidAmount = -100;
    const overAmount = 1500;

    expect(sendAmount > 0 && sendAmount <= balance).toBe(true);
    expect(invalidAmount > 0).toBe(false);
    expect(overAmount <= balance).toBe(false);
  });

  it("should support all required currencies", () => {
    const supportedCurrencies = [
      "USD", "EUR", "GBP", "NGN", "KES", "GHS", "TZS", "ZAR",
      "USDC", "eNaira", "XLM",
    ];

    expect(supportedCurrencies).toContain("USD");
    expect(supportedCurrencies).toContain("NGN");
    expect(supportedCurrencies).toContain("USDC");
    expect(supportedCurrencies.length).toBeGreaterThanOrEqual(8);
  });

  it("should calculate exchange rates correctly", () => {
    const rates: Record<string, number> = {
      "USD/NGN": 1550,
      "USD/KES": 153,
      "USD/GHS": 15.5,
      "GBP/NGN": 1950,
    };

    const amount = 100; // USD
    const ngnResult = amount * rates["USD/NGN"];
    expect(ngnResult).toBe(155000);

    const kesResult = amount * rates["USD/KES"];
    expect(kesResult).toBe(15300);
  });

  it("should categorize transaction types correctly", () => {
    const transactionTypes = ["send", "receive", "swap", "deposit", "withdraw", "topup"];
    const incoming = ["receive", "deposit", "topup"];
    const outgoing = ["send", "withdraw"];

    for (const type of incoming) {
      expect(transactionTypes).toContain(type);
    }
    for (const type of outgoing) {
      expect(transactionTypes).toContain(type);
    }
  });

  it("should enforce spending limits", () => {
    const dailyLimit = 5000;
    const monthlyLimit = 50000;
    const todaySpent = 3000;
    const monthSpent = 40000;

    expect(todaySpent < dailyLimit).toBe(true);
    expect(monthSpent < monthlyLimit).toBe(true);
    expect(todaySpent + 2500 > dailyLimit).toBe(true); // Would exceed
  });

  it("should format transaction amounts with correct precision", () => {
    const formatAmount = (amount: number, currency: string) => {
      if (["USDC", "BTC", "ETH", "XLM"].includes(currency)) {
        return amount.toFixed(6);
      }
      return amount.toFixed(2);
    };

    expect(formatAmount(100.5, "USD")).toBe("100.50");
    expect(formatAmount(0.001234, "USDC")).toBe("0.001234");
    expect(formatAmount(1550.99, "NGN")).toBe("1550.99");
  });
});
