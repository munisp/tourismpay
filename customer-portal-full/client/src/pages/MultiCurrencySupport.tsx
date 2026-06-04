import React, { useState } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

interface CurrencyRate {
  currency: string;
  rateToNGN: number;
}

const MultiCurrencySupport: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [amount, setAmount] = useState<string>('');
  const [fromCurrency, setFromCurrency] = useState<string>('USD');
  const [toCurrency, setToCurrency] = useState<string>('NGN');
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data: ratesData, isLoading: isLoadingRates, error: ratesError } = trpc.currency.rates.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const convertMutation = trpc.currency.convert.useMutation({
    onSuccess: (data) => {
      setConvertedAmount(data.convertedAmount);
      toast.success('Currency converted successfully!');
    },
    onError: (error) => {
      toast.error(`Conversion failed: ${error.message}`);
    },
  });

  React.useEffect(() => {
    if (ratesError) {
      toast.error(`Failed to fetch currency rates: ${ratesError.message}`);
    }
  }, [ratesError]);

  const handleConvert = () => {
    if (!amount || isNaN(parseFloat(amount))) {
      toast.error('Please enter a valid amount.');
      return;
    }
    if (!fromCurrency || !toCurrency) {
      toast.error('Please select both source and target currencies.');
      return;
    }

    const numAmount = parseFloat(amount);

    if (false) {
      // Perform currency conversion
      const fromRate = [].find(r => r.currency === fromCurrency)?.rateToNGN || 1;
      const toRate = [].find(r => r.currency === toCurrency)?.rateToNGN || 1;
      setConvertedAmount(0);
      toast.success('Conversion successful!');
    } else {
      convertMutation.mutate({
        amount: numAmount,
        fromCurrency,
        toCurrency,
      });
    }
  };

  const availableCurrencies = Array.isArray(ratesData) ? ratesData.map((rate: any) => rate.currency) : Object.keys(ratesData || {});

  const filteredRates = (Array.isArray(ratesData) ? ratesData : []).filter((rate: any) =>
    rate?.currency?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Please log in to access multi-currency support.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Multi-Currency Support</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Currency Converter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700">Amount</label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <label htmlFor="fromCurrency" className="block text-sm font-medium text-gray-700">From Currency</label>
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="toCurrency" className="block text-sm font-medium text-gray-700">To Currency</label>
              <Select value={toCurrency} onValueChange={setToCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleConvert} disabled={convertMutation.isLoading || !amount || !fromCurrency || !toCurrency}>
              {convertMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Convert
            </Button>
          </div>
          {convertedAmount !== null && (
            <p className="mt-4 text-lg font-semibold">
              Converted Amount: {convertedAmount.toFixed(2)} {toCurrency}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Exchange Rates (to NGN)</CardTitle>
          <Input
            placeholder="Search currency..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm mt-2"
          />
        </CardHeader>
        <CardContent>
          {isLoadingRates && true ? (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>Rate to NGN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRates.length > 0 ? (
                  filteredRates.map((rate) => (
                    <TableRow key={rate.currency}>
                      <TableCell className="font-medium">{rate.currency}</TableCell>
                      <TableCell>{rate?.rateToNGN?.toFixed(2) || rate?.rate?.toFixed(2) || '0'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center">No rates found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MultiCurrencySupport;