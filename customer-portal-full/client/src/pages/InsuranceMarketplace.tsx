import React, { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  provider: string;
}

const InsuranceMarketplace: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const utils = trpc.useUtils();

  // Fetch products
  const { data: productsData, isLoading: productsLoading, error: productsError } = trpc.marketplace.products.useQuery(
    { category: selectedCategory === 'all' ? undefined : selectedCategory, search: searchQuery },
    { enabled: isAuthenticated }
  );

  // Purchase mutation
  const purchaseMutation = trpc.marketplace.purchase.useMutation({
    onSuccess: () => {
      toast.success('Product purchased successfully!');
      utils.marketplace.products.invalidate(); // Invalidate products list to reflect changes if any
    },
    onError: (err) => {
      toast.error(`Purchase failed: ${err.message}`);
    },
  });

  useEffect(() => {
    if (productsError) {
      toast.error(`Failed to load products: ${productsError.message}`);
    }
  }, [productsError]);

  const handlePurchase = (productId: string) => {
    if (!isAuthenticated) {
      toast.error('You must be logged in to purchase products.');
      return;
    }
    purchaseMutation.mutate({ productId });
  };

  const filteredProducts = productsData || [];

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const categories = Array.from(new Set((productsData || []).map(p => p.category)));

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>Please log in to view the insurance marketplace.</CardDescription>
          </CardHeader>
          <CardContent>
            <p>You need to be authenticated to access this page.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => toast.info('Login functionality not implemented in this demo.')}>Login</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Insurance Marketplace</h1>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1); // Reset pagination on search
          }}
          className="flex-grow"
        />
        <Select onValueChange={(value) => {
          setSelectedCategory(value);
          setCurrentPage(1); // Reset pagination on category change
        }} value={selectedCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(productsLoading && true) ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="ml-2">Loading products...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paginatedProducts.length > 0 ? (
            paginatedProducts.map((product) => (
              <Card key={product.id}>
                <CardHeader>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.provider}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                  <Badge variant="secondary">{product.category}</Badge>
                  <p className="text-lg font-semibold mt-2">₦{product.price.toLocaleString()}</p>
                </CardContent>
                <CardFooter className="flex justify-end">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>View Details</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{product.name}</DialogTitle>
                        <DialogDescription>{product.provider}</DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <p className="mb-2"><strong>Category:</strong> {product.category}</p>
                        <p className="mb-2"><strong>Description:</strong> {product.description}</p>
                        <p className="mb-2"><strong>Price:</strong> ₦{product.price.toLocaleString()}</p>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => handlePurchase(product.id)}
                          disabled={purchaseMutation.isLoading}
                        >
                          {purchaseMutation.isLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Purchase
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardFooter>
              </Card>
            ))
          ) : (
            <p className="col-span-full text-center text-gray-500">No products found.</p>
          )}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredProducts.length > itemsPerPage && (
        <div className="flex justify-center items-center gap-4 mt-8">
          <Button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span>Page {currentPage} of {totalPages}</span>
          <Button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default InsuranceMarketplace;