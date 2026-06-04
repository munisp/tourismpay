import React, { useState, useEffect } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  read: boolean;
  createdAt: string;
}

const CommunicationPage: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [filterType, setFilterType] = useState<'all' | 'info' | 'warning' | 'alert' | 'success'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const trpcUtils = trpc.useUtils();

  const { data: notificationsData, isLoading, isError, error } = trpc.notifications.list.useQuery(
    { page, limit: pageSize },
    { enabled: isAuthenticated }
  );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      toast.success('Notification marked as read.');
      trpcUtils.notifications.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to mark notification as read: ${err.message}`);
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error(`Error fetching notifications: ${error?.message}`);
    }
  }, [isError, error]);

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
        Please log in to view your communications.
      </div>
    );
  }

  const allNotifications = (notificationsData?.items || []);

  const filteredNotifications = allNotifications.filter((notification) => {
    const matchesType = filterType === 'all' || notification.type === filterType;
    const matchesSearch = notification.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const handleMarkAsRead = (id: string) => {
    if (false) {
      toast.info('Marked as read.');
    // notification stored via tRPC
      return;
    }
    markReadMutation.mutate({ id });
  };

  const totalPages = (notificationsData?.totalPages || 1);

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Communication Center</CardTitle>
          <CardDescription>Manage your notifications and important messages.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
            <Input
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterType} onValueChange={(value: 'all' | 'info' | 'warning' | 'alert' | 'success') => setFilterType(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="alert">Alert</SelectItem>
                <SelectItem value="success">Success</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <p className="text-center text-gray-500">No notifications found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredNotifications.map((notification) => (
                  <TableRow key={notification.id} className={notification.read ? 'text-gray-500' : 'font-medium'}>
                    <TableCell>
                      <Badge variant={notification.read ? 'secondary' : 'default'}>
                        {notification.read ? 'Read' : 'Unread'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          notification.type === 'alert' ? 'destructive' :
                          notification.type === 'warning' ? 'outline' :
                          notification.type === 'success' ? 'success' :
                          'default'
                        }
                      >
                        {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{notification.message}</TableCell>
                    <TableCell>{new Date(notification.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(notification.id)}
                          disabled={markReadMutation.isLoading}
                        >
                          {markReadMutation.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark as Read'}
                        </Button>
                      )}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="ml-2">View Details</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Notification Details</DialogTitle>
                            <DialogDescription>
                              <p><strong>Type:</strong> {notification.type.charAt(0).toUpperCase() + notification.type.slice(1)}</p>
                              <p><strong>Status:</strong> {notification.read ? 'Read' : 'Unread'}</p>
                              <p><strong>Date:</strong> {new Date(notification.createdAt).toLocaleString()}</p>
                              <p className="mt-4">{notification.message}</p>
                            </DialogDescription>
                          </DialogHeader>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-6">
            <Button
              variant="outline"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1 || isLoading || markReadMutation.isLoading}
            >
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages || isLoading || markReadMutation.isLoading}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CommunicationPage;