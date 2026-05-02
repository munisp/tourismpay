// @ts-nocheck
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, TrendingUp, DollarSign, CreditCard, Activity, Download, FileText, FileSpreadsheet, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { exportAnalyticsToPDF, downloadCSV } from "@/lib/pdfExport";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/ui/date-range-picker";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

interface AnalyticsProps {
  merchantId: number;
}

export default function Analytics({ merchantId }: AnalyticsProps) {
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "custom">("30d");
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>();
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonDateRange, setComparisonDateRange] = useState<DateRange | undefined>();

  // Calculate date range
  const dateRange = useMemo(() => {
    if (timeRange === "custom" && customDateRange?.from) {
      return {
        startDate: customDateRange.from.toISOString(),
        endDate: (customDateRange.to || customDateRange.from).toISOString(),
      };
    }

    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeRange) {
      case "7d":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(startDate.getDate() - 90);
        break;
    }
    
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [timeRange, customDateRange]);

  // Handle custom date range change
  const handleCustomDateRangeChange = (range: DateRange | undefined) => {
    setCustomDateRange(range);
    if (range?.from) {
      setTimeRange("custom");
    }
  };

  // Calculate comparison date range
  const comparisonRange = useMemo(() => {
    if (!comparisonMode || !comparisonDateRange?.from) return null;
    return {
      startDate: comparisonDateRange.from.toISOString(),
      endDate: (comparisonDateRange.to || comparisonDateRange.from).toISOString(),
    };
  }, [comparisonMode, comparisonDateRange]);

  // Fetch analytics data
  const { data: summary, isLoading: summaryLoading } = trpc.analytics.dashboardSummary.useQuery({
    merchantId,
    ...dateRange,
  });

  const { data: volumeData, isLoading: volumeLoading } = trpc.analytics.transactionVolume.useQuery({
    merchantId,
    groupBy,
    ...dateRange,
  });

  const { data: revenueData, isLoading: revenueLoading } = trpc.analytics.revenueOverTime.useQuery({
    merchantId,
    groupBy,
    ...dateRange,
  });

  const { data: methodData, isLoading: methodLoading } = trpc.analytics.paymentMethodDistribution.useQuery({
    merchantId,
    ...dateRange,
  });

  const { data: statusData, isLoading: statusLoading } = trpc.analytics.statusBreakdown.useQuery({
    merchantId,
    ...dateRange,
  });

  // Fetch comparison data when comparison mode is enabled
  const { data: comparisonSummary } = trpc.analytics.dashboardSummary.useQuery(
    { merchantId, ...comparisonRange! },
    { enabled: comparisonMode && !!comparisonRange }
  );

  const { data: comparisonVolumeData } = trpc.analytics.transactionVolume.useQuery(
    { merchantId, groupBy, ...comparisonRange! },
    { enabled: comparisonMode && !!comparisonRange }
  );

  const { data: comparisonRevenueData } = trpc.analytics.revenueOverTime.useQuery(
    { merchantId, groupBy, ...comparisonRange! },
    { enabled: comparisonMode && !!comparisonRange }
  );

  // Export mutations
  const exportSummaryCSV = trpc.analytics.exportSummaryCSV.useQuery(
    { merchantId, ...dateRange },
    { enabled: false }
  );

  const exportRevenueCSV = trpc.analytics.exportRevenueCSV.useQuery(
    { merchantId, groupBy, ...dateRange },
    { enabled: false }
  );

  const exportVolumeCSV = trpc.analytics.exportVolumeCSV.useQuery(
    { merchantId, groupBy, ...dateRange },
    { enabled: false }
  );

  const exportMethodsCSV = trpc.analytics.exportPaymentMethodsCSV.useQuery(
    { merchantId, ...dateRange },
    { enabled: false }
  );

  // Calculate percentage changes for comparison
  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  // Export handlers
  const handleExportPDF = () => {
    if (!summary || !revenueData || !volumeData || !methodData || !statusData) {
      toast.error("Please wait for data to load before exporting");
      return;
    }

    try {
      exportAnalyticsToPDF({
        merchantName: `Merchant ${merchantId}`,
        dateRange: `${new Date(dateRange.startDate).toLocaleDateString()} - ${new Date(dateRange.endDate).toLocaleDateString()}`,
        summary,
        revenueData,
        volumeData,
        paymentMethods: methodDataWithPercentage,
        statusBreakdown: statusData,
      });
      toast.success("PDF exported successfully!");
    } catch (error) {
      toast.error("Failed to export PDF");
    }
  };

  const handleExportSummaryCSV = async () => {
    try {
      const result = await exportSummaryCSV.refetch();
      if (result.data) {
        downloadCSV(result.data.csv, result.data.filename);
        toast.success("Summary CSV exported successfully!");
      }
    } catch (error) {
      toast.error("Failed to export summary CSV");
    }
  };

  const handleExportRevenueCSV = async () => {
    try {
      const result = await exportRevenueCSV.refetch();
      if (result.data) {
        downloadCSV(result.data.csv, result.data.filename);
        toast.success("Revenue CSV exported successfully!");
      }
    } catch (error) {
      toast.error("Failed to export revenue CSV");
    }
  };

  const handleExportVolumeCSV = async () => {
    try {
      const result = await exportVolumeCSV.refetch();
      if (result.data) {
        downloadCSV(result.data.csv, result.data.filename);
        toast.success("Volume CSV exported successfully!");
      }
    } catch (error) {
      toast.error("Failed to export volume CSV");
    }
  };

  const handleExportMethodsCSV = async () => {
    try {
      const result = await exportMethodsCSV.refetch();
      if (result.data) {
        downloadCSV(result.data.csv, result.data.filename);
        toast.success("Payment methods CSV exported successfully!");
      }
    } catch (error) {
      toast.error("Failed to export payment methods CSV");
    }
  };

  // Calculate percentages for payment methods
  const methodDataWithPercentage = methodData?.map((item) => {
    const total = methodData.reduce((sum, m) => sum + m.count, 0);
    return {
      ...item,
      percentage: total > 0 ? ((item.count / total) * 100).toFixed(1) : "0",
    };
  });

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount / 100);
  };

  // Format number
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {comparisonMode ? "Compare transaction data across different periods" : "Transaction insights and performance metrics"}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">By Day</SelectItem>
              <SelectItem value="week">By Week</SelectItem>
              <SelectItem value="month">By Month</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker
            value={customDateRange}
            onChange={handleCustomDateRangeChange}
          />
          <Button
            variant={comparisonMode ? "default" : "outline"}
            onClick={() => setComparisonMode(!comparisonMode)}
          >
            <GitCompare className="h-4 w-4 mr-2" />
            {comparisonMode ? "Exit Comparison" : "Compare"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSummaryCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Summary CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportRevenueCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Revenue CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportVolumeCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Volume CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportMethodsCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Payment Methods CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Comparison Date Range Selector */}
      {comparisonMode && (
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Primary Period</label>
                <DateRangePicker
                  value={customDateRange}
                  onChange={handleCustomDateRangeChange}
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Comparison Period</label>
                <DateRangePicker
                  value={comparisonDateRange}
                  onChange={setComparisonDateRange}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(summary?.totalRevenue || 0)}</div>
                {comparisonMode && comparisonSummary ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      vs {formatCurrency(comparisonSummary.totalRevenue)}
                    </p>
                    {(() => {
                      const change = calculateChange(summary?.totalRevenue || 0, comparisonSummary.totalRevenue);
                      return (
                        <span className={`text-xs flex items-center ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(change).toFixed(1)}%
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(summary?.completedTransactions || 0)} completed transactions
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{summary?.successRate.toFixed(1)}%</div>
                {comparisonMode && comparisonSummary ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      vs {comparisonSummary.successRate.toFixed(1)}%
                    </p>
                    {(() => {
                      const change = (summary?.successRate || 0) - comparisonSummary.successRate;
                      return (
                        <span className={`text-xs flex items-center ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(change).toFixed(1)}pp
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNumber(summary?.failedTransactions || 0)} failed transactions
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.averageTransactionValue || 0)}
                </div>
                {comparisonMode && comparisonSummary ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      vs {formatCurrency(comparisonSummary.averageTransactionValue)}
                    </p>
                    {(() => {
                      const change = calculateChange(summary?.averageTransactionValue || 0, comparisonSummary.averageTransactionValue);
                      return (
                        <span className={`text-xs flex items-center ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(change).toFixed(1)}%
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Average order value</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatNumber(summary?.totalTransactions || 0)}
                </div>
                {comparisonMode && comparisonSummary ? (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-muted-foreground">
                      vs {formatNumber(comparisonSummary.totalTransactions)}
                    </p>
                    {(() => {
                      const change = calculateChange(summary?.totalTransactions || 0, comparisonSummary.totalTransactions);
                      return (
                        <span className={`text-xs flex items-center ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(change).toFixed(1)}%
                        </span>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">All payment attempts</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="volume">Transaction Volume</TabsTrigger>
          <TabsTrigger value="methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="status">Status Breakdown</TabsTrigger>
        </TabsList>

        {/* Revenue Chart */}
        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Over Time</CardTitle>
              <CardDescription>Track your revenue, refunds, and net revenue</CardDescription>
            </CardHeader>
            <CardContent>
              {revenueLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: "#000" }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Revenue"
                    />
                    <Line
                      type="monotone"
                      dataKey="refunds"
                      stroke="#ef4444"
                      strokeWidth={2}
                      name="Refunds"
                    />
                    <Line
                      type="monotone"
                      dataKey="netRevenue"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Net Revenue"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transaction Volume Chart */}
        <TabsContent value="volume" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Volume</CardTitle>
              <CardDescription>Number of transactions and total amount processed</CardDescription>
            </CardHeader>
            <CardContent>
              {volumeLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => formatCurrency(value)} />
                    <Tooltip
                      formatter={(value: number, name: string) =>
                        name === "count" ? formatNumber(value) : formatCurrency(value)
                      }
                      labelStyle={{ color: "#000" }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" fill="#3b82f6" name="Transaction Count" />
                    <Bar yAxisId="right" dataKey="totalAmount" fill="#10b981" name="Total Amount" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Methods Chart */}
        <TabsContent value="methods" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Payment Method Distribution</CardTitle>
                <CardDescription>Breakdown by payment method</CardDescription>
              </CardHeader>
              <CardContent>
                {methodLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={methodDataWithPercentage}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry) => `${entry.paymentMethod} (${entry.percentage}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="count"
                      >
                        {methodDataWithPercentage?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Method Details</CardTitle>
                <CardDescription>Transaction count and revenue by method</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {methodLoading ? (
                    <>
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </>
                  ) : (
                    methodDataWithPercentage?.map((method, index) => (
                      <div key={method.paymentMethod} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div>
                            <p className="font-medium">{method.paymentMethod}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatNumber(method.count)} transactions
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(method.totalAmount)}</p>
                          <p className="text-sm text-muted-foreground">{method.percentage}%</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Status Breakdown Chart */}
        <TabsContent value="status" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Status Breakdown</CardTitle>
              <CardDescription>Distribution of transaction statuses</CardDescription>
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-80 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={statusData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="status" type="category" width={100} />
                    <Tooltip
                      formatter={(value: number) => formatNumber(value)}
                      labelStyle={{ color: "#000" }}
                    />
                    <Legend />
                    <Bar dataKey="count" fill="#3b82f6" name="Transaction Count" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
