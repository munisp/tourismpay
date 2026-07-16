import React, { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";

interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  minPremium: number;
  maxPremium: number;
}

interface Recommendation {
  productId: string;
  productName: string;
  recommendedPremium: number;
  factorsConsidered: string[];
}

const ProductRecommendationQuiz: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [selectedProductForQuote, setSelectedProductForQuote] = useState<Product | null>(null);
  const [quoteFactors, setQuoteFactors] = useState<Record<string, string>>({});

  const { data: products, isLoading: productsLoading, isError: productsError, error: productsErrorData } = trpc.marketplace.products.useQuery(
    { category: selectedCategory || undefined, search: searchTerm || undefined },
    { enabled: isAuthenticated }
  );

  const { mutate: getQuote, isLoading: quoteLoading, isError: quoteError, error: quoteErrorData, data: quoteResult } = trpc.dynamicPricing.quote.useMutation({
    onSuccess: () => {
      toast.success('Quote generated successfully!');
      // Invalidate any relevant queries if a quote generation impacts other data, e.g., history of quotes
      // trpc.useUtils().dynamicPricing.history.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to get quote: ${err.message}`);
    },
  });

  useEffect(() => {
    if (productsError) {
      toast.error(`Failed to load products: ${productsErrorData?.message}`);
    }
    if (quoteError) {
      toast.error(`Failed to generate quote: ${quoteErrorData?.message}`);
    }
  }, [productsError, productsErrorData, quoteError, quoteErrorData]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please log in to access the product recommendation quiz.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>You need to be authenticated to use this feature.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => window.location.href = '/login'}>Login</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const handleQuizAnswerChange = (questionId: string, value: string) => {
    setQuizAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
  };

  const handleGetQuote = (product: Product) => {
    setSelectedProductForQuote(product);
    // Initialize quote factors based on product type or general questions
    setQuoteFactors({
      'age': '',
      'location': '',
      'coverageAmount': '',
      // Add more dynamic factors based on product.category
    });
  };

  const handleQuoteFactorChange = (factor: string, value: string) => {
    setQuoteFactors(prev => ({ ...prev, [factor]: value }));
  };

  const submitQuoteRequest = () => {
    if (!selectedProductForQuote) return;

    const factors = Object.entries(quoteFactors).map(([key, value]) => ({ [key]: value }));

    getQuote({
      productType: selectedProductForQuote.category,
      factors: factors as any, // tRPC expects a specific type, casting for now
    });
  };

  const displayedProducts = products || [];

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Product Recommendation Quiz</CardTitle>
          <CardDescription>Answer a few questions to find the best insurance products for you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Example Quiz Questions */}
          <div>
            <label htmlFor="age" className="block text-sm font-medium text-gray-700">What is your age?</label>
            <Input
              id="age"
              type="number"
              value={quizAnswers.age || ''}
              onChange={(e) => handleQuizAnswerChange('age', e.target.value)}
              placeholder="e.g., 30"
              className="mt-1 block w-full"
            />
          </div>
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700">Where do you reside?</label>
            <Input
              id="location"
              type="text"
              value={quizAnswers.location || ''}
              onChange={(e) => handleQuizAnswerChange('location', e.target.value)}
              placeholder="e.g., Lagos, Nigeria"
              className="mt-1 block w-full"
            />
          </div>
          {/* More quiz questions can be added here */}
        </CardContent>
        <CardFooter>
          <Button onClick={() => toast.info('Quiz answers submitted!')}>Submit Quiz</Button>
        </CardFooter>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Explore Insurance Products</CardTitle>
          <CardDescription>Browse available products or filter by category and search term.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-4">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="flex-grow"
          />
          <Select onValueChange={handleCategoryChange} value={selectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="Auto">Auto</SelectItem>
              <SelectItem value="Health">Health</SelectItem>
              <SelectItem value="Property">Property</SelectItem>
              <SelectItem value="Travel">Travel</SelectItem>
              <SelectItem value="Life">Life</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {(productsLoading && true) ? (
        <div className="flex justify-center items-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedProducts.length > 0 ? (
            displayedProducts.map((product) => (
              <Card key={product.id}>
                <CardHeader>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>
                    <Badge variant="secondary">{product.category}</Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p>{product.description}</p>
                  <p className="text-sm text-gray-500 mt-2">Premium Range: ₦{product.minPremium.toLocaleString()} - ₦{product.maxPremium.toLocaleString()}</p>
                </CardContent>
                <CardFooter>
                  <Button onClick={() => handleGetQuote(product)}>Get Quote</Button>
                </CardFooter>
              </Card>
            ))
          ) : (
            <p className="col-span-full text-center text-gray-500">No products found matching your criteria.</p>
          )}
        </div>
      )}

      {/* Quote Dialog */}
      <Dialog open={!!selectedProductForQuote} onOpenChange={() => setSelectedProductForQuote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get a Quote for {selectedProductForQuote?.name}</DialogTitle>
            <DialogDescription>Please provide some details to get a personalized premium quote.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="quote-age" className="block text-sm font-medium text-gray-700">Your Age</label>
              <Input
                id="quote-age"
                type="number"
                value={quoteFactors.age || ''}
                onChange={(e) => handleQuoteFactorChange('age', e.target.value)}
                placeholder="e.g., 30"
                className="mt-1 block w-full"
              />
            </div>
            <div>
              <label htmlFor="quote-location" className="block text-sm font-medium text-gray-700">Your Location</label>
              <Input
                id="quote-location"
                type="text"
                value={quoteFactors.location || ''}
                onChange={(e) => handleQuoteFactorChange('location', e.target.value)}
                placeholder="e.g., Lagos"
                className="mt-1 block w-full"
              />
            </div>
            <div>
              <label htmlFor="quote-coverage" className="block text-sm font-medium text-gray-700">Desired Coverage Amount (₦)</label>
              <Input
                id="quote-coverage"
                type="number"
                value={quoteFactors.coverageAmount || ''}
                onChange={(e) => handleQuoteFactorChange('coverageAmount', e.target.value)}
                placeholder="e.g., 500000"
                className="mt-1 block w-full"
              />
            </div>
            {/* Display quote result if available */}
            {quoteLoading && (
              <div className="flex justify-center items-center">
                <Loader2 className="h-6 w-6 animate-spin mr-2" /> Generating Quote...
              </div>
            )}
            {quoteResult && (
              <Card className="mt-4 bg-green-50 border-green-200">
                <CardHeader>
                  <CardTitle className="text-green-700">Recommended Premium</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-800">₦{quoteResult.recommendedPremium?.toLocaleString() || 'N/A'}</p>
                  <p className="text-sm text-gray-600 mt-2">Factors considered: {quoteResult.factorsConsidered?.join(', ') || 'N/A'}</p>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProductForQuote(null)}>Cancel</Button>
            <Button onClick={submitQuoteRequest} disabled={quoteLoading}>
              {quoteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductRecommendationQuiz;