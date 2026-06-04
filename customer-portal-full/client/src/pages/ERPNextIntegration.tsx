import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Settings,
  History,
  ArrowLeftRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Database,
  Globe,
  Key,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TabId = "status" | "config" | "history" | "mapping";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "status", label: "Overview", icon: <BarChart3 className="h-4 w-4" /> },
  { id: "config", label: "Configuration", icon: <Settings className="h-4 w-4" /> },
  { id: "history", label: "Sync History", icon: <History className="h-4 w-4" /> },
  { id: "mapping", label: "Field Mapping", icon: <ArrowLeftRight className="h-4 w-4" /> },
];

const ENTITY_MAPPINGS = [
  { local: "Policy", erp: "Sales Invoice", direction: "InsurePortal → ERP", fields: "policyNumber → naming_series, premium → grand_total, customer → customer_name" },
  { local: "Claim", erp: "Payment Entry", direction: "InsurePortal → ERP", fields: "claimNumber → reference_no, amount → paid_amount, status → payment_type" },
  { local: "Customer", erp: "Customer", direction: "Bidirectional", fields: "fullName → customer_name, email → email_id, phone → mobile_no" },
  { local: "Agent", erp: "Sales Partner", direction: "Bidirectional", fields: "name → partner_name, email → email, region → territory, commission → commission_rate" },
  { local: "Payment", erp: "Payment Entry", direction: "InsurePortal → ERP", fields: "amount → paid_amount, method → mode_of_payment, reference → reference_no" },
  { local: "Premium Collection", erp: "Journal Entry", direction: "InsurePortal → ERP", fields: "premium → debit, policyId → user_remark, account → account" },
  { local: "NAICOM Filing", erp: "Custom DocType", direction: "InsurePortal → ERP", fields: "filingType → filing_type, period → period, status → workflow_state" },
  { local: "Reinsurance Treaty", erp: "Custom DocType", direction: "Bidirectional", fields: "treatyName → treaty_name, cedingAmount → ceding_amount, retentionPct → retention" },
];

const DEFAULT_FIELD_MAPPINGS = {
  policy: {
    policyNumber: "naming_series",
    premium: "grand_total",
    status: "docstatus",
    customerName: "customer_name",
    startDate: "posting_date",
    endDate: "due_date",
    type: "item_group",
  },
  claim: {
    claimNumber: "reference_no",
    amount: "paid_amount",
    status: "payment_type",
    description: "remarks",
    policyId: "reference_name",
  },
  customer: {
    fullName: "customer_name",
    email: "email_id",
    phone: "mobile_no",
    address: "address_line1",
    city: "city",
    state: "state",
  },
  agent: {
    name: "partner_name",
    email: "email",
    region: "territory",
    commissionRate: "commission_rate",
  },
};

function SyncStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "Synced":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "Failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "Pending":
      return <Clock className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-gray-500" />;
  }
}

export default function ERPNextIntegration() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>("status");

  // ERP config
  const { data: erpConfig, isLoading: isLoadingConfig } = trpc.erp.config.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ERP status
  const {
    data: erpnextStatus,
    isLoading: isLoadingStatus,
    isError: isErrorStatus,
    error: statusError,
    refetch: refetchStatus,
  } = trpc.erpnext.status.useQuery(undefined, { enabled: isAuthenticated });

  // ERP transactions (sync history)
  const { data: transactions, isLoading: isLoadingTx } = trpc.erp.transactions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Sync mutation
  const utils = trpc.useUtils();
  const { mutate: syncERPNext, isLoading: isSyncing } = trpc.erpnext.sync.useMutation({
    onSuccess: (data) => {
      toast.success(`Sync completed: ${data?.synced ?? 0} records synced, ${data?.failed ?? 0} failed`);
      utils.erpnext.status.invalidate();
      utils.erp.transactions.invalidate();
      utils.erp.config.invalidate();
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message}`);
    },
  });

  // Config update mutation
  const { mutate: updateConfig, isLoading: isSavingConfig } = trpc.erp.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("ERP configuration saved successfully!");
      utils.erp.config.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to save configuration: ${err.message}`);
    },
  });

  // Config form state
  const [configForm, setConfigForm] = useState({
    erpType: "erpnext",
    name: "",
    baseUrl: "",
    apiKey: "",
    syncEnabled: true,
    syncIntervalMinutes: 60,
    syncTransactions: true,
    syncAgents: false,
    syncInventory: false,
  });

  React.useEffect(() => {
    if (erpConfig) {
      setConfigForm({
        erpType: (erpConfig as any).erpType || "erpnext",
        name: (erpConfig as any).name || "",
        baseUrl: (erpConfig as any).baseUrl || "",
        apiKey: (erpConfig as any).apiKey || "",
        syncEnabled: (erpConfig as any).syncEnabled ?? true,
        syncIntervalMinutes: (erpConfig as any).syncIntervalMinutes ?? 60,
        syncTransactions: (erpConfig as any).syncTransactions ?? true,
        syncAgents: (erpConfig as any).syncAgents ?? false,
        syncInventory: (erpConfig as any).syncInventory ?? false,
      });
    }
  }, [erpConfig]);

  const handleSaveConfig = () => {
    updateConfig(configForm as any);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-lg text-red-500">Please log in to view ERPNext Integration.</p>
      </div>
    );
  }

  const txList = Array.isArray(transactions) ? transactions : [];
  const syncedCount = txList.filter((t: any) => t.syncStatus === "Synced").length;
  const pendingCount = txList.filter((t: any) => t.syncStatus === "Pending").length;
  const failedCount = txList.filter((t: any) => t.syncStatus === "Failed").length;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ERP Integration</h1>
          <p className="text-muted-foreground">
            Connect InsurePortal with ERPNext, SAP, Odoo, or other ERP systems for seamless data synchronization
          </p>
        </div>
        <Button onClick={() => syncERPNext()} disabled={isSyncing || isLoadingStatus}>
          {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {isSyncing ? "Syncing..." : "Sync Now"}
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "status" && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Connection Status</CardDescription>
                <CardTitle className="text-lg flex items-center gap-2">
                  {erpnextStatus?.connected ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      Connected
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-500" />
                      Disconnected
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{erpnextStatus?.name || "Not configured"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Records Synced</CardDescription>
                <CardTitle className="text-2xl">{syncedCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Total successful synchronizations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending Sync</CardDescription>
                <CardTitle className="text-2xl text-yellow-600">{pendingCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Awaiting next sync cycle</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Failed</CardDescription>
                <CardTitle className="text-2xl text-red-600">{failedCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Requires attention</p>
              </CardContent>
            </Card>
          </div>

          {/* Connection Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Connection Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingConfig ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">ERP System</Label>
                    <p className="font-medium">{(erpConfig as any)?.erpType === "erpnext" ? "ERPNext" : (erpConfig as any)?.erpType === "sap" ? "SAP" : (erpConfig as any)?.erpType === "odoo" ? "Odoo" : (erpConfig as any)?.erpType || "Custom"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Instance Name</Label>
                    <p className="font-medium">{(erpConfig as any)?.name || "Not set"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Base URL</Label>
                    <p className="font-medium truncate">{(erpConfig as any)?.baseUrl || "Not configured"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Sync</Label>
                    <p className="font-medium">
                      {erpnextStatus?.lastSync ? new Date(erpnextStatus.lastSync).toLocaleString() : "Never"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sync Interval</Label>
                    <p className="font-medium">{(erpConfig as any)?.syncIntervalMinutes || 60} minutes</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sync Transactions</Label>
                    <Badge variant={(erpConfig as any)?.syncTransactions ? "default" : "secondary"}>
                      {(erpConfig as any)?.syncTransactions ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sync Agents</Label>
                    <Badge variant={(erpConfig as any)?.syncAgents ? "default" : "secondary"}>
                      {(erpConfig as any)?.syncAgents ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Status</Label>
                    <Badge variant={(erpConfig as any)?.lastSyncStatus === "success" ? "default" : "destructive"}>
                      {(erpConfig as any)?.lastSyncStatus || "Never"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Entity Mapping Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Entity Mapping Overview
              </CardTitle>
              <CardDescription>
                How InsurePortal entities map to ERP document types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>InsurePortal Entity</TableHead>
                    <TableHead>ERP Document Type</TableHead>
                    <TableHead>Sync Direction</TableHead>
                    <TableHead>Key Field Mappings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ENTITY_MAPPINGS.map((mapping, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{mapping.local}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{mapping.erp}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={mapping.direction === "Bidirectional" ? "default" : "secondary"}>
                          {mapping.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {mapping.fields}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "config" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                ERP Connection Configuration
              </CardTitle>
              <CardDescription>
                Configure your ERP system connection. Supports ERPNext, SAP Business One, Odoo, and custom REST APIs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="erpType">ERP System Type</Label>
                  <Select
                    value={configForm.erpType}
                    onValueChange={(v) => setConfigForm((f) => ({ ...f, erpType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select ERP type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="erpnext">ERPNext</SelectItem>
                      <SelectItem value="sap">SAP Business One</SelectItem>
                      <SelectItem value="odoo">Odoo</SelectItem>
                      <SelectItem value="dynamics">Microsoft Dynamics 365</SelectItem>
                      <SelectItem value="custom">Custom REST API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="erpName">Instance Name</Label>
                  <Input
                    id="erpName"
                    value={configForm.name}
                    onChange={(e) => setConfigForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., ERPNext Production"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="baseUrl" className="flex items-center gap-1">
                    <Globe className="h-3 w-3" /> Base URL
                  </Label>
                  <Input
                    id="baseUrl"
                    value={configForm.baseUrl}
                    onChange={(e) => setConfigForm((f) => ({ ...f, baseUrl: e.target.value }))}
                    placeholder="https://erp.yourcompany.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    {configForm.erpType === "erpnext"
                      ? "ERPNext instance URL (e.g., https://erp.example.com)"
                      : configForm.erpType === "sap"
                      ? "SAP Service Layer URL (e.g., https://sap:50000/b1s/v1)"
                      : configForm.erpType === "odoo"
                      ? "Odoo JSON-RPC URL (e.g., https://odoo.example.com)"
                      : "REST API base URL"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="apiKey" className="flex items-center gap-1">
                    <Key className="h-3 w-3" /> API Key / Token
                  </Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={configForm.apiKey}
                    onChange={(e) => setConfigForm((f) => ({ ...f, apiKey: e.target.value }))}
                    placeholder="API key or authentication token"
                  />
                  <p className="text-xs text-muted-foreground">
                    {configForm.erpType === "erpnext"
                      ? "Generate at Setup → Users → API Access in your ERPNext instance"
                      : configForm.erpType === "sap"
                      ? "SAP B1 Session ID or API key"
                      : "Authentication token for the ERP API"}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Sync Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="syncInterval">Sync Interval (minutes)</Label>
                    <Input
                      id="syncInterval"
                      type="number"
                      min={5}
                      max={1440}
                      value={configForm.syncIntervalMinutes}
                      onChange={(e) =>
                        setConfigForm((f) => ({ ...f, syncIntervalMinutes: parseInt(e.target.value) || 60 }))
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 mt-4">
                  {[
                    { key: "syncEnabled", label: "Enable Sync" },
                    { key: "syncTransactions", label: "Sync Transactions" },
                    { key: "syncAgents", label: "Sync Agents" },
                    { key: "syncInventory", label: "Sync Inventory" },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(configForm as any)[key]}
                        onChange={(e) => setConfigForm((f) => ({ ...f, [key]: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center border-t pt-4">
                <div className="text-sm text-muted-foreground">
                  <Database className="inline h-3 w-3 mr-1" />
                  Changes will be saved to the database and take effect on the next sync cycle.
                </div>
                <Button onClick={handleSaveConfig} disabled={isSavingConfig}>
                  {isSavingConfig && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Configuration
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Integration Guide */}
          <Card>
            <CardHeader>
              <CardTitle>Integration Guide</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none">
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-semibold">ERPNext Setup</h4>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Log in to your ERPNext instance as Administrator</li>
                    <li>Go to <strong>Setup &rarr; Users</strong>, select your integration user</li>
                    <li>Under <strong>API Access</strong>, generate an API Key and Secret</li>
                    <li>Enter the API Key above (format: <code>api_key:api_secret</code>)</li>
                    <li>Set Base URL to your ERPNext domain (e.g., <code>https://erp.company.ng</code>)</li>
                    <li>Click &ldquo;Save Configuration&rdquo; then &ldquo;Sync Now&rdquo; to test the connection</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-semibold">SAP Business One Setup</h4>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Ensure SAP Service Layer is running and accessible</li>
                    <li>Create a service user in SAP with the required permissions</li>
                    <li>Set Base URL to the Service Layer endpoint (e.g., <code>https://sap-server:50000/b1s/v1</code>)</li>
                    <li>Enter the session authentication token</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-semibold">Webhook Integration</h4>
                  <p className="text-muted-foreground">
                    For real-time sync, configure webhooks in your ERP to POST to:
                  </p>
                  <code className="block bg-muted p-2 rounded text-xs mt-1">
                    POST {window.location.origin}/api/trpc/erp.webhook
                  </code>
                  <p className="text-muted-foreground mt-1">
                    Supported events: <code>on_submit</code> (Sales Invoice, Payment Entry, Journal Entry)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "history" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Synchronization History
            </CardTitle>
            <CardDescription>
              Recent sync transactions between InsurePortal and your ERP system
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTx ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : txList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p>No sync transactions yet. Click &ldquo;Sync Now&rdquo; to start.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>ERP Doc Type</TableHead>
                    <TableHead>ERP Doc ID</TableHead>
                    <TableHead>Local Entity</TableHead>
                    <TableHead>Local ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Last Synced</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txList.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <SyncStatusIcon status={tx.syncStatus} />
                          <Badge
                            variant={
                              tx.syncStatus === "Synced"
                                ? "default"
                                : tx.syncStatus === "Failed"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {tx.syncStatus}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{tx.erpDocType}</TableCell>
                      <TableCell>
                        <code className="text-xs">{tx.erpDocId}</code>
                      </TableCell>
                      <TableCell>{tx.localEntityType}</TableCell>
                      <TableCell>{tx.localEntityId}</TableCell>
                      <TableCell>
                        {tx.amount ? `₦${Number(tx.amount).toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell>{tx.currency || "NGN"}</TableCell>
                      <TableCell className="text-xs">
                        {tx.lastSyncAt ? new Date(tx.lastSyncAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "mapping" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Field Mapping Configuration
              </CardTitle>
              <CardDescription>
                Define how InsurePortal fields map to your ERP system fields. These mappings control
                data transformation during synchronization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {Object.entries(DEFAULT_FIELD_MAPPINGS).map(([entity, fields]) => (
                  <div key={entity} className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg capitalize mb-3 flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      {entity === "customer" ? "Customer" : entity === "policy" ? "Policy → Sales Invoice" : entity === "claim" ? "Claim → Payment Entry" : "Agent → Sales Partner"}
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>InsurePortal Field</TableHead>
                          <TableHead>ERP Field</TableHead>
                          <TableHead>Transform</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(fields).map(([localField, erpField]) => (
                          <TableRow key={localField}>
                            <TableCell>
                              <code className="text-xs bg-blue-50 px-2 py-1 rounded">{localField}</code>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-green-50 px-2 py-1 rounded">{erpField}</code>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {localField.includes("Date") ? "ISO 8601 → YYYY-MM-DD" : localField.includes("amount") || localField === "premium" ? "Number → Float(2)" : "Direct"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Webhook Events */}
          <Card>
            <CardHeader>
              <CardTitle>Webhook Events (Real-Time Sync)</CardTitle>
              <CardDescription>
                Configure your ERP to send webhook events for real-time synchronization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ERP Event</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>InsurePortal Action</TableHead>
                    <TableHead>Endpoint</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { event: "Sales Invoice Submit", trigger: "on_submit", action: "Create/Update Policy Payment", endpoint: "/api/trpc/erp.webhook" },
                    { event: "Payment Entry Submit", trigger: "on_submit", action: "Update Claim Payment Status", endpoint: "/api/trpc/erp.webhook" },
                    { event: "Customer Update", trigger: "on_update", action: "Sync Customer Profile", endpoint: "/api/trpc/erp.webhook" },
                    { event: "Journal Entry Submit", trigger: "on_submit", action: "Record Premium Collection", endpoint: "/api/trpc/erp.webhook" },
                    { event: "Sales Partner Update", trigger: "on_update", action: "Sync Agent Commission Rate", endpoint: "/api/trpc/erp.webhook" },
                  ].map((wh, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{wh.event}</TableCell>
                      <TableCell>
                        <code className="text-xs">{wh.trigger}</code>
                      </TableCell>
                      <TableCell>{wh.action}</TableCell>
                      <TableCell>
                        <code className="text-xs">{wh.endpoint}</code>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
