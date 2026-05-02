/**
 * Admin Email Preview Page
 *
 * Renders the BIS investigation transactional email template in an iframe
 * so compliance officers can review and approve the email copy before it goes live.
 *
 * Features:
 * - Status toggle (completed / flagged)
 * - Editable template fields (merchant name, establishment, risk score, etc.)
 * - Copy HTML button
 * - Send test email button (sends to the admin's own email)
 * - SMTP configuration status indicator
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  Copy,
  Send,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Eye,
  Code,
} from "lucide-react";
import { toast } from "sonner";

export default function EmailPreview() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  // Template fields
  const [status, setStatus] = useState<"completed" | "flagged">("completed");
  const [merchantName, setMerchantName] = useState("Alex Kamau");
  const [establishmentName, setEstablishmentName] = useState("Savanna Lodge Nairobi");
  const [referenceId, setReferenceId] = useState("BIS-2026-PREVIEW");
  const [riskScore, setRiskScore] = useState(28);
  const [riskLevel, setRiskLevel] = useState("low");
  const [recommendation, setRecommendation] = useState(
    "Your establishment has passed all BIS checks. Please await KYB admin approval, which typically takes 1–3 business days."
  );

  // Test email
  const [testEmail, setTestEmail] = useState(user?.email ?? "");
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");

  // Redirect non-admins
  if (!loading && user?.role !== "admin") {
    navigate("/");
    return null;
  }

  const { data, isLoading, refetch } = trpc.emailPreview.getTemplate.useQuery({
    status,
    merchantName,
    establishmentName,
    referenceId,
    riskScore,
    riskLevel,
    recommendation,
    actionUrl: "/merchant/bis-status",
  });

  const sendTest = trpc.emailPreview.sendTest.useMutation({
    onSuccess: (result) => {
      if (result.sent) {
        toast.success(
          `Test email sent via ${result.method === "smtp" ? "SMTP" : "in-app notification"} to ${result.to}`
        );
      } else {
        toast.error("Test email could not be delivered — check server logs.");
      }
    },
    onError: (err) => toast.error(`Send failed: ${err.message}`),
  });

  const handleCopyHtml = () => {
    if (!data?.html) return;
    navigator.clipboard
      .writeText(data.html)
      .then(() => toast.success("HTML copied to clipboard"))
      .catch(() => toast.error("Copy failed — please copy manually"));
  };

  const handleSendTest = () => {
    if (!testEmail) {
      toast.error("Please enter a recipient email address");
      return;
    }
    sendTest.mutate({
      status,
      toEmail: testEmail,
      merchantName,
      establishmentName,
      referenceId,
      riskScore,
      riskLevel,
      recommendation,
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <Mail className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Email Preview</h1>
            <p className="text-slate-400 text-sm">
              Review BIS investigation email templates before they go live
            </p>
          </div>
        </div>
        {/* SMTP status badge */}
        {data && (
          <div className="flex items-center gap-2">
            {data.smtpConfigured ? (
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1.5">
                <CheckCircle className="w-3 h-3" />
                SMTP: {data.smtpHost}
              </Badge>
            ) : (
              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                SMTP not configured — using in-app fallback
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        {/* Left: Controls */}
        <div className="space-y-4">
          {/* Status toggle */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Template Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Investigation Status</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as "completed" | "flagged")}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="completed">
                      <span className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                        Completed (KYB Eligible)
                      </span>
                    </SelectItem>
                    <SelectItem value="flagged">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Flagged (Action Required)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Merchant Name</Label>
                <Input
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Establishment Name</Label>
                <Input
                  value={establishmentName}
                  onChange={(e) => setEstablishmentName(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Reference ID</Label>
                <Input
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Risk Score (0–100)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={riskScore}
                    onChange={(e) => setRiskScore(parseInt(e.target.value) || 0)}
                    className="bg-slate-800 border-slate-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-400">Risk Level</Label>
                  <Select value={riskLevel} onValueChange={setRiskLevel}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Recommendation / Next Step</Label>
                <Textarea
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                  rows={3}
                  className="bg-slate-800 border-slate-700 text-white text-sm resize-none"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh Preview
              </Button>
            </CardContent>
          </Card>

          {/* Send test email */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Send className="w-4 h-4" />
                Send Test Email
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-400 leading-relaxed">
                Send this template to any email address to verify delivery and rendering.
                {!data?.smtpConfigured && (
                  <span className="block mt-1 text-amber-400">
                    No SMTP configured — test will be delivered as an in-app notification.
                  </span>
                )}
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">Recipient Email</Label>
                <Input
                  type="email"
                  placeholder="admin@tourismpay.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white text-sm"
                />
              </div>
              <Button
                onClick={handleSendTest}
                disabled={sendTest.isPending || !testEmail}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                <Send className="w-4 h-4 mr-2" />
                {sendTest.isPending ? "Sending…" : "Send Test Email"}
              </Button>
            </CardContent>
          </Card>

          {/* Copy HTML */}
          <Button
            variant="outline"
            onClick={handleCopyHtml}
            disabled={!data?.html}
            className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy HTML Source
          </Button>
        </div>

        {/* Right: Preview */}
        <div className="flex flex-col gap-3">
          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                viewMode === "preview"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
              }`}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setViewMode("source")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                viewMode === "source"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200"
              }`}
            >
              <Code className="w-3 h-3" />
              HTML Source
            </button>
            <span className="text-xs text-slate-500 ml-auto">
              {status === "completed" ? (
                <span className="text-emerald-400">✅ Completed template</span>
              ) : (
                <span className="text-amber-400">⚠️ Flagged template</span>
              )}
            </span>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 min-h-[600px]">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin" />
                <span className="text-sm">Rendering template…</span>
              </div>
            </div>
          ) : viewMode === "preview" ? (
            <div className="flex-1 rounded-xl border border-slate-800 overflow-hidden bg-white min-h-[600px]">
              {data?.html ? (
                <iframe
                  srcDoc={data.html}
                  title="Email Preview"
                  className="w-full h-full min-h-[700px] border-0"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  No template data available
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 rounded-xl border border-slate-800 overflow-auto bg-slate-950 min-h-[600px]">
              <pre className="p-4 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                {data?.html ?? ""}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
