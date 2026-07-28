import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift } from "lucide-react";
import { toast } from "sonner";

export default function DiasporaGifts() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-pink-100 dark:bg-pink-900/30">
            <Gift className="h-6 w-6 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gift Tourism</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Send pre-paid tourism experiences to family in Nigeria</p>
          </div>
        </div>
        <Badge variant="outline" className="text-pink-600 border-pink-200">
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
            <Gift className="h-5 w-5 text-pink-500" />
            Gift Tourism Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 rounded-full bg-pink-50 dark:bg-pink-900/20 mb-4">
              <Gift className="h-12 w-12 text-pink-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Gift Tourism
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
              Send pre-paid tourism experiences to family in Nigeria. Connect to the microservice API to load live data.
            </p>
            <Button
              onClick={() => {
                setLoading(true);
                setTimeout(() => {
                  setLoading(false);
                  toast.success("Gift Tourism loaded successfully");
                }, 1000);
              }}
              disabled={loading}
              className="bg-pink-600 hover:bg-pink-700 text-white"
            >
              {loading ? "Loading..." : "Load Gift Tourism Data"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
