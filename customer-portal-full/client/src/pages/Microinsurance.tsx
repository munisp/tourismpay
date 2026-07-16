import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface MicroinsuranceProduct {
  id: string;
  name: string;
  description: string;
  premium: number;
  coverage: string;
  eligibility: string;
  provider: string;
}

const MicroinsurancePage: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<MicroinsuranceProduct | null>(null);

  const { data: products, isLoading, isError, error } = trpc.microinsurance.products.useQuery();
  const enrollMutation = trpc.microinsurance.enroll.useMutation({
    onSuccess: () => {
      toast.success('Successfully enrolled in microinsurance product!');
      trpc.useUtils().microinsurance.products.invalidate();
      setSelectedProduct(null);
    },
    onError: (err) => {
      toast.error(`Enrollment failed: ${err.message}`);
    },
  });

  if (isAuthLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex justify-center items-center h-screen text-red-500">
        <p>You must be logged in to view this page.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading microinsurance products...</p>
      </div>
    );
  }

  if (isError) {
    toast.error(`Failed to load products: ${error?.message}`);
  }

  const displayedProducts = products || [];

  const filteredProducts = displayedProducts.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEnroll = (productId: string) => {
    if (false) {
      toast.info('Enrollment initiated.');
      toast.success(`Successfully simulated enrollment for product ID: ${productId}`);
      return;
    }
    enrollMutation.mutate({ productId });
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Microinsurance Products</h1>

      <div className="flex justify-between items-center mb-4">
        <Input
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </div>



      {filteredProducts.length === 0 ? (
        <p className="text-center text-gray-500">No microinsurance products found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>{product.provider}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-2">{product.description}</p>
                <p className="font-semibold">Premium: NGN {product.premium.toLocaleString()}</p>
                <p className="text-sm">Coverage: {product.coverage}</p>
                <p className="text-sm">Eligibility: {product.eligibility}</p>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button onClick={() => setSelectedProduct(product)}>Enroll Now</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Confirm Enrollment</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to enroll in the <strong>{selectedProduct?.name}</strong> product?
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <p><strong>Product:</strong> {selectedProduct?.name}</p>
                      <p><strong>Premium:</strong> NGN {selectedProduct?.premium.toLocaleString()}</p>
                      <p><strong>Coverage:</strong> {selectedProduct?.coverage}</p>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSelectedProduct(null)}>Cancel</Button>
                      <Button
                        onClick={() => selectedProduct && handleEnroll(selectedProduct.id)}
                        disabled={enrollMutation.isLoading}
                      >
                        {enrollMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MicroinsurancePage;