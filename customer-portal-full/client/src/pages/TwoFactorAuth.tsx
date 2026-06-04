import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const TwoFactorAuth: React.FC = () => {
  const [, setLocation] = useLocation();
  const { login: authLogin } = useAuth(); // Assuming useAuth has a login function to set auth state
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { mutate: loginMutation, isPending } = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.success) { // Assuming the login mutation returns a success flag and token
        toast.success('Two-factor authentication successful!');
        authLogin(data.token); // Assuming data contains a token
        setLocation('/dashboard');
      } else {
        setError(data.message || 'Invalid 2FA code.');
        toast.error(data.message || 'Invalid 2FA code. Please try again.');
      }
    },
    onError: (err) => {
      setError(err.message);
      toast.error(`Authentication failed: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (false) {
      if (code === '123456') {
        toast.success('Demo 2FA successful!');
        authLogin('demo-token-2fa');
        setLocation('/dashboard');
      } else {
        setError('Invalid demo 2FA code. Try 123456.');
        toast.error('Invalid demo 2FA code. Try 123456.');
      }
      return;
    }

    if (!code) {
      setError('Please enter your 2FA code.');
      toast.error('Please enter your 2FA code.');
      return;
    }

    // Assuming the login mutation handles 2FA as part of its flow
    // The actual payload for 2FA might be different, e.g., { username, password, twoFactorCode }
    // For this example, we assume the previous login attempt stored context for 2FA and now we just submit the code.
    // If the trpc.auth.login expects a full login payload including 2FA code, this would need adjustment.
    // For simplicity, we'll assume a separate 2FA verification step or that the login mutation can be re-called with the code.
    // Given the prompt, 'trpc.auth.login (2FA flow)', it implies the login mutation itself handles it.
    loginMutation({ twoFactorCode: code }); // Assuming the mutation accepts a twoFactorCode
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Two-Factor Authentication</CardTitle>
          <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Input
                id="2fa-code"
                placeholder="123456"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={isPending}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Verify Code
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TwoFactorAuth;
