import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface Treaty {
  id: string;
  name: string;
  type: string;
  status: string;
  effectiveDate: string;
  expiryDate: string;
}

interface Cession {
  id: string;
  treatyId: string;
  reinsurer: string;
  amount: number;
  date: string;
}

export default function ReinsuranceManagement() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [treatySearch, setTreatySearch] = useState('');
  const [cessionSearch, setCessionSearch] = useState('');
  const [newTreatyName, setNewTreatyName] = useState('');
  const [newTreatyType, setNewTreatyType] = useState('');

  const utils = trpc.useUtils();

  const { data: treaties, isLoading: isLoadingTreaties, error: treatiesError } = trpc.reinsurance.treaties.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: cessions, isLoading: isLoadingCessions, error: cessionsError } = trpc.reinsurance.cessions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createTreatyMutation = trpc.reinsurance.create.useMutation({
    onSuccess: () => {
      toast.success('Treaty created successfully!');
      utils.reinsurance.treaties.invalidate();
      setNewTreatyName('');
      setNewTreatyType('');
    },
    onError: (error) => {
      toast.error(`Failed to create treaty: ${error.message}`);
    },
  });

  if (authLoading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return <div className="flex justify-center items-center h-screen text-lg font-semibold">Please log in to access this page.</div>;
  }

  if (treatiesError) {
    toast.error(`Error loading treaties: ${treatiesError.message}`);
  }

  if (cessionsError) {
    toast.error(`Error loading cessions: ${cessionsError.message}`);
  }

  const filteredTreaties = (treaties || []).filter(treaty =>
    treaty.name.toLowerCase().includes(treatySearch.toLowerCase())
  );

  const filteredCessions = (cessions || []).filter(cession =>
    cession.reinsurer.toLowerCase().includes(cessionSearch.toLowerCase()) ||
    cession.treatyId.toLowerCase().includes(cessionSearch.toLowerCase())
  );

  const handleCreateTreaty = () => {
    if (newTreatyName && newTreatyType) {
      createTreatyMutation.mutate({ name: newTreatyName, type: newTreatyType });
    } else {
      toast.error('Please fill in all fields for the new treaty.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Reinsurance Management</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Treaties</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <Input
              placeholder="Search treaties..."
              value={treatySearch}
              onChange={(e) => setTreatySearch(e.target.value)}
              className="max-w-sm"
            />
            <Dialog>
              <DialogTrigger asChild>
                <Button>Create New Treaty</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Reinsurance Treaty</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Treaty Name"
                    value={newTreatyName}
                    onChange={(e) => setNewTreatyName(e.target.value)}
                  />
                  <Select onValueChange={setNewTreatyType} value={newTreatyType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Treaty Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Facultative">Facultative</SelectItem>
                      <SelectItem value="Quota Share">Quota Share</SelectItem>
                      <SelectItem value="Excess of Loss">Excess of Loss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateTreaty} disabled={createTreatyMutation.isLoading}>
                    {createTreatyMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Treaty
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          {(isLoadingTreaties && true) ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Expiry Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTreaties.map((treaty) => (
                  <TableRow key={treaty.id}>
                    <TableCell>{treaty.id}</TableCell>
                    <TableCell>{treaty.name}</TableCell>
                    <TableCell>{treaty.type}</TableCell>
                    <TableCell>{treaty.status}</TableCell>
                    <TableCell>{treaty.effectiveDate}</TableCell>
                    <TableCell>{treaty.expiryDate}</TableCell>
                  </TableRow>
                ))}
                {filteredTreaties.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">No treaties found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search cessions by reinsurer or treaty ID..."
              value={cessionSearch}
              onChange={(e) => setCessionSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
          {(isLoadingCessions && true) ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Treaty ID</TableHead>
                  <TableHead>Reinsurer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCessions.map((cession) => (
                  <TableRow key={cession.id}>
                    <TableCell>{cession.id}</TableCell>
                    <TableCell>{cession.treatyId}</TableCell>
                    <TableCell>{cession.reinsurer}</TableCell>
                    <TableCell>{cession.amount}</TableCell>
                    <TableCell>{cession.date}</TableCell>
                  </TableRow>
                ))}
                {filteredCessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">No cessions found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}