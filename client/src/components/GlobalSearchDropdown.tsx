import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, Building2, Shield, FileCheck, X, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: number;
  category: "establishment" | "investigation" | "kyb_application";
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  badgeColor?: string;
}

const CATEGORY_ICONS = {
  establishment: Building2,
  investigation: Shield,
  kyb_application: FileCheck,
};

const CATEGORY_LABELS = {
  establishment: "Establishment",
  investigation: "BIS Investigation",
  kyb_application: "KYB Application",
};

const BADGE_VARIANTS: Record<string, string> = {
  green: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  red: "bg-red-500/20 text-red-400 border-red-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  gray: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export function GlobalSearchDropdown() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce query updates
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const { data, isFetching } = trpc.search.global.useQuery(
    { query: debouncedQuery },
    {
      enabled: debouncedQuery.length >= 2,
      staleTime: 30_000,
    }
  );

  const results: SearchResult[] = data?.items ?? [];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Open dropdown when results arrive
  useEffect(() => {
    if (results.length > 0 && query.length >= 2) {
      setIsOpen(true);
      setActiveIndex(-1);
    } else if (query.length < 2) {
      setIsOpen(false);
    }
  }, [results, query]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      navigate(result.href);
      setQuery("");
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [navigate]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  const showNoResults =
    isOpen && debouncedQuery.length >= 2 && !isFetching && results.length === 0;

  return (
    <div ref={dropdownRef} className="relative w-full max-w-md">
      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0 && query.length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search investigations, businesses..."
          className="w-full h-9 pl-9 pr-8 rounded-md border border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors"
          aria-label="Global search"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          role="combobox"
        />
        {isFetching && query.length >= 2 && (
          <Loader2 className="absolute right-3 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        {!isFetching && query.length > 0 && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (results.length > 0 || showNoResults) && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-popover shadow-xl overflow-hidden"
          role="listbox"
        >
          {showNoResults ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results found for &ldquo;{debouncedQuery}&rdquo;
            </div>
          ) : (
            <>
              {/* Group by category */}
              {(["establishment", "investigation", "kyb_application"] as const).map(
                (cat) => {
                  const catResults = results.filter((r) => r.category === cat);
                  if (catResults.length === 0) return null;
                  const Icon = CATEGORY_ICONS[cat];
                  return (
                    <div key={cat}>
                      <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30 border-b border-border/50">
                        <Icon className="h-3 w-3" />
                        {CATEGORY_LABELS[cat]}s
                      </div>
                      {catResults.map((result) => {
                        const globalIdx = results.indexOf(result);
                        return (
                          <button
                            key={`${result.category}-${result.id}`}
                            role="option"
                            aria-selected={activeIndex === globalIdx}
                            onClick={() => handleSelect(result)}
                            onMouseEnter={() => setActiveIndex(globalIdx)}
                            className={cn(
                              "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors border-b border-border/30 last:border-0",
                              activeIndex === globalIdx
                                ? "bg-accent text-accent-foreground"
                                : "hover:bg-accent/50"
                            )}
                          >
                            <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">
                                  {result.title}
                                </span>
                                {result.badge && (
                                  <span
                                    className={cn(
                                      "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border shrink-0",
                                      BADGE_VARIANTS[result.badgeColor ?? "gray"]
                                    )}
                                  >
                                    {result.badge.replace(/_/g, " ")}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {result.subtitle}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                }
              )}

              {/* Footer */}
              {data && data.counts.total > 0 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/20 border-t border-border/50">
                  {data.counts.total} result{data.counts.total !== 1 ? "s" : ""} found
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
