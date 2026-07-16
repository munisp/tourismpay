import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

interface ModelSecurityStatus {
  modelName: string;
  status: 'Secure' | 'Vulnerable' | 'Scanning';
  lastScan: string;
  vulnerabilitiesFound: number;
  recommendations: string[];
}

const ModelSecurityDashboard: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const trpcUtils = trpc.useUtils();

  const { data: securityStatus, isLoading: isStatusLoading, error: statusError } = trpc.modelSecurity.status.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { mutate: scanModel, isLoading: isScanning, error: scanError } = trpc.modelSecurity.scan.useMutation({
    onSuccess: () => {
      toast.success('Model security scan initiated successfully!');
      trpcUtils.modelSecurity.status.invalidate();
    },
    onError: (err) => {
      toast.error(`Scan failed: ${err.message}`);
    },
  });

  React.useEffect(() => {
    if (statusError) {
      toast.error(`Failed to load security status: ${statusError.message}`);
    }
    if (scanError) {
      toast.error(`Scan operation error: ${scanError.message}`);
    }
  }, [statusError, scanError]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading authentication...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        You are not authorized to view this page. Please log in.
      </div>
    );
  }

  const currentStatus = securityStatus;
  const isLoading = isStatusLoading || isScanning;

  const handleScan = () => {
    if (!isScanning) {
      scanModel();
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Model Security Dashboard</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Model Security Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading model security status...</span>
            </div>
          ) : (
            currentStatus ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Model Name</p>
                  <p className="text-lg font-medium">{currentStatus.modelName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <Badge variant={currentStatus.status === 'Secure' ? 'default' : 'destructive'}>
                    {currentStatus.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Last Scan</p>
                  <p className="text-lg font-medium">{new Date(currentStatus?.lastScan).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Vulnerabilities Found</p>
                  <p className="text-lg font-medium">{currentStatus.vulnerabilitiesFound}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Recommendations</p>
                  <ul className="list-disc list-inside">
                    {currentStatus?.recommendations?.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p>No security status data available.</p>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={handleScan} disabled={isScanning}>
            {isScanning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Scan Model for Vulnerabilities
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModelSecurityDashboard;