import React, { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface PremiumRate {
  id: string;
  productType: string;
  ageGroup: string;
  gender: 'Male' | 'Female' | 'Other';
  rate: number;
  effectiveDate: string;
  status: 'Active' | 'Inactive' | 'Pending';
}

const PremiumRateManagement: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterProductType, setFilterProductType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<PremiumRate | null>(null);
  const [newRateData, setNewRateData] = useState({
    productType: '',
    ageGroup: '',
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    rate: 0,
    effectiveDate: '',
    status: 'Active' as 'Active' | 'Inactive' | 'Pending',
  });

  const { data: premiumRates, isLoading, isError, error } = trpc.premiumRates.list.useQuery(undefined, {
    enabled: true,
  });

  const createMutation = trpc.premiumRates.create.useMutation({
    onSuccess: () => {
      toast.success('Premium rate created successfully!');
      utils.premiumRates.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(`Failed to create premium rate: ${err.message}`);
    },
  });

  const updateMutation = trpc.premiumRates.update.useMutation({
    onSuccess: () => {
      toast.success('Premium rate updated successfully!');
      utils.premiumRates.list.invalidate();
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(`Failed to update premium rate: ${err.message}`);
    },
  });

  const deleteMutation = trpc.premiumRates.delete.useMutation({
    onSuccess: () => {
      toast.success('Premium rate deleted successfully!');
      utils.premiumRates.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to delete premium rate: ${err.message}`);
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error(`Error fetching premium rates: ${error?.message}`);
    }
  }, [isError, error]);

  const dataToDisplay = premiumRates || [];

  const filteredRates = useMemo(() => {
    return dataToDisplay.filter((rate: any) => {
      const matchesSearch = rate?.productType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          rate?.ageGroup?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProductType = filterProductType === 'all' || rate?.productType === filterProductType;
      const matchesStatus = filterStatus === 'all' || rate?.status === filterStatus;
      return matchesSearch && matchesProductType && matchesStatus;
    });
  }, [dataToDisplay, searchQuery, filterProductType, filterStatus]);

  const totalPages = Math.ceil(filteredRates.length / itemsPerPage);
  const paginatedRates = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredRates.slice(startIndex, endIndex);
  }, [filteredRates, currentPage, itemsPerPage]);

  const productTypes = useMemo(() => {
    const types = new Set(dataToDisplay.map((rate: any) => rate?.productType));
    return ['all', ...Array.from(types)];
  }, [dataToDisplay]);

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
        You are not authorized to view this page. Please log in.
      </div>
    );
  }

  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewRateData((prev) => ({
      ...prev,
      [name]: name === 'rate' ? parseFloat(value) : value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setNewRateData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setEditingRate(null);
    setNewRateData({
      productType: '',
      ageGroup: '',
      gender: 'Male',
      rate: 0,
      effectiveDate: '',
      status: 'Active',
    });
  };

  const handleCreateOrUpdate = () => {
    if (editingRate) {
      updateMutation.mutate({
        id: editingRate.id,
        ...newRateData,
      });
    } else {
      createMutation.mutate(newRateData);
    }
  };

  const handleEditClick = (rate: PremiumRate) => {
    setEditingRate(rate);
    setNewRateData({
      productType: rate.productType,
      ageGroup: rate.ageGroup,
      gender: rate.gender,
      rate: rate.rate,
      effectiveDate: rate.effectiveDate,
      status: rate.status,
    });
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    if (window.confirm('Are you sure you want to delete this premium rate?')) {
      deleteMutation.mutate({ id });
    }
  };

  const statuses = ['all', 'Active', 'Inactive', 'Pending'];

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Premium Rate Management</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>Add New Rate</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingRate ? 'Edit Premium Rate' : 'Add New Premium Rate'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  name="productType"
                  placeholder="Product Type"
                  value={newRateData.productType}
                  onChange={handleInputChange}
                  className="col-span-4"
                />
                <Input
                  name="ageGroup"
                  placeholder="Age Group (e.g., 18-30)"
                  value={newRateData.ageGroup}
                  onChange={handleInputChange}
                  className="col-span-4"
                />
                <Select name="gender" value={newRateData.gender} onValueChange={(value) => handleSelectChange('gender', value as 'Male' | 'Female' | 'Other')}>
                  <SelectTrigger className="col-span-4">
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  name="rate"
                  type="number"
                  placeholder="Rate (e.g., 0.0015)"
                  value={newRateData.rate}
                  onChange={handleInputChange}
                  className="col-span-4"
                />
                <Input
                  name="effectiveDate"
                  type="date"
                  placeholder="Effective Date"
                  value={newRateData.effectiveDate}
                  onChange={handleInputChange}
                  className="col-span-4"
                />
                <Select name="status" value={newRateData.status} onValueChange={(value) => handleSelectChange('status', value as 'Active' | 'Inactive' | 'Pending')}>
                  <SelectTrigger className="col-span-4">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  onClick={handleCreateOrUpdate}
                  disabled={createMutation.isLoading || updateMutation.isLoading}
                >
                  {(createMutation.isLoading || updateMutation.isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingRate ? 'Save Changes' : 'Create Rate'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <Input
              placeholder="Search by Product or Age Group..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm flex-grow"
            />
            <Select value={filterProductType} onValueChange={setFilterProductType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Product Type" />
              </SelectTrigger>
              <SelectContent>
                {productTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type === 'all' ? 'All Product Types' : type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status === 'all' ? 'All Statuses' : status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Age Group</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRates.length > 0 ? (
                    paginatedRates.map((rate) => (
                      <TableRow key={rate.id}>
                        <TableCell className="font-medium">{rate.productType}</TableCell>
                        <TableCell>{rate.ageGroup}</TableCell>
                        <TableCell>{rate.gender}</TableCell>
                        <TableCell>{(rate.rate * 100).toFixed(4)}%</TableCell>
                        <TableCell>{rate.effectiveDate}</TableCell>
                        <TableCell>
                          <Badge variant={rate.status === 'Active' ? 'default' : rate.status === 'Pending' ? 'secondary' : 'destructive'}>
                            {rate.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleEditClick(rate)}>
                            Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteClick(rate.id)} disabled={deleteMutation.isLoading}>
                            {deleteMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        No premium rates found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button
              variant="outline"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PremiumRateManagement;