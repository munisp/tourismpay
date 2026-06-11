// @ts-nocheck
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, AlertCircle, Smartphone } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

/**
 * TwoFactorVerify Component
 * 
 * Used during login or sensitive operations to verify 2FA token.
 * Supports both TOTP tokens and backup codes.
 */

interface TwoFactorVerifyProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
}

export default function TwoFactorVerify({
  onSuccess,
  onCancel,
  title = 'Two-Factor Authentication',
  description = 'Enter the 6-digit code from your authenticator app',
}: TwoFactorVerifyProps) {
  const [token, setToken] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);

  // Get device fingerprint on mount
  const { data: fingerprintData } = trpc.trustedDevice.getDeviceFingerprint.useQuery(
    { additionalData: {} },
    { enabled: true }
  );

  // Trust device mutation
  const trustDeviceMutation = trpc.trustedDevice.trustDevice.useMutation({
    onSuccess: (data) => {
      // Store fingerprint in localStorage for future checks
      if (data.deviceFingerprint) {
        localStorage.setItem('deviceFingerprint', data.deviceFingerprint);
      }
      toast.success('This device will be remembered for 30 days');
    },
    onError: (error) => {
      logger.error('Failed to trust device', { error });
      // Don't show error to user as this is optional
    },
  });

  const verifyMutation = trpc.twoFactor.verify.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      
      if (data.shouldRegenerateBackupCodes) {
        toast.warning(`Only ${data.remainingBackupCodes} backup codes remaining. Consider regenerating them.`);
      }
      
      // Trust device if checkbox was checked
      if (rememberDevice && fingerprintData) {
        trustDeviceMutation.mutate({
          deviceName: fingerprintData.deviceName,
          additionalData: {},
        });
      }
      
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      toast.error(error.message);
      setToken('');
      
      // Extract remaining attempts from error message if available
      if (error.message.includes('remaining')) {
        const match = error.message.match(/(\d+)\s+attempts?\s+remaining/i);
        if (match) {
          setRemainingAttempts(parseInt(match[1]));
        }
      }
    },
  });

  const handleVerify = () => {
    if (!useBackupCode && token.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    if (useBackupCode && token.length < 6) {
      toast.error('Please enter a valid backup code');
      return;
    }

    verifyMutation.mutate({
      token,
      useBackupCode,
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && token.length >= 6) {
      handleVerify();
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {remainingAttempts !== null && remainingAttempts <= 2 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {remainingAttempts === 0
                ? 'Account locked. Please try again later.'
                : `Warning: ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining`}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="token">
            {useBackupCode ? 'Backup Code' : 'Verification Code'}
          </Label>
          <Input
            id="token"
            type="text"
            inputMode={useBackupCode ? 'text' : 'numeric'}
            pattern={useBackupCode ? undefined : '[0-9]*'}
            maxLength={useBackupCode ? 16 : 6}
            placeholder={useBackupCode ? 'Enter backup code' : '000000'}
            value={token}
            onChange={(e) => {
              const value = useBackupCode
                ? e.target.value.toUpperCase()
                : e.target.value.replace(/\D/g, '');
              setToken(value);
            }}
            onKeyPress={handleKeyPress}
            className={`text-center ${useBackupCode ? 'text-lg' : 'text-2xl tracking-widest'} font-mono`}
            disabled={verifyMutation.isPending}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {useBackupCode
              ? 'Enter one of your backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setUseBackupCode(!useBackupCode);
                setToken('');
              }}
              disabled={verifyMutation.isPending}
            >
              {useBackupCode ? 'Use authenticator code' : 'Use backup code instead'}
            </Button>
          </div>

          <div className="flex items-start space-x-3 p-3 border rounded-lg bg-muted/30">
            <Checkbox
              id="rememberDevice"
              checked={rememberDevice}
              onCheckedChange={(checked) => setRememberDevice(checked === true)}
              disabled={verifyMutation.isPending}
              className="mt-0.5"
            />
            <div className="flex-1">
              <label
                htmlFor="rememberDevice"
                className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
              >
                <Smartphone className="h-4 w-4" />
                Remember this device for 30 days
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                You won't need to verify 2FA on this device for 30 days. Only enable on trusted devices.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={verifyMutation.isPending}
          >
            Cancel
          </Button>
        )}
        <Button
          onClick={handleVerify}
          disabled={verifyMutation.isPending || token.length < 6}
          className="ml-auto"
        >
          {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Verify
        </Button>
      </CardFooter>
    </Card>
  );
}
