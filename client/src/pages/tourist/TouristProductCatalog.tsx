/**
 * TouristProductCatalog — Tourist-facing product catalog for QR payment
 * Accessible at /pay/:token/catalog
 * Loads the merchant's available products, lets the tourist select items,
 * then proceeds to the QR payment confirmation step.
 * Supports date-based slot availability when products have serviceAvailability records.
 */
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart, Plus, Minus, Loader2, AlertCircle,
  ArrowLeft, ArrowRight, Package, Star, CalendarDays,
  CheckCircle, XCircle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";

interface Availability {
  date: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  isBlocked: boolean;
  isAvailable: boolean;
}

interface Product {
  id: number;
  name: string;
  description: string | null;
  category: string;
  price: string;
  currency: string | null;
  imageUrl: string | null;
  sku: string | null;
  featured: boolean | null;
  sortOrder: number | null;
  metadata: Record<string, unknown> | null;
  availability: Availability | null;
}

interface CartItem {
  id: number;
  name: string;
  price: string;
  currency: string;
  qty: number;
  imageUrl?: string | null;
  bookingDate?: string;
}

function formatPrice(price: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(parseFloat(price));
  } catch {
    return `${parseFloat(price).toFixed(2)} ${currency}`;
  }
}

/** Returns today's date as YYYY-MM-DD in local time */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AvailabilityBadge({ avail }: { avail: Availability | null }) {
  if (!avail) return null;
  if (avail.isBlocked) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-red-400">
        <XCircle className="w-3 h-3" /> Blocked
      </div>
    );
  }
  if (avail.availableSlots <= 0) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-red-400">
        <XCircle className="w-3 h-3" /> Full
      </div>
    );
  }
  if (avail.availableSlots <= 3) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-amber-400">
        <Clock className="w-3 h-3" /> {avail.availableSlots} left
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-[10px] text-emerald-400">
      <CheckCircle className="w-3 h-3" /> {avail.availableSlots} slots
    </div>
  );
}

export default function TouristProductCatalog() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());

  // Fetch QR token details to get establishment ID
  const { data: qrToken, isLoading: loadingToken, error: tokenError } = trpc.qrPayment.getToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token, retry: false }
  );

  // Fetch products for the establishment with slot availability for the selected date
  const { data: rawProducts, isLoading: loadingProducts } = trpc.merchantProducts.listForTourist.useQuery(
    { establishmentId: qrToken?.establishmentId ?? 0, date: selectedDate },
    { enabled: !!qrToken?.establishmentId }
  );

  const products = (rawProducts ?? []) as Product[];

  // Determine if any product has availability records (to decide whether to show date picker)
  const hasAvailabilityData = useMemo(
    () => products.some((p) => p.availability !== null),
    [products]
  );

  const categories = useMemo(() => {
    if (!products.length) return [];
    const catSet = new Set(products.map((p) => p.category));
    return Array.from(catSet).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products.length) return [];
    if (activeCategory === "all") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + parseFloat(item.price) * item.qty, 0),
    [cart]
  );

  const cartCurrency = cart[0]?.currency ?? "USD";

  const addToCart = (product: Product) => {
    // Block adding if availability is set and unavailable
    if (product.availability !== null && !product.availability.isAvailable) {
      toast.error(
        product.availability.isBlocked
          ? "This service is not available on the selected date."
          : "No slots remaining for the selected date."
      );
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        // Don't exceed available slots
        const maxQty = product.availability?.availableSlots ?? Infinity;
        if (existing.qty >= maxQty) {
          toast.error(`Only ${maxQty} slot${maxQty === 1 ? "" : "s"} available.`);
          return prev;
        }
        return prev.map((i) => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        price: product.price,
        currency: product.currency ?? "USD",
        qty: 1,
        imageUrl: product.imageUrl,
        bookingDate: hasAvailabilityData ? selectedDate : undefined,
      }];
    });
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter((i) => i.id !== id);
      return prev.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i);
    });
  };

  const getQty = (id: number) => cart.find((i) => i.id === id)?.qty ?? 0;

  const handleProceedToPayment = () => {
    if (!cart.length) {
      toast.error("Add at least one item to your order");
      return;
    }
    if (!token) return;

    const params = new URLSearchParams({
      amount: cartTotal.toFixed(2),
      currency: cartCurrency,
      items: JSON.stringify(cart.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.price,
        currency: i.currency,
        bookingDate: i.bookingDate,
      }))),
    });
    navigate(`/pay/${token}?${params.toString()}`);
  };

  if (!token) return <ErrorState message="Invalid QR code." />;

  if (loadingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tokenError || !qrToken) {
    return <ErrorState message={tokenError?.message ?? "QR code not found or expired."} />;
  }

  if (qrToken.status === "expired") {
    return <ErrorState message="This QR code has expired. Please ask the merchant to generate a new one." />;
  }

  if (qrToken.status === "paid") {
    return <ErrorState message="This QR code has already been paid." />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => history.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{qrToken.establishmentName}</p>
          <p className="text-xs text-muted-foreground">Select items to order</p>
        </div>
        {cart.length > 0 && (
          <Badge className="bg-primary text-primary-foreground">
            {cart.reduce((s, i) => s + i.qty, 0)} items
          </Badge>
        )}
      </div>

      {/* Date picker — only shown when products have availability records */}
      {hasAvailabilityData && (
        <div className="px-4 py-3 border-b border-border bg-card/50 flex items-center gap-3">
          <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 flex items-center gap-2">
            <label htmlFor="booking-date" className="text-xs text-muted-foreground shrink-0">
              Booking date:
            </label>
            <input
              id="booking-date"
              type="date"
              value={selectedDate}
              min={todayStr()}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setCart([]); // Clear cart when date changes to avoid stale slot counts
              }}
              className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {cart.length > 0 && (
            <span className="text-[10px] text-amber-400">Cart cleared on date change</span>
          )}
        </div>
      )}

      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none border-b border-border bg-card/50">
          <button
            onClick={() => setActiveCategory("all")}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {loadingProducts ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !filteredProducts.length ? (
          <div className="text-center py-16 space-y-3">
            <Package className="w-12 h-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">No products available in this category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((product) => {
              const qty = getQty(product.id);
              const unavailable = product.availability !== null && !product.availability.isAvailable;
              return (
                <div
                  key={product.id}
                  className={`bg-card border rounded-xl overflow-hidden transition-all ${
                    unavailable
                      ? "border-border opacity-60"
                      : qty > 0
                        ? "border-primary/50 shadow-md shadow-primary/10"
                        : "border-border"
                  }`}
                >
                  {/* Product image */}
                  <div className="aspect-square bg-muted relative overflow-hidden">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 text-muted-foreground/40" />
                      </div>
                    )}
                    {product.featured && (
                      <div className="absolute top-1.5 left-1.5">
                        <Badge className="bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 gap-0.5">
                          <Star className="w-2.5 h-2.5" /> Featured
                        </Badge>
                      </div>
                    )}
                    {qty > 0 && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <span className="text-[10px] font-bold text-primary-foreground">{qty}</span>
                      </div>
                    )}
                    {unavailable && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-muted-foreground bg-background/80 px-2 py-1 rounded">
                          {product.availability?.isBlocked ? "Unavailable" : "Fully Booked"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Product info */}
                  <div className="p-2.5 space-y-2">
                    <div>
                      <p className="text-xs font-semibold leading-tight line-clamp-2">{product.name}</p>
                      {product.description && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{product.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-primary">
                        {formatPrice(product.price, product.currency ?? "USD")}
                      </span>
                      <AvailabilityBadge avail={product.availability} />
                    </div>

                    {/* Add/remove controls */}
                    {unavailable ? (
                      <div className="h-7 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground">Not available</span>
                      </div>
                    ) : qty === 0 ? (
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => addToCart(product)}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add
                      </Button>
                    ) : (
                      <div className="flex items-center justify-between bg-primary/10 rounded-lg px-2 py-1">
                        <button
                          onClick={() => removeFromCart(product.id)}
                          className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
                        >
                          <Minus className="w-3 h-3 text-primary" />
                        </button>
                        <span className="text-sm font-bold text-primary">{qty}</span>
                        <button
                          onClick={() => addToCart(product)}
                          className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
                        >
                          <Plus className="w-3 h-3 text-primary" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart summary + CTA */}
      {cart.length > 0 && (
        <div className="sticky bottom-0 bg-card border-t border-border p-4 space-y-3">
          {hasAvailabilityData && (
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CalendarDays className="w-3 h-3" />
              Booking for {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>
          )}
          <div className="space-y-1.5 max-h-28 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{item.name} × {item.qty}</span>
                <span className="font-medium">{formatPrice((parseFloat(item.price) * item.qty).toFixed(2), item.currency)}</span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-lg font-bold text-primary">{formatPrice(cartTotal.toFixed(2), cartCurrency)}</p>
            </div>
            <Button onClick={handleProceedToPayment} className="gap-2">
              Pay Now <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Empty state CTA */}
      {!loadingProducts && !cart.length && filteredProducts.length > 0 && (
        <div className="sticky bottom-0 bg-card border-t border-border p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShoppingCart className="w-5 h-5 flex-shrink-0" />
            <span>Add items from the menu above to start your order.</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
        <p className="font-semibold">Cannot load menu</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={() => history.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    </div>
  );
}
