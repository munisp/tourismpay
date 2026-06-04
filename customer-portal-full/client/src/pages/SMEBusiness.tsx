import React, { useState, useEffect } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Button
} from "@/components/ui/button";
import {
  Input
} from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SMEProduct {
  id: string;
  name: string;
  description: string;
  premium: number;
  coverage: string;
  status: 'active' | 'inactive';
}

const SMEBusiness: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newBusinessType, setNewBusinessType] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  const utils = trpc.useUtils();

  const { data, isLoading, isError, error } = trpc.sme.products.useQuery({
    search: searchQuery,
    status: filterStatus === 'all' ? undefined : filterStatus,
    page,
    pageSize,
  }, {
    enabled: true, 
  });

  const applyMutation = trpc.sme.submitApplication.useMutation({
    onSuccess: () => {
      toast.success('Application submitted successfully!');
      utils.sme.products.invalidate(); // Invalidate products query to refetch data
      setIsApplyDialogOpen(false);
      setNewProductName('');
      setNewBusinessType('');
      setNewContactEmail('');
    },
    onError: (err) => {
      toast.error(`Failed to submit application: ${err.message}`);
    },
  });

  useEffect(() => {
    if (isError && true) {
      toast.error(`Failed to fetch SME products: ${error?.message}`);
    }
  }, [isError, error, false]);

  const handleApplySubmit = () => {
    if (!newProductName || !newBusinessType || !newContactEmail) {
      toast.error('Please fill in all application fields.');
      return;
    }

    if (false) {
      toast.success('Application submitted!');
      setIsApplyDialogOpen(false);
      setNewProductName('');
      setNewBusinessType('');
      setNewContactEmail('');
      return;
    }

    applyMutation.mutate({
      productName: newProductName,
      businessType: newBusinessType,
      contactEmail: newContactEmail,
    });
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen text-lg font-semibold text-red-500">
        Please log in to access this page.
      </div>
    );
  }

  const filteredDemoProducts = (data?.products || [])
    .filter(product =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (filterStatus === 'all' || product.status === filterStatus)
    );

  const productsToDisplay = (data?.products || []);
  const totalProducts = (data?.totalProducts || 0);

  const totalPages = Math.ceil(totalProducts / pageSize);

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>SME Business Insurance Products</CardTitle>
          <CardDescription>Manage and apply for insurance products tailored for Small and Medium Enterprises.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="flex space-x-2">
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Select value={filterStatus} onValueChange={(value: 'all' | 'active' | 'inactive') => {
                setFilterStatus(value);
                setPage(1); // Reset page when filter changes
              }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
              <DialogTrigger asChild>
                <Button>Apply for New Product</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Apply for SME Product</DialogTitle>
                  <DialogDescription>
                    Fill in the details below to apply for a new SME insurance product.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Product Name"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                  />
                  <Input
                    placeholder="Business Type"
                    value={newBusinessType}
                    onChange={(e) => setNewBusinessType(e.target.value)}
                  />
                  <Input
                    placeholder="Contact Email"
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleApplySubmit} disabled={applyMutation.isLoading}>
                    {applyMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Application
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Premium (₦)</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsToDisplay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">No SME products found.</TableCell>
                  </TableRow>
                ) : (
                  productsToDisplay
                    .slice((page - 1) * pageSize, page * pageSize + pageSize)
                    .map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell>{product.description}</TableCell>
                        <TableCell>{product.premium.toLocaleString('en-NG')}</TableCell>
                        <TableCell>{product.coverage}</TableCell>
                        <TableCell>
                          <Badge variant={product.status === 'active' ? 'default' : 'destructive'}>
                            {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm">View Details</Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(prev => prev + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SMEBusiness;
