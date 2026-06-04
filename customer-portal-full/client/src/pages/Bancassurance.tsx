import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Button
} from '@/components/ui/button';
import {
  Input
} from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from '@/components/ui/dialog';

interface BancassuranceProduct {
  id: string;
  name: string;
  bankPartner: string;
  description: string;
  interestRate: number;
  minDeposit: number;
}

const Bancassurance: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBank, setSelectedBank] = useState<string | undefined>(undefined);
  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [productToApply, setProductToApply] = useState<BancassuranceProduct | null>(null);
  const [applicationDetails, setApplicationDetails] = useState({
    fullName: '',
    email: '',
    phone: '',
  });

  const { data: products, isLoading, isError, error } = trpc.bancassurance.products.useQuery();
  const applyMutation = trpc.bancassurance.submitApplication.useMutation({
    onSuccess: () => {
      toast.success('Application submitted successfully!');
      setIsApplyDialogOpen(false);
      setApplicationDetails({ fullName: '', email: '', phone: '' });
      // Invalidate products query to reflect any potential changes (e.g., if applying affects product availability)
      trpc.useUtils().bancassurance.products.invalidate();
    },
    onError: (err) => {
      toast.error(`Application failed: ${err.message}`);
    },
  });

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <p className="text-center text-red-500">Please log in to access Bancassurance products.</p>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError) {
    toast.error(`Failed to load products: ${error?.message}`);
    return <p className="text-center text-red-500">Error loading bancassurance products.</p>;
  }

  const availableProducts = products || [];

  const filteredProducts = availableProducts.filter(product => {
    const matchesSearch = searchTerm === '' ||
      product?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product?.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product?.bankPartner?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBank = selectedBank === undefined || selectedBank === '' || product.bankPartner === selectedBank;
    return matchesSearch && matchesBank;
  });

  const handleApplyClick = (product: BancassuranceProduct) => {
    setProductToApply(product);
    setIsApplyDialogOpen(true);
  };

  const handleApplicationSubmit = () => {
    if (productToApply) {
      applyMutation.mutate({
        productId: productToApply.id,
        ...applicationDetails,
      });
    }
  };

  const uniqueBankPartners = Array.from(new Set(availableProducts.map(p => p.bankPartner)));

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bancassurance Products</CardTitle>
          <CardDescription>Explore insurance products offered in partnership with banks.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow"
            />
            <Select onValueChange={setSelectedBank} value={selectedBank}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Bank" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Banks</SelectItem>
                {uniqueBankPartners.map(bank => (
                  <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredProducts.length === 0 ? (
            <p className="text-center text-gray-500">No products found matching your criteria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Bank Partner</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Interest Rate</TableHead>
                  <TableHead>Min Deposit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.bankPartner}</TableCell>
                    <TableCell>{product.description}</TableCell>
                    <TableCell>{(product.interestRate * 100).toFixed(2)}%</TableCell>
                    <TableCell>₦{product?.minDeposit?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => handleApplyClick(product)}
                        disabled={applyMutation.isLoading}
                      >
                        {applyMutation.isLoading && productToApply?.id === product.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Apply Now
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for {productToApply?.name}</DialogTitle>
            <DialogDescription>
              Please fill in your details to apply for this bancassurance product.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              placeholder="Full Name"
              value={applicationDetails.fullName}
              onChange={(e) => setApplicationDetails({ ...applicationDetails, fullName: e.target.value })}
            />
            <Input
              placeholder="Email"
              type="email"
              value={applicationDetails.email}
              onChange={(e) => setApplicationDetails({ ...applicationDetails, email: e.target.value })}
            />
            <Input
              placeholder="Phone Number"
              type="tel"
              value={applicationDetails.phone}
              onChange={(e) => setApplicationDetails({ ...applicationDetails, phone: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApplyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleApplicationSubmit} disabled={applyMutation.isLoading || !applicationDetails.fullName || !applicationDetails.email || !applicationDetails.phone}>
              {applyMutation.isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Bancassurance;
