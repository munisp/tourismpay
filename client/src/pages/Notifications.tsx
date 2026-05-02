import { useState } from "react";
import { useLocation } from "wouter";
import {
  Bell, CheckCheck, Trash2, ExternalLink, Loader2,
  Shield, FileCheck, AlertTriangle, Activity, FileText, Settings, Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";

// ─── Category helpers ─────────────────────────────────────────────────────────

const categoryConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  kyb:    { icon: FileCheck,      color: "text-blue-400",    label: "KYB" },
  bis:    { icon: Shield,         color: "text-emerald-400", label: "BIS" },
  fraud:  { icon: AlertTriangle,  color: "text-red-400",     label: "Fraud" },
  soc:    { icon: Activity,       color: "text-orange-400",  label: "SOC" },
  report: { icon: FileText,       color: "text-purple-400",  label: "Report" },
  system: { icon: Settings,       color: "text-gray-400",    label: "System" },
  wallet: { icon: Wallet,         color: "text-amber-400",   label: "Wallet" },
};

// Tab definitions — "all" is a virtual tab that shows everything
const TABS = [
  { id: "all",    label: "All",             icon: Bell },
  { id: "wallet", label: "Spending Alerts", icon: Wallet },
  { id: "bis",    label: "BIS",             icon: Shield },
  { id: "kyb",    label: "KYB",             icon: FileCheck },
  { id: "fraud",  label: "Fraud",           icon: AlertTriangle },
  { id: "system", label: "System",          icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Notification Item ────────────────────────────────────────────────────────

type NotifRow = {
  id: number;
  category: string;
  title: string;
  content: string;
  actionUrl?: string | null;
  actionLabel?: string | null;
  isRead: boolean;
  createdAt: Date | string;
};

function NotificationItem({
  notif,
  onMarkRead,
  onDelete,
  onNavigate,
}: {
  notif: NotifRow;
  onMarkRead: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigate: (url: string) => void;
}) {
  const cat = categoryConfig[notif.category] ?? categoryConfig.system;
  const Icon = cat.icon;

  return (
    <div
      className={`flex gap-3 p-4 border-b border-border/30 transition-colors hover:bg-white/3 ${
        !notif.isRead ? "bg-white/5" : ""
      }`}
    >
      {/* Category icon */}
      <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-white/5 ${cat.color}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            {!notif.isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
            )}
            <span className="text-xs font-semibold text-foreground leading-tight">{notif.title}</span>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {timeAgo(notif.createdAt)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">{notif.content}</p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-0 bg-white/5 ${cat.color}`}>
            {cat.label}
          </Badge>
          {notif.actionUrl && (
            <button
              className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
              onClick={() => onNavigate(notif.actionUrl!)}
            >
              {notif.actionLabel ?? "View"} <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 shrink-0">
        {!notif.isRead && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title="Mark as read"
            onClick={() => onMarkRead(notif.id)}
          >
            <CheckCheck className="w-3 h-3" />
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
          title="Delete"
          onClick={() => onDelete(notif.id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Notifications() {
  const [, navigate] = useLocation();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("all");

  const utils = trpc.useUtils();

  const { data: notifications, isLoading, refetch } = trpc.notifications.list.useQuery(
    { limit: 100, offset: 0, unreadOnly },
    { refetchInterval: 30_000 }
  );

  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 }
  );

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: (data) => {
      toast.success(`Marked ${data.updated} notifications as read`);
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.notifications.delete.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const unreadCount = unreadData?.count ?? 0;
  const allNotifs = notifications ?? [];

  // Filter by active tab
  const filteredNotifs = activeTab === "all"
    ? allNotifs
    : allNotifs.filter((n) => n.category === activeTab);

  // Count per tab for badges
  const countByCategory = allNotifs.reduce<Record<string, number>>((acc, n) => {
    if (!n.isRead) acc[n.category] = (acc[n.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 min-h-full max-w-3xl mx-auto">
      <PageHeader
        title="Notifications"
        subtitle="Stay updated on investigations, KYB reviews, spending alerts, and platform events"
        actions={
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-border bg-white/5"
                disabled={markAllReadMutation.isPending}
                onClick={() => markAllReadMutation.mutate()}
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                ) : (
                  <CheckCheck className="w-3 h-3 mr-1" />
                )}
                Mark All Read
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-border bg-white/5"
              onClick={() => refetch()}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Category tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const tabUnread = tab.id === "all"
            ? unreadCount
            : (countByCategory[tab.id] ?? 0);
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 text-[10px] font-mono uppercase px-3 py-1.5 rounded-full border whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white/5 text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              <TabIcon className="w-3 h-3" />
              {tab.label}
              {tabUnread > 0 && (
                <span className={`text-[9px] px-1 rounded-full ${isActive ? "bg-white/20" : "bg-primary/20 text-primary"}`}>
                  {tabUnread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Unread filter pill */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`text-[10px] font-mono uppercase px-3 py-1 rounded-full border transition-colors ${
            !unreadOnly
              ? "bg-primary/20 text-primary border-primary/40"
              : "bg-white/5 text-muted-foreground border-border hover:border-primary/50"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`text-[10px] font-mono uppercase px-3 py-1 rounded-full border transition-colors flex items-center gap-1 ${
            unreadOnly
              ? "bg-primary/20 text-primary border-primary/40"
              : "bg-white/5 text-muted-foreground border-border hover:border-primary/50"
          }`}
        >
          Unread
          {unreadCount > 0 && (
            <span className={`text-[9px] px-1 rounded-full ${unreadOnly ? "bg-primary/20" : "bg-primary/20 text-primary"}`}>
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Spending Limit Alerts info banner */}
      {activeTab === "wallet" && (
        <div className="glass-card p-3 mb-4 flex items-start gap-3 border border-amber-400/20">
          <Wallet className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-400">Spending Limit Alerts</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              These notifications are triggered when a wallet transaction is blocked because a daily or monthly spending limit was exceeded. Configure limits in the Digital Wallet page.
            </p>
          </div>
        </div>
      )}

      {/* Notifications list */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading notifications...
          </div>
        ) : filteredNotifs.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {unreadOnly
                ? "No unread notifications"
                : activeTab === "wallet"
                  ? "No spending limit alerts yet"
                  : activeTab !== "all"
                    ? `No ${categoryConfig[activeTab]?.label ?? activeTab} notifications yet`
                    : "No notifications yet"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {activeTab === "wallet"
                ? "Spending limit alerts appear here when a transaction is blocked by your configured daily or monthly budget."
                : "Notifications will appear here when investigations complete, documents are reviewed, or alerts are triggered."}
            </p>
          </div>
        ) : (
          filteredNotifs.map((notif) => (
            <NotificationItem
              key={notif.id}
              notif={notif as NotifRow}
              onMarkRead={(id) => markReadMutation.mutate({ notificationId: id })}
              onDelete={(id) => deleteMutation.mutate({ notificationId: id })}
              onNavigate={(url) => navigate(url)}
            />
          ))
        )}
      </div>
    </div>
  );
}
