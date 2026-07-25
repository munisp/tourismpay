import { trpc } from "@/lib/trpc";
import { RefreshCw, Hotel, UtensilsCrossed, Home, Music, Car, Wine, Globe, TrendingUp, Users, DollarSign } from "lucide-react";

const MERCHANT_ICONS: Record<string, any> = {
  hotel: Hotel, restaurant: UtensilsCrossed, airbnb: Home,
  concert: Music, transport: Car, nightclub: Wine,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-900/50 text-yellow-400",
  kyb_review: "bg-blue-900/50 text-blue-400",
  approved: "bg-emerald-900/50 text-emerald-400",
  rejected: "bg-red-900/50 text-red-400",
  suspended: "bg-zinc-700 text-zinc-400",
};

export default function JourneyAdminDashboard() {
  const dashboardQuery = trpc.journeyOrchestrator.getJourneyDashboard.useQuery();
  const applicationsQuery = trpc.journeyOrchestrator.listMerchantApplications.useQuery({ limit: 20 });

  const dashboard = dashboardQuery.data;
  const applications = applicationsQuery.data?.applications ?? [];

  const merchantAppsByType = (dashboard?.merchantApplications ?? []).reduce((acc: any, row: any) => {
    if (!acc[row.merchant_type]) acc[row.merchant_type] = {};
    acc[row.merchant_type][row.status] = parseInt(row.count);
    return acc;
  }, {});

  const totalPaymentsNgn = (dashboard?.paymentsByMerchantType ?? []).reduce((sum: number, r: any) => sum + (parseFloat(r.total_ngn) || 0), 0);
  const totalTopupsNgn = (dashboard?.topupsByCurrency ?? []).reduce((sum: number, r: any) => sum + (parseFloat(r.total_ngn) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="h-6 w-6 text-emerald-400" />
            Journey Operations Dashboard
          </h1>
          <p className="text-sm text-zinc-400 mt-1">All merchant onboarding and tourist journey activity</p>
        </div>
        <button onClick={() => { dashboardQuery.refetch(); applicationsQuery.refetch(); }} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Platform KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Merchant Apps", value: applications.length, icon: Users, color: "text-blue-400" },
          { label: "Tourist Profiles", value: (dashboard?.touristProfiles ?? []).reduce((s: number, r: any) => s + parseInt(r.count), 0), icon: Globe, color: "text-emerald-400" },
          { label: "30-Day Payments (NGN)", value: `₦${(totalPaymentsNgn / 1_000_000).toFixed(1)}M`, icon: TrendingUp, color: "text-yellow-400" },
          { label: "30-Day Topups (NGN)", value: `₦${(totalTopupsNgn / 1_000_000).toFixed(1)}M`, icon: DollarSign, color: "text-purple-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-5 w-5 ${color}`} />
              <p className="text-xs text-zinc-400 uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Merchant Applications by Type */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/50">
          <h2 className="text-lg font-semibold text-white">Merchant Applications by Type</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-zinc-700/50">
          {["hotel", "restaurant", "airbnb", "concert", "transport", "nightclub"].map(type => {
            const Icon = MERCHANT_ICONS[type] ?? Globe;
            const typeData = merchantAppsByType[type] ?? {};
            const total = Object.values(typeData).reduce((s: number, v: any) => s + v, 0);
            return (
              <div key={type} className="p-4 text-center">
                <Icon className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-white capitalize">{type}</p>
                <p className="text-2xl font-bold text-white mt-1">{total}</p>
                <div className="mt-2 space-y-1">
                  {Object.entries(typeData).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-xs">
                      <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[status] ?? "bg-zinc-700 text-zinc-400"}`}>{status}</span>
                      <span className="text-zinc-400">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Applications */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-700/50">
          <h2 className="text-lg font-semibold text-white">Recent Merchant Applications</h2>
        </div>
        {applicationsQuery.isLoading ? (
          <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-700/50 rounded-lg animate-pulse" />)}</div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center text-zinc-500"><Users className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>No applications yet</p></div>
        ) : (
          <div className="divide-y divide-zinc-700/50">
            {applications.map((app: any) => {
              const Icon = MERCHANT_ICONS[app.merchant_type] ?? Globe;
              return (
                <div key={app.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-700/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-zinc-900 rounded-lg flex items-center justify-center">
                      <Icon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{app.business_name}</p>
                      <p className="text-xs text-zinc-500">{app.owner_email} · Step {app.onboarding_step}/7</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[app.status] ?? "bg-zinc-700 text-zinc-400"}`}>{app.status}</span>
                    <span className="text-xs text-zinc-500">{new Date(app.created_at * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tourist Topups by Currency */}
      {(dashboard?.topupsByCurrency ?? []).length > 0 && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-700/50">
            <h2 className="text-lg font-semibold text-white">30-Day Wallet Topups by Currency</h2>
          </div>
          <div className="divide-y divide-zinc-700/50">
            {(dashboard?.topupsByCurrency ?? []).map((row: any) => (
              <div key={row.source_currency} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{row.source_currency === "USD" ? "🇺🇸" : row.source_currency === "GBP" ? "🇬🇧" : row.source_currency === "EUR" ? "🇪🇺" : "🔗"}</span>
                  <span className="text-sm font-medium text-white">{row.source_currency}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-white">₦{parseFloat(row.total_ngn).toLocaleString("en-NG", { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-zinc-500">{row.count} topups</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
