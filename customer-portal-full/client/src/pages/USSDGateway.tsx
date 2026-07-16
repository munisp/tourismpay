import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';

interface USSDSession {
  id: string;
  phoneNumber: string;
  serviceCode: string;
  status: 'active' | 'completed' | 'failed';
  lastActivity: string;
  duration: number; // in seconds
  menuPath: string;
}

const USSDGateway: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | USSDSession['status']>('all');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10); // Assuming a fixed page size for simplicity

  const [simulatePhoneNumber, setSimulatePhoneNumber] = useState('');
  const [simulateServiceCode, setSimulateServiceCode] = useState('');
  const [isSimulateDialogOpen, setIsSimulateDialogOpen] = useState(false);

  // Fetch USSD Sessions
  const { data: sessions, isLoading: isSessionsLoading, error: sessionsError } = trpc.ussd.sessions.useQuery(
    undefined, // No input parameters for now, assuming it fetches all
    { enabled: isAuthenticated }
  );

  // Simulate USSD Session Mutation
  const { mutate: simulateUssd, isLoading: isSimulating, error: simulateError } = trpc.ussd.simulate.useMutation({
    onSuccess: () => {
      toast.success('USSD session simulated successfully!');
      utils.ussd.sessions.invalidate(); // Invalidate sessions to refetch latest data
      setIsSimulateDialogOpen(false);
      setSimulatePhoneNumber('');
      setSimulateServiceCode('');
    },
    onError: (err) => {
      toast.error(`Failed to simulate USSD session: ${err.message}`);
    },
  });

  useEffect(() => {
    if (sessionsError) {
      toast.error(`Error fetching USSD sessions: ${sessionsError.message}`);
    }
  }, [sessionsError]);

  useEffect(() => {
    if (simulateError) {
      toast.error(`Error during USSD simulation: ${simulateError.message}`);
    }
  }, [simulateError]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center h-screen text-lg font-semibold">
        Please log in to access the USSD Gateway.
      </div>
    );
  }

  const allSessions = sessions || [];

  const filteredSessions = allSessions.filter((session) => {
    const matchesSearch = searchQuery === '' ||
      session.phoneNumber.includes(searchQuery) ||
      session.serviceCode.includes(searchQuery) ||
      session.id.includes(searchQuery);
    const matchesStatus = filterStatus === 'all' || session.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const paginatedSessions = filteredSessions.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredSessions.length / pageSize);

  const handleSimulateSubmit = () => {
    if (simulatePhoneNumber && simulateServiceCode) {
      simulateUssd({ phoneNumber: simulatePhoneNumber, serviceCode: simulateServiceCode });
    } else {
      toast.error('Please enter both phone number and service code for simulation.');
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">USSD Gateway Management</CardTitle>
          <CardDescription>Monitor and simulate USSD sessions for your platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-6">
            <div className="flex space-x-4">
              <Input
                placeholder="Search by phone, service code, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
              <Select
                value={filterStatus}
                onValueChange={(value: 'all' | USSDSession['status']) => setFilterStatus(value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Dialog open={isSimulateDialogOpen} onOpenChange={setIsSimulateDialogOpen}>
              <DialogTrigger asChild>
                <Button>Simulate USSD Session</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Simulate New USSD Session</DialogTitle>
                  <DialogDescription>
                    Enter the phone number and service code to simulate a new USSD interaction.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="phoneNumber" className="text-right">
                      Phone Number
                    </Label>
                    <Input
                      id="phoneNumber"
                      value={simulatePhoneNumber}
                      onChange={(e) => setSimulatePhoneNumber(e.target.value)}
                      placeholder="e.g., 08012345678"
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="serviceCode" className="text-right">
                      Service Code
                    </Label>
                    <Input
                      id="serviceCode"
                      value={simulateServiceCode}
                      onChange={(e) => setSimulateServiceCode(e.target.value)}
                      placeholder="e.g., *901#"
                      className="col-span-3"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSimulateSubmit} disabled={isSimulating}>
                    {isSimulating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simulate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {isSessionsLoading && true ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session ID</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Service Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Duration (s)</TableHead>
                  <TableHead>Menu Path</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedSessions.length > 0 ? (
                  paginatedSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.id}</TableCell>
                      <TableCell>{session.phoneNumber}</TableCell>
                      <TableCell>{session.serviceCode}</TableCell>
                      <TableCell>
                        <Badge
                          variant={session.status === 'active' ? 'default' : session.status === 'completed' ? 'secondary' : 'destructive'}
                        >
                          {session.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(session.lastActivity).toLocaleString()}</TableCell>
                      <TableCell>{session.duration}</TableCell>
                      <TableCell>{session.menuPath}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      No USSD sessions found.
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
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
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

export default USSDGateway;