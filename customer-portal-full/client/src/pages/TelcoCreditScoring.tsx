import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface TelcoCreditScoreData {
  score: number;
  grade: string;
  recommendations: string[];
  lastUpdated: string;
}

const TelcoCreditScoring: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [isApplyDialogOpen, setIsApplyDialogOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [consent, setConsent] = useState(false);

  const { data: scoreData, isLoading: isScoreLoading, error: scoreError } = trpc.telcoCredit.score.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { mutate: applyForScore, isLoading: isApplyLoading } = trpc.telcoCredit.submitApplication.useMutation({
    onSuccess: () => {
      toast.success('Telco credit score application submitted successfully!');
      utils.telcoCredit.score.invalidate();
      setIsApplyDialogOpen(false);
      setPhoneNumber('');
      setConsent(false);
    },
    onError: (err) => {
      toast.error(`Failed to submit application: ${err.message}`);
    },
  });

  React.useEffect(() => {
    if (scoreError) {
      toast.error(`Failed to fetch telco credit score: ${scoreError.message}`);
    }
  }, [scoreError]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-lg font-semibold text-red-500">
        Please log in to view your Telco Credit Score.
      </div>
    );
  }

  const displayScoreData = scoreData;

  const handleApplySubmit = () => {
    if (!phoneNumber || !consent) {
      toast.error('Please enter your phone number and agree to the terms.');
      return;
    }
    applyForScore({ phoneNumber, consent });
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Telco Credit Scoring</CardTitle>
          <CardDescription>View your telco-based credit score and apply for an update.</CardDescription>
        </CardHeader>
        <CardContent>
          {isScoreLoading && true ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading score...</span>
            </div>
          ) : displayScoreData ? (
            <div className="space-y-4">
              <div className="flex items-baseline space-x-2">
                <h3 className="text-xl font-semibold">Your Score:</h3>
                <Badge className="text-lg px-3 py-1" variant={displayScoreData.grade === 'Excellent' ? 'default' : displayScoreData.grade === 'Good' ? 'secondary' : 'destructive'}>
                  {displayScoreData.score} ({displayScoreData.grade})
                </Badge>
              </div>
              <p className="text-sm text-gray-500">Last Updated: {displayScoreData.lastUpdated}</p>

              <div>
                <h4 className="text-lg font-semibold mb-2">Recommendations:</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tip</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayScoreData?.recommendations?.map((rec, index) => (
                      <TableRow key={index}>
                        <TableCell>{rec}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={isApplyLoading}>
                    {isApplyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Apply for Score Update'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply for Telco Credit Score Update</DialogTitle>
                    <DialogDescription>
                      Enter your phone number to apply for an updated telco credit score.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phoneNumber" className="text-right">
                        Phone Number
                      </Label>
                      <Input
                        id="phoneNumber"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="col-span-3"
                        placeholder="e.g., 08012345678"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="consent" className="text-right">
                        Consent
                      </Label>
                      <input
                        type="checkbox"
                        id="consent"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="col-span-3 h-4 w-4"
                      />
                      <span className="col-span-3 text-sm text-gray-500">I agree to allow access to my telco data for credit scoring.</span>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" onClick={handleApplySubmit} disabled={isApplyLoading || !phoneNumber || !consent}>
                      {isApplyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Submit Application'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              No telco credit score data available. Apply for one to get started.
              <Dialog open={isApplyDialogOpen} onOpenChange={setIsApplyDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="mt-4" disabled={isApplyLoading}>
                    {isApplyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Apply for Score'}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply for Telco Credit Score</DialogTitle>
                    <DialogDescription>
                      Enter your phone number to apply for a telco credit score.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phoneNumber" className="text-right">
                        Phone Number
                      </Label>
                      <Input
                        id="phoneNumber"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="col-span-3"
                        placeholder="e.g., 08012345678"
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="consent" className="text-right">
                        Consent
                      </Label>
                      <input
                        type="checkbox"
                        id="consent"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="col-span-3 h-4 w-4"
                      />
                      <span className="col-span-3 text-sm text-gray-500">I agree to allow access to my telco data for credit scoring.</span>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" onClick={handleApplySubmit} disabled={isApplyLoading || !phoneNumber || !consent}>
                      {isApplyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Submit Application'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TelcoCreditScoring;
