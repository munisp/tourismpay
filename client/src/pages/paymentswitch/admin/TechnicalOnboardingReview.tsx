// @ts-nocheck
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  FileText,
  Shield,
  Network,
  AlertCircle,
} from 'lucide-react';

export default function TechnicalOnboardingReview() {
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'corrections' | null>(
    null
  );
  const [reviewComments, setReviewComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch pending reviews
  const { data: pendingReviews, isLoading, refetch } = trpc.technicalOnboarding.listPendingReviews.useQuery();

  // Review mutation
  const reviewMutation = trpc.technicalOnboarding.reviewTechnicalOnboarding.useMutation({
    onSuccess: () => {
      toast.success('Review submitted successfully');
      setReviewDialogOpen(false);
      setSelectedReview(null);
      setReviewComments('');
      setReviewAction(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Review failed: ${error.message}`);
    },
  });

  const handleViewDetails = (review: any) => {
    setSelectedReview(review);
    setReviewDialogOpen(true);
  };

  const handleReviewAction = (action: 'approve' | 'reject' | 'corrections') => {
    setReviewAction(action);
  };

  const handleSubmitReview = async () => {
    if (!selectedReview || !reviewAction) return;

    if ((reviewAction === 'reject' || reviewAction === 'corrections') && !reviewComments.trim()) {
      toast.error('Please provide comments for rejection or correction requests');
      return;
    }

    setIsSubmitting(true);
    try {
      await reviewMutation.mutateAsync({
        reviewId: selectedReview.id,
        status: reviewAction === 'approve' ? 'approved' : reviewAction === 'reject' ? 'rejected' : 'corrections_requested',
        comments: reviewComments || undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Technical Onboarding Reviews</h1>
        <p className="text-muted-foreground">
          Review and approve participant technical onboarding submissions
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Reviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <span className="text-2xl font-bold">
                {pendingReviews?.filter((r) => r.status === 'pending').length || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="text-2xl font-bold">
                {pendingReviews?.filter((r) => r.status === 'approved').length || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Corrections Requested
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <span className="text-2xl font-bold">
                {pendingReviews?.filter((r) => r.status === 'corrections_requested').length || 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="text-2xl font-bold">
                {pendingReviews?.filter((r) => r.status === 'rejected').length || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews Table */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Submissions</CardTitle>
          <CardDescription>
            Review technical configurations, security credentials, and network settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingReviews || pendingReviews.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No submissions to review</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application ID</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Configurations</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="font-mono text-sm">
                      #{review.applicationId}
                    </TableCell>
                    <TableCell className="font-medium">
                      {review.organizationName || 'Unknown Organization'}
                    </TableCell>
                    <TableCell>
                      {new Date(review.submittedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          review.status === 'approved'
                            ? 'default'
                            : review.status === 'rejected'
                            ? 'destructive'
                            : review.status === 'corrections_requested'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {review.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {review.status === 'approved' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {review.status === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                        {review.status === 'corrections_requested' && (
                          <AlertCircle className="w-3 h-3 mr-1" />
                        )}
                        {review.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {review.technicalConfig && (
                          <FileText className="w-4 h-4 text-blue-600" />
                        )}
                        {review.securityCreds && (
                          <Shield className="w-4 h-4 text-green-600" />
                        )}
                        {review.networkConfig && (
                          <Network className="w-4 h-4 text-purple-600" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(review)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Technical Onboarding Review</DialogTitle>
            <DialogDescription>
              Application #{selectedReview?.applicationId} - {selectedReview?.organizationName}
            </DialogDescription>
          </DialogHeader>

          {selectedReview && (
            <div className="space-y-6">
              {/* Technical Configuration */}
              {selectedReview.technicalConfig && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Technical Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Primary Endpoint</Label>
                        <p className="font-mono text-sm">
                          {selectedReview.technicalConfig.primaryEndpoint}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Backup Endpoint</Label>
                        <p className="font-mono text-sm">
                          {selectedReview.technicalConfig.backupEndpoint || 'Not configured'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Webhook URL</Label>
                        <p className="font-mono text-sm">
                          {selectedReview.technicalConfig.webhookUrl || 'Not configured'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Transaction Capacity</Label>
                        <p className="font-medium">
                          {selectedReview.technicalConfig.transactionCapacity} TPS
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Supported Formats</Label>
                        <p className="text-sm">
                          {selectedReview.technicalConfig.supportedFormats
                            ? JSON.parse(selectedReview.technicalConfig.supportedFormats).join(', ')
                            : 'None'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Protocols</Label>
                        <p className="text-sm">
                          {selectedReview.technicalConfig.protocols
                            ? JSON.parse(selectedReview.technicalConfig.protocols).join(', ')
                            : 'None'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Transaction Limits</Label>
                        <p className="text-sm">
                          Min: {selectedReview.technicalConfig.minTransactionAmount} | Max:{' '}
                          {selectedReview.technicalConfig.maxTransactionAmount}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Daily Limit</Label>
                        <p className="text-sm">
                          {selectedReview.technicalConfig.dailyTransactionLimit}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Security Credentials */}
              {selectedReview.securityCreds && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Security Credentials
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">SSL Certificate</Label>
                        <p className="text-sm">
                          {selectedReview.securityCreds.sslCertificate ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Provided
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600">
                              <XCircle className="w-3 h-3 mr-1" />
                              Missing
                            </Badge>
                          )}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">API Key</Label>
                        <p className="font-mono text-xs">
                          {selectedReview.securityCreds.apiKey
                            ? `${selectedReview.securityCreds.apiKey.substring(0, 20)}...`
                            : 'Not generated'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">OAuth Client ID</Label>
                        <p className="text-sm">
                          {selectedReview.securityCreds.oauthClientId || 'Not configured'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">HSM Enabled</Label>
                        <p className="text-sm">
                          {selectedReview.securityCreds.hsmEnabled ? 'Yes' : 'No'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Network Configuration */}
              {selectedReview.networkConfig && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Network className="w-5 h-5" />
                      Network Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">VPN Required</Label>
                        <p className="text-sm">
                          {selectedReview.networkConfig.vpnRequired ? 'Yes' : 'No'}
                        </p>
                      </div>
                      {selectedReview.networkConfig.vpnRequired && (
                        <>
                          <div>
                            <Label className="text-muted-foreground">VPN Type</Label>
                            <p className="text-sm">{selectedReview.networkConfig.vpnType}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">VPN Endpoint</Label>
                            <p className="font-mono text-sm">
                              {selectedReview.networkConfig.vpnEndpoint}
                            </p>
                          </div>
                        </>
                      )}
                      <div>
                        <Label className="text-muted-foreground">Load Balancer</Label>
                        <p className="font-mono text-sm">
                          {selectedReview.networkConfig.loadBalancerEndpoint || 'Not configured'}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Health Check URL</Label>
                        <p className="font-mono text-sm">
                          {selectedReview.networkConfig.healthCheckUrl}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Timeout</Label>
                        <p className="text-sm">
                          {selectedReview.networkConfig.timeoutSeconds} seconds
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Previous Review Comments */}
              {selectedReview.reviewComments && (
                <Card className="border-orange-200 bg-orange-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-orange-900">
                      <AlertCircle className="w-5 h-5" />
                      Previous Review Comments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-orange-900">{selectedReview.reviewComments}</p>
                  </CardContent>
                </Card>
              )}

              {/* Review Actions */}
              {selectedReview.status === 'pending' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reviewComments">Review Comments</Label>
                    <Textarea
                      id="reviewComments"
                      placeholder="Add comments or feedback for the participant..."
                      rows={4}
                      value={reviewComments}
                      onChange={(e) => setReviewComments(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => handleReviewAction('approve')}
                      disabled={reviewAction !== null && reviewAction !== 'approve'}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleReviewAction('corrections')}
                      disabled={reviewAction !== null && reviewAction !== 'corrections'}
                    >
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Request Corrections
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleReviewAction('reject')}
                      disabled={reviewAction !== null && reviewAction !== 'reject'}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            {reviewAction && (
              <Button onClick={handleSubmitReview} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  `Submit ${reviewAction === 'approve' ? 'Approval' : reviewAction === 'reject' ? 'Rejection' : 'Correction Request'}`
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
