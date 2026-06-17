/**
 * Two-step transaction confirmation for high-value transfers.
 *
 * Shows a detailed review dialog with:
 * - Amount, fee, FX rate breakdown
 * - Recipient details
 * - "Slide to confirm" gesture or PIN entry for amounts > threshold
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, AlertTriangle, ArrowRight, Lock } from "lucide-react";

interface TransactionDetail {
  type: "send" | "swap" | "topup" | "withdraw";
  fromAmount: number;
  fromCurrency: string;
  toAmount?: number;
  toCurrency?: string;
  fee: number;
  feeCurrency?: string;
  rate?: number;
  recipient?: string;
  description?: string;
}

interface TransactionConfirmProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  transaction: TransactionDetail;
  requirePin?: boolean;
  isPending?: boolean;
}

const HIGH_VALUE_THRESHOLD_USD = 500;

export function TransactionConfirm({
  open,
  onClose,
  onConfirm,
  transaction,
  requirePin = false,
  isPending = false,
}: TransactionConfirmProps) {
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"review" | "pin">("review");
  const isHighValue = transaction.fromAmount >= HIGH_VALUE_THRESHOLD_USD;
  const needsPin = requirePin || isHighValue;

  const handleConfirm = () => {
    if (needsPin && step === "review") {
      setStep("pin");
      return;
    }
    onConfirm();
    setPin("");
    setStep("review");
  };

  const handleClose = () => {
    setPin("");
    setStep("review");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isHighValue ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <ShieldCheck className="w-5 h-5 text-green-500" />
            )}
            {step === "pin" ? "Enter PIN to Confirm" : "Confirm Transaction"}
          </DialogTitle>
        </DialogHeader>

        {step === "review" ? (
          <div className="space-y-3">
            {isHighValue && (
              <div className="p-3 bg-amber-500/10 rounded-lg text-amber-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                High-value transaction — please review carefully
              </div>
            )}

            <div className="p-4 bg-muted/50 rounded-lg space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">You Send</span>
                <span className="font-mono font-bold text-lg">
                  {transaction.fromAmount.toLocaleString()} {transaction.fromCurrency}
                </span>
              </div>

              {transaction.toAmount != null && transaction.toCurrency && (
                <>
                  <div className="flex justify-center">
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">You Receive</span>
                    <span className="font-mono font-bold text-lg text-green-500">
                      {transaction.toAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {transaction.toCurrency}
                    </span>
                  </div>
                </>
              )}

              <div className="border-t border-border my-2" />

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fee</span>
                <span className="font-mono">{transaction.fee.toFixed(2)} {transaction.feeCurrency || transaction.fromCurrency}</span>
              </div>

              {transaction.rate != null && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Exchange Rate</span>
                  <span className="font-mono">1 {transaction.fromCurrency} = {transaction.rate.toFixed(6)} {transaction.toCurrency}</span>
                </div>
              )}

              {transaction.recipient && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Recipient</span>
                  <span className="font-mono">{transaction.recipient}</span>
                </div>
              )}

              {transaction.description && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Description</span>
                  <span>{transaction.description}</span>
                </div>
              )}
            </div>

            <Badge variant="outline" className="text-[10px] w-full justify-center py-1">
              Transaction ID will be generated upon confirmation
            </Badge>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm">
              <Lock className="w-4 h-4 text-primary" />
              Enter your 4-digit PIN to authorize this transaction
            </div>
            <div className="space-y-2">
              <Label>Transaction PIN</Label>
              <Input
                type="password"
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending || (step === "pin" && pin.length < 4)}
            className="flex-1"
          >
            {isPending ? "Processing..." : step === "pin" ? "Authorize" : needsPin ? "Continue to PIN" : "Confirm Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
