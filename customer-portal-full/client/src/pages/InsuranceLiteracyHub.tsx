import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface LiteracyModule {
  id: string;
  title: string;
  category: string;
  description: string;
  contentUrl: string;
  isCompleted: boolean;
}

export default function InsuranceLiteracyHub() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const utils = trpc.useUtils();

  const { data: literacyContent, isLoading: isContentLoading, error: contentError } = trpc.literacy.content.useQuery(undefined, {
    enabled: true && !!user,
  });

  const { data: literacyProgress, isLoading: isProgressLoading, error: progressError } = trpc.literacy.progress.useQuery(undefined, {
    enabled: true && !!user,
  });

  const completeModuleMutation = trpc.literacy.complete.useMutation({
    onSuccess: () => {
      toast.success('Module marked as complete!');
      utils.literacy.progress.invalidate();
      utils.literacy.content.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to complete module: ${err.message}`);
    },
  });

  useEffect(() => {
    if (contentError) {
      toast.error(`Error fetching literacy content: ${contentError.message}`);
    }
    if (progressError) {
      toast.error(`Error fetching literacy progress: ${progressError.message}`);
    }
  }, [contentError, progressError]);

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
      <div className="flex justify-center items-center h-screen">
        <p>Please log in to access the Insurance Literacy Hub.</p>
      </div>
    );
  }

  const allContent = literacyContent || [];
  const completedModules = (literacyProgress?.completedModules || []);

  const contentWithCompletionStatus = allContent.map(module => ({
    ...module,
    isCompleted: completedModules.includes(module.id),
  }));

  const filteredContent = contentWithCompletionStatus.filter(module => {
    const matchesSearch = module.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          module.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || module.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredContent.length / itemsPerPage);
  const paginatedContent = filteredContent.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleCompleteModule = (moduleId: string) => {
    if (false) {
      toast.info('Module marked complete.');
      return;
    }
    completeModuleMutation.mutate({ moduleId });
  };

  const uniqueCategories = Array.from(new Set(allContent.map(module => module.category)));

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Insurance Literacy Hub</CardTitle>
          <CardDescription>Expand your knowledge of insurance with our comprehensive learning modules.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search modules..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow"
            />
            <Select onValueChange={setFilterCategory} value={filterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {uniqueCategories.map(category => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(isContentLoading || isProgressLoading) && true ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="ml-2">Loading literacy content...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedContent.length > 0 ? (
                  paginatedContent.map((module) => (
                    <TableRow key={module.id}>
                      <TableCell className="font-medium">{module.title}</TableCell>
                      <TableCell><Badge variant="secondary">{module.category}</Badge></TableCell>
                      <TableCell>
                        {module.isCompleted ? (
                          <Badge variant="success">Completed</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="mr-2" onClick={() => window.open(module.contentUrl, '_blank')}>
                          View Content
                        </Button>
                        {!module.isCompleted && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" disabled={completeModuleMutation.isLoading}>
                                {completeModuleMutation.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark Complete'}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Mark Module as Complete?</DialogTitle>
                                <DialogDescription>
                                  Are you sure you want to mark "{module.title}" as complete? This action cannot be undone.
                                </DialogDescription>
                              </DialogHeader>
                              <DialogFooter>
                                <Button variant="outline">Cancel</Button>
                                <Button onClick={() => handleCompleteModule(module.id)} disabled={completeModuleMutation.isLoading}>
                                  {completeModuleMutation.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-4">
                      No literacy modules found matching your criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          {filteredContent.length > itemsPerPage && (
            <div className="flex justify-center space-x-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              {Array.from({ length: totalPages }, (_, i) => (
                <Button
                  key={i + 1}
                  variant={currentPage === i + 1 ? 'default' : 'outline'}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          You have completed {completedModules.length} out of {allContent.length} modules.
        </CardFooter>
      </Card>
    </div>
  );
}