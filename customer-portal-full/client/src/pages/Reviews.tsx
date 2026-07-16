import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export default function Reviews() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5); // Display 5 reviews per page
  const [newReviewAuthor, setNewReviewAuthor] = useState('');
  const [newReviewRating, setNewReviewRating] = useState<number | ''>('');
  const [newReviewComment, setNewReviewComment] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const trpcUtils = trpc.useUtils();

  const { data: reviewsData, isLoading, isError, error } = trpc.reviews.list.useQuery(
    { page, limit: pageSize, search: searchTerm },
    { enabled: true }
  );

  const createReviewMutation = trpc.reviews.create.useMutation({
    onSuccess: () => {
      toast.success('Review added successfully!');
      trpcUtils.reviews.list.invalidate(); // Invalidate to refetch reviews
      setNewReviewAuthor('');
      setNewReviewRating('');
      setNewReviewComment('');
      setIsDialogOpen(false);
    },
    onError: (err) => {
      toast.error('Failed to add review', { description: err.message });
    },
  });

  const deleteReviewMutation = trpc.reviews.delete.useMutation({
    onSuccess: () => {
      toast.success('Review deleted successfully!');
      trpcUtils.reviews.list.invalidate(); // Invalidate to refetch reviews
    },
    onError: (err) => {
      toast.error('Failed to delete review', { description: err.message });
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error('Failed to fetch reviews', { description: error?.message });
    }
  }, [isError, error]);

  const handleCreateReview = () => {
    if (!newReviewAuthor || !newReviewRating || !newReviewComment) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (false) {
      const newId = String((reviewsData?.reviews?.length || 0) + 1);
      const newDemoReview: Review = {
        id: newId,
        author: newReviewAuthor,
        rating: newReviewRating,
        comment: newReviewComment,
        createdAt: new Date().toISOString(),
      };
      // persisted via tRPC mutation // Add to the beginning
      toast.success('Review added successfully!');
      setNewReviewAuthor('');
      setNewReviewRating('');
      setNewReviewComment('');
      setIsDialogOpen(false);
      return;
    }

    createReviewMutation.mutate({
      author: newReviewAuthor,
      rating: newReviewRating,
      comment: newReviewComment,
    });
  };

  const handleDeleteReview = (id: string) => {
    if (false) {
      // deleted via tRPC mutation
      toast.success('Review deleted successfully!');
      return;
    }
    deleteReviewMutation.mutate({ id });
  };

  const filteredDemoReviews = (reviewsData?.reviews || []).filter(
    (review) =>
      review.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.comment.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedDemoReviews = filteredDemoReviews.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const displayReviews = (reviewsData?.reviews || []);
  const totalReviews = (reviewsData?.totalCount || 0);
  const totalPages = Math.ceil(totalReviews / pageSize);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold">
        Please log in to view reviews.
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Customer Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <Input
              placeholder="Search reviews..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1); // Reset to first page on search
              }}
              className="max-w-sm"
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>Add New Review</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Review</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="author" className="text-right">
                      Author
                    </Label>
                    <Input
                      id="author"
                      value={newReviewAuthor}
                      onChange={(e) => setNewReviewAuthor(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="rating" className="text-right">
                      Rating
                    </Label>
                    <Select
                      value={String(newReviewRating)}
                      onValueChange={(value) => setNewReviewRating(Number(value))}
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select a rating" />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <SelectItem key={rating} value={String(rating)}>{rating} Star{rating > 1 ? 's' : ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="comment" className="text-right">
                      Comment
                    </Label>
                    <Textarea
                      id="comment"
                      value={newReviewComment}
                      onChange={(e) => setNewReviewComment(e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    onClick={handleCreateReview}
                    disabled={createReviewMutation.isLoading || !newReviewAuthor || !newReviewRating || !newReviewComment}
                  >
                    {(createReviewMutation.isLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Review
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading || deleteReviewMutation.isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Author</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Comment</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayReviews.length > 0 ? (
                  displayReviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell className="font-medium">{review.author}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{review.rating} Stars</Badge>
                      </TableCell>
                      <TableCell>{review.comment}</TableCell>
                      <TableCell>{new Date(review.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteReview(review.id)}
                          disabled={deleteReviewMutation.isLoading}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      No reviews found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-end items-center space-x-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1 || isLoading || deleteReviewMutation.isLoading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page === totalPages || isLoading || deleteReviewMutation.isLoading}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}