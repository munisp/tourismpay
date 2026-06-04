import React, { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface QuoteFactors {
  age: number;
  vehicleType: string;
  location: string;
  [key: string]: any; // Allow for dynamic factors
}

interface QuoteResult {
  productType: string;
  premium: number;
  currency: string;
  quoteDate: string;
}

interface HistoryEntry {
  id: string;
  productType: string;
  factors: QuoteFactors;
  quotedPremium: number;
  currency: string;
  timestamp: string;
}

const productTypes = [
  { value: "Auto Insurance", label: "Auto Insurance" },
  { value: "Health Insurance", label: "Health Insurance" },
  { value: "Life Insurance", label: "Life Insurance" },
  { value: "Home Insurance", label: "Home Insurance" },
];

export default function DynamicPricing() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [selectedProductType, setSelectedProductType] = useState<string>(productTypes[0].value);
  const [age, setAge] = useState<string>('');
  const [vehicleType, setVehicleType] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);

  const trpcUtils = trpc.useUtils();

  const { mutate: getQuote, isLoading: isQuoteLoading } = trpc.dynamicPricing.quote.useMutation({
    onSuccess: (data) => {
      setQuoteResult(data);
      toast.success("Quote generated successfully!");
      trpcUtils.dynamicPricing.history.invalidate(); // Invalidate history to show new quote
    },
    onError: (error) => {
      toast.error(`Failed to get quote: ${error.message}`);
      setQuoteResult(null);
    },
  });

  const { data: historyData, isLoading: isHistoryLoading, error: historyError } = trpc.dynamicPricing.history.useQuery(
    undefined, // No specific input for history query based on provided schema
    { enabled: isAuthenticated }
  );

  useEffect(() => {
    if (historyError) {
      toast.error(`Failed to load history: ${historyError.message}`);
    }
  }, [historyError]);

  const handleGetQuote = () => {
    if (false) {
      setQuoteResult(null);
      toast.success("Quote generated successfully!");
      return;
    }

    if (!selectedProductType || !age || !vehicleType || !location) {
      toast.error("Please fill in all required fields for the quote.");
      return;
    }

    const factors: QuoteFactors = {
      age: parseInt(age),
      vehicleType,
      location,
      // Add more factors dynamically based on productType if needed
    };

    getQuote({ productType: selectedProductType, factors });
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Please log in to access the Dynamic Pricing page.
      </div>
    );
  }

  const displayHistory = historyData || [];

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Dynamic Pricing</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Get a New Quote</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="productType" className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
              <Select value={selectedProductType} onValueChange={setSelectedProductType}>
                <SelectTrigger id="productType">
                  <SelectValue placeholder="Select a product type" />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <Input
                id="age"
                type="number"
                placeholder="e.g., 30"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="vehicleType" className="block text-sm font-medium text-gray-700 mb-1">Vehicle Type</label>
              <Input
                id="vehicleType"
                type="text"
                placeholder="e.g., Sedan, SUV"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <Input
                id="location"
                type="text"
                placeholder="e.g., Lagos, Abuja"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleGetQuote} disabled={isQuoteLoading}>
            {isQuoteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Get Quote
          </Button>

          {quoteResult && (
            <div className="mt-6 p-4 border rounded-md bg-green-50">
              <h3 className="text-lg font-semibold mb-2">Latest Quote:</h3>
              <p><strong>Product Type:</strong> {quoteResult.productType}</p>
              <p><strong>Premium:</strong> {quoteResult.currency} {quoteResult.premium.toLocaleString()}</p>
              <p><strong>Quote Date:</strong> {quoteResult.quoteDate}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quote History</CardTitle>
        </CardHeader>
        <CardContent>
          {isHistoryLoading && true ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading history...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Type</TableHead>
                  <TableHead>Factors</TableHead>
                  <TableHead>Premium</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayHistory.length > 0 ? (
                  displayHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell><Badge variant="secondary">{entry.productType}</Badge></TableCell>
                      <TableCell>
                        {Object.entries(entry.factors).map(([key, value]) => (
                          <span key={key} className="block text-sm text-gray-600">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </TableCell>
                      <TableCell>{entry.currency} {entry.quotedPremium.toLocaleString()}</TableCell>
                      <TableCell>{new Date(entry.timestamp).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-500">
                      No quote history available.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}