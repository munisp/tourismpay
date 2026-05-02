// @ts-nocheck
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import TwoFactorSetup from '@/components/ps-TwoFactorSetup';
import TwoFactorVerify from '@/components/ps-TwoFactorVerify';

/**
 * TwoFactorSettings Page
 * 
 * Allows users to:
 * - Enable/disable 2FA
 * - View backup codes status
 * - Regenerate backup codes
 */

export default function TwoFactorSettings() {
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);

  const { data: status, isLoading, refetch } = trpc.twoFactor.getStatus.useQuery();

  const disableMutation = trpc.twoFactor.disable.useMutation({
    onSuccess: () => {
      toast.success('2FA disabled successfully');
      setShowDisable(false);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const regenerateMutation = trpc.twoFactor.regenerateBackupCodes.useMutation({
    onSuccess: (data) => {
      toast.success('Backup codes regenerated');
      setShowRegenerate(false);
      refetch();
      
      // Download new backup codes
      const codesText = data.backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n');
      const blob = new Blob([codesText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '2fa-backup-codes-new.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <div className="container mx-auto py-8">
        <TwoFactorSetup
          onComplete={() => {
            setShowSetup(false);
            refetch();
          }}
          onCancel={() => setShowSetup(false)}
        />
      </div>
    );
  }

  if (showDisable) {
    return (
      <div className="container mx-auto py-8">
        <TwoFactorVerify
          title="Disable Two-Factor Authentication"
          description="Enter your verification code to disable 2FA"
          onSuccess={() => disableMutation.mutate({ token: '' })}
          onCancel={() => setShowDisable(false)}
        />
      </div>
    );
  }

  if (showRegenerate) {
    return (
      <div className="container mx-auto py-8">
        <TwoFactorVerify
          title="Regenerate Backup Codes"
          description="Enter your verification code to generate new backup codes"
          onSuccess={() => regenerateMutation.mutate({ token: '' })}
          onCancel={() => setShowRegenerate(false)}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Two-Factor Authentication</h1>
        <p className="text-muted-foreground">
          Protect your account with an additional layer of security
        </p>
      </div>

      <div className="space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <CardTitle>2FA Status</CardTitle>
              </div>
              {status?.enabled ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Enabled</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Disabled</span>
                </div>
              )}
            </div>
            <CardDescription>
              {status?.enabled
                ? 'Your account is protected with two-factor authentication'
                : 'Enable 2FA to add an extra layer of security to your account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status?.enabled ? (
              <div className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You have <strong>{status.backupCodesCount}</strong> backup codes remaining.
                    {status.shouldRegenerateBackupCodes && (
                      <span className="text-destructive">
                        {' '}Consider regenerating your backup codes.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowRegenerate(true)}
                  >
                    Regenerate Backup Codes
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDisable(true)}
                  >
                    Disable 2FA
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setShowSetup(true)}>
                <Shield className="mr-2 h-4 w-4" />
                Enable Two-Factor Authentication
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium">Authenticator App</h4>
              <p className="text-sm text-muted-foreground">
                After enabling 2FA, you'll need to enter a 6-digit code from your authenticator app
                every time you sign in. We recommend using Google Authenticator, Authy, or 1Password.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Backup Codes</h4>
              <p className="text-sm text-muted-foreground">
                You'll receive 10 backup codes that can be used if you lose access to your authenticator app.
                Each code can only be used once, so keep them safe.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Account Recovery</h4>
              <p className="text-sm text-muted-foreground">
                If you lose access to both your authenticator app and backup codes, you'll need to
                contact support to regain access to your account.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
