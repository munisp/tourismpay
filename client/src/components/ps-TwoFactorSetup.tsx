// @ts-nocheck
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Copy, Download, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * TwoFactorSetup Component
 * 
 * Guides users through 2FA setup process:
 * 1. Generate QR code and secret
 * 2. Scan QR code with authenticator app
 * 3. Verify token to enable 2FA
 * 4. Save backup codes
 */

interface TwoFactorSetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export default function TwoFactorSetup({ onComplete, onCancel }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'setup' | 'verify' | 'backup'>('setup');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [manualEntryKey, setManualEntryKey] = useState<string>('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationToken, setVerificationToken] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const setupMutation = trpc.twoFactor.setup.useMutation({
    onSuccess: (data) => {
      setQrCodeUrl(data.qrCodeUrl);
      setManualEntryKey(data.manualEntryKey);
      setBackupCodes(data.backupCodes);
      setStep('verify');
      toast.success('2FA setup initiated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const enableMutation = trpc.twoFactor.enable.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setStep('backup');
      toast.success('2FA enabled successfully!');
    },
    onError: (error) => {
      toast.error(error.message);
      setVerificationToken('');
    },
  });

  const handleSetup = () => {
    setupMutation.mutate();
  };

  const handleVerify = () => {
    if (verificationToken.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    enableMutation.mutate({ token: verificationToken });
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(manualEntryKey);
    setCopiedKey(true);
    toast.success('Secret key copied to clipboard');
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedCodes(true);
    toast.success('Backup codes copied to clipboard');
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleDownloadBackupCodes = () => {
    const codesText = backupCodes.map((code, i) => `${i + 1}. ${code}`).join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '2fa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded');
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {step === 'setup' && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle>Enable Two-Factor Authentication</CardTitle>
            </div>
            <CardDescription>
              Add an extra layer of security to your account by requiring a verification code from your authenticator app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You'll need an authenticator app like Google Authenticator, Authy, or 1Password to complete this setup.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <h4 className="font-medium">What you'll need:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>An authenticator app installed on your mobile device</li>
                <li>Access to your account password</li>
                <li>A safe place to store backup codes</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              onClick={handleSetup}
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Setup
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 'verify' && (
        <Card>
          <CardHeader>
            <CardTitle>Scan QR Code</CardTitle>
            <CardDescription>
              Use your authenticator app to scan this QR code, then enter the 6-digit code to verify.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* QR Code */}
            <div className="flex justify-center">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="2FA QR Code" className="w-64 h-64 border rounded-lg" />
              ) : (
                <div className="w-64 h-64 border rounded-lg flex items-center justify-center bg-muted">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Manual Entry Key */}
            <div className="space-y-2">
              <Label>Can't scan the QR code?</Label>
              <div className="flex gap-2">
                <Input
                  value={manualEntryKey}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyKey}
                >
                  {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter this key manually in your authenticator app
              </p>
            </div>

            {/* Verification Input */}
            <div className="space-y-2">
              <Label htmlFor="token">Enter Verification Code</Label>
              <Input
                id="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-widest font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('setup')}>
              Back
            </Button>
            <Button
              onClick={handleVerify}
              disabled={enableMutation.isPending || verificationToken.length !== 6}
            >
              {enableMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify & Enable
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 'backup' && (
        <Card>
          <CardHeader>
            <CardTitle>Save Your Backup Codes</CardTitle>
            <CardDescription>
              Store these codes in a safe place. You can use them to access your account if you lose your device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Each backup code can only be used once. Keep them safe and secure.
              </AlertDescription>
            </Alert>

            <div className="bg-muted p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {backupCodes.map((code, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <span className="font-semibold">{code}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleCopyBackupCodes}
              >
                {copiedCodes ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                Copy Codes
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleDownloadBackupCodes}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleComplete} className="w-full">
              <Check className="mr-2 h-4 w-4" />
              I've Saved My Backup Codes
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
