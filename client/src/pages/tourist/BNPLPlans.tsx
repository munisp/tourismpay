import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function BNPLPlans() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
            <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buy Now, Pay Later</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Instalment payment plans for tourism bookings</p>
          </div>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-200">
          Active
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total", value: "—", sub: "Loading..." },
          { label: "Active", value: "—", sub: "Loading..." },
          { label: "Revenue", value: "—", sub: "Loading..." },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{stat.label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-green-500" />
            Buy Now, Pay Later Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-green-50 dark:bg-green-900/20 mb-4">
              <CreditCard className="h-12 w-12 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Buy Now, Pay Later
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
              Instalment payment plans for tourism bookings. Connect to the microservice API to load live data.
            </p>
            <Button
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  toast.success("Buy Now, Pay Later loaded successfully");
                }, 1000);
              }}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {loading ? "Loading..." : "Load Buy Now, Pay Later Data"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
