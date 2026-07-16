import React, { useState } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  date: string;
  description: string;
}

const DigitalWallet: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [topupAmount, setTopupAmount] = useState<number | ''>('');
  const [withdrawAmount, setWithdrawAmount] = useState<number | ''>('');

  // DEMO DATA

  // tRPC Queries
  const { data: balanceData, isLoading: isBalanceLoading, error: balanceError } = trpc.wallet.balance.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: transactionsData, isLoading: isTransactionsLoading, error: transactionsError } = trpc.wallet.transactions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // tRPC Mutations
  const topupMutation = trpc.wallet.topup.useMutation({
    onSuccess: () => {
      toast.success('Wallet top-up successful!');
      utils.wallet.balance.invalidate();
      utils.wallet.transactions.invalidate();
      setTopupAmount('');
    },
    onError: (error) => {
      toast.error(`Top-up failed: ${error.message}`);
    },
  });

  const withdrawMutation = trpc.wallet.withdraw.useMutation({
    onSuccess: () => {
      toast.success('Withdrawal successful!');
      utils.wallet.balance.invalidate();
      utils.wallet.transactions.invalidate();
      setWithdrawAmount('');
    },
    onError: (error) => {
      toast.error(`Withdrawal failed: ${error.message}`);
    },
  });

  // Handle Loading and Error States
  if (authLoading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!isAuthenticated) {
    return <div className="flex justify-center items-center h-screen text-lg font-semibold">Please log in to access your digital wallet.</div>;
  }

  if (balanceError) {
    toast.error(`Failed to load balance: ${balanceError.message}`);
  }

  if (transactionsError) {
    toast.error(`Failed to load transactions: ${transactionsError.message}`);
  }

  const currentBalance = (balanceData?.balance || 0);
  const allTransactions = transactionsData || [];

  const filteredTransactions = allTransactions.filter(transaction =>
    transaction.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    transaction.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleTopup = () => {
    if (topupAmount && topupAmount > 0) {
      topupMutation.mutate({ amount: topupAmount });
    } else {
      toast.error('Please enter a valid amount to top-up.');
    }
  };

  const handleWithdraw = () => {
    if (withdrawAmount && withdrawAmount > 0) {
      withdrawMutation.mutate({ amount: withdrawAmount });
    } else {
      toast.error('Please enter a valid amount to withdraw.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Digital Wallet</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Current Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {isBalanceLoading && true ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <p className="text-4xl font-extrabold">₦{currentBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Top-up Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <Label htmlFor="topup-amount">Amount</Label>
              <Input
                id="topup-amount"
                type="number"
                placeholder="e.g., 5000"
                value={topupAmount}
                onChange={(e) => setTopupAmount(parseFloat(e.target.value) || '')}
              />
              <Button onClick={handleTopup} disabled={topupMutation.isLoading || !topupAmount}>
                {topupMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Top-up
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Withdraw Funds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <Label htmlFor="withdraw-amount">Amount</Label>
              <Input
                id="withdraw-amount"
                type="number"
                placeholder="e.g., 2000"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(parseFloat(e.target.value) || '')}
              />
              <Button onClick={handleWithdraw} disabled={withdrawMutation.isLoading || !withdrawAmount}>
                {withdrawMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Withdraw
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search transactions..."
            className="mb-4"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isTransactionsLoading && true ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount (₦)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTransactions.length > 0 ? (
                  paginatedTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{transaction.date}</TableCell>
                      <TableCell>{transaction.description}</TableCell>
                      <TableCell className={transaction.type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                        {transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}
                      </TableCell>
                      <TableCell className="text-right">
                        {transaction.type === 'credit' ? '+' : '-'}{transaction.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">No transactions found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}

          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span>Page {currentPage} of {totalPages}</span>
            <Button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DigitalWallet;