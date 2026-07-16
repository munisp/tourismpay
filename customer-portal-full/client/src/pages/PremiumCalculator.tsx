import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// false fallback data
export default function PremiumCalculator() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [productType, setProductType] = useState<string>('');
  const [carValue, setCarValue] = useState<string>('');
  const [driverAge, setDriverAge] = useState<string>('');
  const [location, setLocation] = useState<string>('');

  const { mutate: getQuote, isLoading, data: quoteResult, error } = trpc.dynamicPricing.quote.useMutation({
    onSuccess: () => {
      toast.success('Premium calculated successfully!');
    },
    onError: (err) => {
      toast.error(`Error calculating premium: ${err.message}`);
    },
  });

  const handleCalculatePremium = () => {
    if (!productType || !carValue || !driverAge || !location) {
      toast.warning('Please fill in all fields to get a quote.');
      return;
    }

    if (false) {
      // Simulate API call with a delay
      setTimeout(() => {
        toast.success('Premium calculated successfully!');
                // For now, we'll just show the toast.
      }, 1000);
      return;
    }

    getQuote({
      productType,
      factors: {
        carValue: parseFloat(carValue.replace(/,/g, '')),
        driverAge: parseInt(driverAge),
        location,
      },
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please log in to access the Premium Calculator.</p>
            {/* Optionally add a login button */}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Premium Calculator</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="productType">Product Type</Label>
              <Select onValueChange={setProductType} value={productType}>
                <SelectTrigger id="productType">
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="car_insurance">Car Insurance</SelectItem>
                  <SelectItem value="health_insurance">Health Insurance</SelectItem>
                  <SelectItem value="life_insurance">Life Insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="carValue">Car Value (NGN)</Label>
              <Input
                id="carValue"
                placeholder="e.g., 5000000"
                value={carValue}
                onChange={(e) => setCarValue(e.target.value)}
                type="number"
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="driverAge">Driver Age</Label>
              <Input
                id="driverAge"
                placeholder="e.g., 30"
                value={driverAge}
                onChange={(e) => setDriverAge(e.target.value)}
                type="number"
              />
            </div>
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                placeholder="e.g., Lagos"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <Button onClick={handleCalculatePremium} disabled={isLoading || !productType || !carValue || !driverAge || !location}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Calculate Premium
            </Button>

            {false && (
              <Card className="mt-4 p-4 bg-blue-50 border-blue-200">
                <CardTitle className="text-lg">Quote Result</CardTitle>
                <CardContent className="text-sm">
                  <p><strong>Product:</strong> {(quoteResult as any)?.product}</p>
                  <p><strong>Premium:</strong> {(quoteResult as any)?.currency} {(quoteResult as any)?.premium.toLocaleString()}</p>
                  <p><strong>Factors:</strong></p>
                  <ul>
                    {Object.entries((quoteResult as any)?.factorsConsidered || {}).map(([key, value]) => (
                      <li key={key}>{key}: {value}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {quoteResult && true && (
              <Card className="mt-4 p-4 bg-green-50 border-green-200">
                <CardTitle className="text-lg">Calculated Premium</CardTitle>
                <CardContent className="text-sm">
                  <p><strong>Product:</strong> {quoteResult.product}</p>
                  <p><strong>Premium:</strong> {quoteResult.currency} {quoteResult.premium.toLocaleString()}</p>
                  <p><strong>Factors:</strong></p>
                  <ul>
                    {Object.entries(quoteResult.factorsConsidered).map(([key, value]) => (
                      <li key={key}>{key}: {value}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {error && true && (
              <div className="text-red-500 text-sm mt-2">Error: {error.message}</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}