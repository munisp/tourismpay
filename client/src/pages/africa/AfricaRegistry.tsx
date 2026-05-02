import { useState, useMemo } from "react";
import { Globe, MapPin, Building2, Calendar, Search, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

const HERO_URL = "https://private-us-east-1.manuscdn.com/sessionFile/36BK9KyeX17TYTGEkutYJy/sandbox/BxJ4SO21A5gwKBhEpVJjtb-img-3_1771823761000_na1fn_a3liLW9uYm9hcmRpbmctaGVybw.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvMzZCSzlLeWVYMTdUWVRHRWt1dFlKeS9zYW5kYm94L0J4SjRTTzIxQTVnd0tCaEVwVkpqdGItaW1nLTNfMTc3MTgyMzc2MTAwMF9uYTFmbl9hM2xpTFc5dVltOWhjbVJwYm1jdGFHVnlidy5wbmc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=AkiOEUIEovOUOzXWQcj4VKY1eQfIO1GhQoRWO~LnVOflXZSHuEDxkUprVDn-a5ayJ697FakqCpUt~4Jav7T-xrurd1vqoBmlsP6jd2JclRwsh3mpU2rVqes-V3IKvwLd34bP8U5NMIH0wsba5vQvMs86SfRaXrFUPp4udBxrrj87xTZboXozJS2nqWc6BqmTErNJsjLmpbwD4L7IGCMIrOW6CMbLSmZ8yTJnlguE9imWqRpScO5k~-B96Sykaenezn5MUrz4LbQhQfIprp8MRaiqMvIcXjRcoH6klECkV09CKBwgvZLFoyxoAZReO15ocEduNKrqKX-rWB93a0alRQ__";

export default function AfricaRegistry() {
  const [search, setSearch] = useState("");
  const [, navigate] = useLocation();

  // Live data from tRPC
  const { data: countries = [], isLoading: loadingCountries } = trpc.africa.countries.useQuery();
  const { data: events = [], isLoading: loadingEvents } = trpc.africa.events.useQuery();
  const { data: stats } = trpc.africa.dashboardStats.useQuery();

  const filtered = useMemo(() =>
    countries.filter((c: { code: string; name: string }) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.toLowerCase().includes(search.toLowerCase())
    ), [countries, search]
  );

  return (
    <div className="p-6 min-h-full">
      {/* Hero banner */}
      <div className="relative rounded-xl overflow-hidden mb-6 h-36">
        <img src={HERO_URL} alt="Africa KYB" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/60 to-transparent" />
        <div className="relative p-6 flex items-center h-full">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-primary uppercase tracking-wider">Africa Expansion</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Country Registry</h1>
            <p className="text-sm text-muted-foreground">12 active markets · 1,266 establishments · 41 tourism events</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 stagger-children">
        <StatCard label="Active Countries" value="12" color="green" icon={Globe} animationDelay={0} />
        <StatCard label="Establishments" value="1,266" trend="up" trendValue="+23 this month" color="blue" icon={Building2} animationDelay={50} />
        <StatCard label="Tourism Events" value="41" color="amber" icon={Calendar} animationDelay={100} />
        <StatCard label="Compliance Rate" value="94.2" unit="%" color="green" icon={MapPin} animationDelay={150} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Countries grid */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search countries..."
                className="pl-8 h-8 text-xs bg-white/5 border-border"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((c, i) => (
              <div
                key={c.code}
                className="glass-card p-3.5 hover:bg-white/5 transition-colors cursor-pointer animate-fade-in-up opacity-0 group"
                style={{ animationDelay: `${i * 30}ms`, animationFillMode: "forwards" }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-mono font-bold text-muted-foreground">{c.code}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.capital} · {c.currency}</p>
                    </div>
                  </div>
                  <span className="badge-green text-[10px] px-1.5 py-0.5 rounded font-mono">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <p className="text-muted-foreground">Major Events</p>
                      <p className="font-mono font-bold text-[oklch(0.82_0.18_75)]">{c.majorEvents?.length ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Region</p>
                      <p className="font-mono font-bold text-primary text-[10px]">{c.region}</p>
                    </div>
                  </div>
                  <button onClick={() => navigate(`/africa/kyb?country=${c.code}`)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10">
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tourism events */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Major Tourism Events</h3>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            {(events as Array<{ name?: string; country?: string; date?: string; type?: string; establishments?: number; id?: string }>).map((ev, i) => (
              <div key={i} className="p-3 rounded-md bg-white/3 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between mb-1">
                  <p className="text-xs font-semibold text-foreground leading-tight">{ev.name ?? "Unnamed Event"}</p>
                  <span className="badge-blue text-[10px] px-1.5 py-0.5 rounded ml-2 shrink-0">{ev.country ?? ""}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="font-mono">{ev.date ?? ""}</span>
                  <span>{ev.type ?? ""}</span>
                  {ev.establishments != null && <span className="text-primary">{ev.establishments} venues</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
