import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface HealthData {
  id: string;
  date: string;
  metric: string;
  value: number;
  unit: string;
  status: 'normal' | 'elevated' | 'low';
}

const HealthWellness: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'normal' | 'elevated' | 'low'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newMetric, setNewMetric] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newStatus, setNewStatus] = useState<'normal' | 'elevated' | 'low'>('normal');

  const { data, isLoading, isError, error } = trpc.health.data.useQuery();
  const submitHealthData = trpc.health.submit.useMutation();
  const utils = trpc.useUtils();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-full max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Please log in to view your health and wellness data.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>You must be authenticated to access this page.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError) {
    toast.error(`Error fetching health data: ${error?.message || 'Unknown error'}`);
    return (
      <Card className="w-full max-w-md mx-auto mt-8">
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>Failed to load health and wellness data.</CardDescription>
        </CardHeader>
        <CardContent>
          <p>There was an error loading your health data. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  const healthData = data || [];

  const filteredData = healthData.filter((item) => {
    const matchesSearch = item.metric.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await submitHealthData.mutateAsync({
        metric: newMetric,
        value: parseFloat(newValue),
        unit: newUnit,
        status: newStatus,
      });
      toast.success('Health data submitted successfully!');
      utils.health.data.invalidate();
      setNewMetric('');
      setNewValue('');
      setNewUnit('');
      setNewStatus('normal');
    } catch (err: any) {
      toast.error(`Failed to submit health data: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Health & Wellness Dashboard</CardTitle>
          <CardDescription>Monitor and manage your personal health metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <Input
              placeholder="Search by metric..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-grow"
            />
            <Select
              value={filterStatus}
              onValueChange={(value: 'all' | 'normal' | 'elevated' | 'low') => setFilterStatus(value)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="elevated">Elevated</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Dialog>
              <DialogTrigger asChild>
                <Button>Add New Data</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Submit New Health Data</DialogTitle>
                  <DialogDescription>Enter your latest health metric readings.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Input
                    placeholder="Metric (e.g., Blood Pressure)"
                    value={newMetric}
                    onChange={(e) => setNewMetric(e.target.value)}
                  />
                  <Input
                    placeholder="Value (e.g., 120)"
                    type="number"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                  <Input
                    placeholder="Unit (e.g., mmHg)"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  />
                  <Select
                    value={newStatus}
                    onValueChange={(value: 'normal' | 'elevated' | 'low') => setNewStatus(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="elevated">Elevated</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button onClick={handleSubmit} disabled={isSubmitting || !newMetric || !newValue || !newUnit}>
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Submit Data
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length > 0 ? (
                filteredData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.date}</TableCell>
                    <TableCell>{item.metric}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'elevated' ? 'destructive' : item.status === 'low' ? 'secondary' : 'default'}>
                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No health data found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default HealthWellness;