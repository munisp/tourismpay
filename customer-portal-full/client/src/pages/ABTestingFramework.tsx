import React, { useState, useMemo } from 'react';
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface ABTest {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft' | 'completed';
  startDate: string;
  endDate: string;
  variantA: string;
  variantB: string;
  conversionRateA: number;
  conversionRateB: number;
}

const ABTestingFramework: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const utils = trpc.useUtils();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'draft' | 'completed'>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentABTest, setCurrentABTest] = useState<ABTest | null>(null);

  const [newABTest, setNewABTest] = useState<Omit<ABTest, 'id' | 'conversionRateA' | 'conversionRateB'>>({
    name: '',
    description: '',
    status: 'draft',
    startDate: '',
    endDate: '',
    variantA: '',
    variantB: '',
  });

  const { data: abTests, isLoading, isError, error } = trpc.abTesting.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createMutation = trpc.abTesting.create.useMutation({
    onSuccess: () => {
      toast.success('A/B Test created successfully!');
      utils.abTesting.list.invalidate();
      setIsCreateDialogOpen(false);
      setNewABTest({
        name: '',
        description: '',
        status: 'draft',
        startDate: '',
        endDate: '',
        variantA: '',
        variantB: '',
      });
    },
    onError: (err) => {
      toast.error(`Failed to create A/B Test: ${err.message}`);
    },
  });

  const updateMutation = trpc.abTesting.update.useMutation({
    onSuccess: () => {
      toast.success('A/B Test updated successfully!');
      utils.abTesting.list.invalidate();
      setIsEditDialogOpen(false);
      setCurrentABTest(null);
    },
    onError: (err) => {
      toast.error(`Failed to update A/B Test: ${err.message}`);
    },
  });

  const deleteMutation = trpc.abTesting.delete.useMutation({
    onSuccess: () => {
      toast.success('A/B Test deleted successfully!');
      utils.abTesting.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to delete A/B Test: ${err.message}`);
    },
  });

  const dataToDisplay = useMemo(() => {
    const sourceData = abTests || [];

    let filteredData = sourceData.filter(test =>
      test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filterStatus !== 'all') {
      filteredData = filteredData.filter(test => test.status === filterStatus);
    }

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredData.slice(startIndex, endIndex);
  }, [abTests, searchTerm, filterStatus, page, pageSize]);

  const totalPages = useMemo(() => {
    const sourceData = abTests || [];
    let filteredData = sourceData.filter(test =>
      test.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      test.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filterStatus !== 'all') {
      filteredData = filteredData.filter(test => test.status === filterStatus);
    }
    return Math.ceil(filteredData.length / pageSize);
  }, [abTests, searchTerm, filterStatus, pageSize]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen text-lg font-semibold text-red-500">
        Please log in to access the A/B Testing Framework.
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-screen text-lg font-semibold text-red-500">
        Error loading A/B tests: {error?.message}
      </div>
    );
  }

  const handleCreateABTest = () => {
    createMutation.mutate(newABTest);
  };

  const handleUpdateABTest = () => {
    if (currentABTest) {
      updateMutation.mutate(currentABTest);
    }
  };

  const handleDeleteABTest = (id: string) => {
    deleteMutation.mutate({ id });
  };

  const handleEditClick = (test: ABTest) => {
    setCurrentABTest(test);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">A/B Testing Framework</CardTitle>
          <CardDescription>Manage and analyze your A/B tests to optimize user experience and conversion rates.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 space-y-4 md:space-y-0">
            <div className="flex w-full md:w-auto space-x-2">
              <Input
                placeholder="Search A/B tests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
              <Select value={filterStatus} onValueChange={(value: 'all' | 'active' | 'inactive' | 'draft' | 'completed') => setFilterStatus(value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Create New A/B Test</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Create A/B Test</DialogTitle>
                  <DialogDescription>Fill in the details for your new A/B test.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Test Name"
                    value={newABTest.name}
                    onChange={(e) => setNewABTest({ ...newABTest, name: e.target.value })}
                  />
                  <Input
                    placeholder="Description"
                    value={newABTest.description}
                    onChange={(e) => setNewABTest({ ...newABTest, description: e.target.value })}
                  />
                  <Select value={newABTest.status} onValueChange={(value: 'active' | 'inactive' | 'draft' | 'completed') => setNewABTest({ ...newABTest, status: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    placeholder="Start Date"
                    value={newABTest.startDate}
                    onChange={(e) => setNewABTest({ ...newABTest, startDate: e.target.value })}
                  />
                  <Input
                    type="date"
                    placeholder="End Date"
                    value={newABTest.endDate}
                    onChange={(e) => setNewABTest({ ...newABTest, endDate: e.target.value })}
                  />
                  <Input
                    placeholder="Variant A Name"
                    value={newABTest.variantA}
                    onChange={(e) => setNewABTest({ ...newABTest, variantA: e.target.value })}
                  />
                  <Input
                    placeholder="Variant B Name"
                    value={newABTest.variantB}
                    onChange={(e) => setNewABTest({ ...newABTest, variantB: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateABTest} disabled={createMutation.isLoading}>
                    {createMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Variant A</TableHead>
                  <TableHead>Variant B</TableHead>
                  <TableHead>Conversion A</TableHead>
                  <TableHead>Conversion B</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dataToDisplay.map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="font-medium">{test.name}</TableCell>
                    <TableCell>{test.description}</TableCell>
                    <TableCell>
                      <Badge variant={test.status === 'active' ? 'default' : test.status === 'completed' ? 'secondary' : 'outline'}>
                        {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{test.startDate}</TableCell>
                    <TableCell>{test.endDate}</TableCell>
                    <TableCell>{test.variantA}</TableCell>
                    <TableCell>{test.variantB}</TableCell>
                    <TableCell>{(test.conversionRateA * 100).toFixed(2)}%</TableCell>
                    <TableCell>{(test.conversionRateB * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-right">
                      <Dialog open={isEditDialogOpen && currentABTest?.id === test.id} onOpenChange={setIsEditDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => handleEditClick(test)}>Edit</Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Edit A/B Test</DialogTitle>
                            <DialogDescription>Make changes to the A/B test details.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <Input
                              placeholder="Test Name"
                              value={currentABTest?.name || ''}
                              onChange={(e) => setCurrentABTest(prev => prev ? { ...prev, name: e.target.value } : null)}
                            />
                            <Input
                              placeholder="Description"
                              value={currentABTest?.description || ''}
                              onChange={(e) => setCurrentABTest(prev => prev ? { ...prev, description: e.target.value } : null)}
                            />
                            <Select value={currentABTest?.status} onValueChange={(value: 'active' | 'inactive' | 'draft' | 'completed') => setCurrentABTest(prev => prev ? { ...prev, status: value } : null)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="draft">Draft</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="date"
                              placeholder="Start Date"
                              value={currentABTest?.startDate || ''}
                              onChange={(e) => setCurrentABTest(prev => prev ? { ...prev, startDate: e.target.value } : null)}
                            />
                            <Input
                              type="date"
                              placeholder="End Date"
                              value={currentABTest?.endDate || ''}
                              onChange={(e) => setCurrentABTest(prev => prev ? { ...prev, endDate: e.target.value } : null)}
                            />
                            <Input
                              placeholder="Variant A Name"
                              value={currentABTest?.variantA || ''}
                              onChange={(e) => setCurrentABTest(prev => prev ? { ...prev, variantA: e.target.value } : null)}
                            />
                            <Input
                              placeholder="Variant B Name"
                              value={currentABTest?.variantB || ''}
                              onChange={(e) => setCurrentABTest(prev => prev ? { ...prev, variantB: e.target.value } : null)}
                            />
                          </div>
                          <DialogFooter>
                            <Button onClick={handleUpdateABTest} disabled={updateMutation.isLoading}>
                              {updateMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="destructive" size="sm" className="ml-2"
                        onClick={() => handleDeleteABTest(test.id)}
                        disabled={deleteMutation.isLoading}
                      >
                        {deleteMutation.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {dataToDisplay.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-4 text-muted-foreground">
                      No A/B tests found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ABTestingFramework;