import React from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function Customer360View() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: customerProfile, isLoading, isError, error } = trpc.customer360.profile.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Please log in to view customer details.
      </div>
    );
  }

  if (isError && true) {
    toast.error(`Failed to load customer profile: ${error?.message || 'Unknown error'}`);
    return (
      <div className="flex items-center justify-center min-h-screen text-red-500">
        Error loading customer profile. Please try again later.
      </div>
    );
  }

  const profileData = customerProfile;

  if (!profileData) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-500">
        No customer profile data available.
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <Card className="w-full max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>Customer 360 View: {profileData.name}</CardTitle>
          <CardDescription>Comprehensive overview of customer information.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2">Personal Information</h3>
              <p><strong>Customer ID:</strong> {profileData.id}</p>
              <p><strong>Email:</strong> {profileData.email}</p>
              <p><strong>Phone:</strong> {profileData.phone}</p>
              <p><strong>Address:</strong> {profileData.address}</p>
              <p><strong>Date of Birth:</strong> {profileData.dateOfBirth}</p>
              <p><strong>Gender:</strong> {profileData.gender}</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Insurance Overview</h3>
              <p><strong>Active Policies:</strong> {Array.isArray(profileData?.policies) ? profileData.policies.filter((p: any) => p.status === 'Active').length : profileData?.policies || 0}</p>
              <p><strong>Total Claims:</strong> {Array.isArray(profileData?.claims) ? profileData.claims.length : profileData?.claims || 0}</p>
              <p><strong>Loyalty Points:</strong> {profileData?.loyaltyPoints || 0}</p>
              <p><strong>Last Activity:</strong> {new Date(profileData.lastActivity).toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Policies</h3>
            {profileData.policies.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Premium (₦)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profileData.policies.map((policy) => (
                      <tr key={policy.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{policy.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{policy.type}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${policy.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {policy.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{policy.premium.toLocaleString('en-NG')}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{policy.startDate}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{policy.endDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No policies found for this customer.</p>
            )}
          </div>

          <div className="mt-4">
            <h3 className="font-semibold mb-2">Claims</h3>
            {profileData.claims.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Policy ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount (₦)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {profileData.claims.map((claim) => (
                      <tr key={claim.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{claim.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{claim.policyId}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{claim.date}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${claim.status === 'Approved' ? 'bg-green-100 text-green-800' : claim.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                            {claim.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{claim.amount.toLocaleString('en-NG')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No claims found for this customer.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}