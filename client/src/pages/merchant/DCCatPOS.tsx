import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeftRight, TrendingUp, DollarSign, Globe } from "lucide-react";

export default function DCCatPOS() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [quote, setQuote] = useState<any>(null);

  const { data: analytics } = trpc.dcc.getMerchantAnalytics.useQuery(
    { merchantId: user?.id ?? "", days: 30 },
    { enabled: !!user?.id }
  );

  const quoteMut = trpc.dcc.getQuote.useMutation({
    onSuccess: (d) => setQuote(d),
    onError: (e) => toast.error("Quote failed", { description: e.message }),
  });

  const recordMut = trpc.dcc.recordDecision.useMutation({
    onSuccess: (d) => { toast.success("Decision recorded", { description: d.message }); setQuote(null); setAmount(""); },
    onError: (e) => toast.error("Failed", { description: e.message }),
  });

  const handleGetQuote = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    quoteMut.mutate({ amountNgn: parseFloat(amount), homeCurrency: currency });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dynamic Currency Conversion</h1>
        <p className="text-gray-500 mt-1">Offer international tourists the option to pay in their home currency</p>
      </div>

      {analytics && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{analytics.total_transactions}</p><p className="text-sm text-gray-500">Total Transactions</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{analytics.acceptance_rate}%</p><p className="text-sm text-gray-500">DCC Acceptance Rate</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">NGN {Number(analytics.total_spread_revenue_ngn).toLocaleString()}</p><p className="text-sm text-gray-500">Spread Revenue (30d)</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-5 h-5" />DCC Quote Calculator</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Amount (NGN)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="50000" /></div>
            <div><Label>Tourist Home Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["USD","GBP","EUR","CAD","AUD","JPY","CHF","SEK"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleGetQuote} disabled={quoteMut.isPending} className="flex items-center gap-2"><Globe className="w-4 h-4" />{quoteMut.isPending ? "Getting quote..." : "Get DCC Quote"}</Button>

          {quote && (
            <div className="border rounded-lg p-4 bg-blue-50 space-y-3">
              <p className="font-semibold text-blue-900">DCC Quote</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-gray-600">In NGN</p><p className="text-xl font-bold">NGN {Number(quote.amount_ngn).toLocaleString()}</p></div>
                <div><p className="text-gray-600">In {quote.home_currency}</p><p className="text-xl font-bold">{quote.home_currency} {quote.converted_amount}</p></div>
                <div><p className="text-gray-600">Exchange Rate</p><p className="font-medium">1 NGN = {quote.exchange_rate.toFixed(6)} {quote.home_currency}</p></div>
                <div><p className="text-gray-600">Spread Revenue</p><p className="font-medium text-green-700">NGN {quote.spread_revenue_ngn}</p></div>
              </div>
              <p className="text-xs text-gray-500">Quote valid for {quote.quote_expires_in} seconds</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => recordMut.mutate({ merchantId: user?.id ?? "", amountNgn: quote.amount_ngn, convertedAmount: quote.converted_amount, homeCurrency: quote.home_currency, exchangeRate: quote.exchange_rate, spreadRevenueNgn: quote.spread_revenue_ngn, decision: "accepted" })} disabled={recordMut.isPending}>Tourist Accepts ({quote.home_currency})</Button>
                <Button size="sm" variant="outline" onClick={() => recordMut.mutate({ merchantId: user?.id ?? "", amountNgn: quote.amount_ngn, convertedAmount: quote.converted_amount, homeCurrency: quote.home_currency, exchangeRate: quote.exchange_rate, spreadRevenueNgn: quote.spread_revenue_ngn, decision: "declined" })}>Tourist Declines (NGN)</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {analytics?.top_currencies?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Top Currencies (30 days)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.top_currencies.map((c: any) => (
                <div key={c.currency} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="font-medium">{c.currency}</span>
                  <span className="text-gray-600">{c.count} transactions</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
