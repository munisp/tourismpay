/**
 * Merchant Product Catalog
 * Allows merchants to add, edit, toggle availability, and delete products/menu items
 * for their establishment. Products are grouped by category.
 * Supports product image upload (base64 → S3) with thumbnail preview.
 *
 * Round 111: Added service-type-specific Quick Setup templates for hotels, tour operators,
 * spas, and other establishment types. Templates pre-fill the product form with
 * type-specific fields stored in the metadata JSON column.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Star,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  X,
  Loader2,
  Wand2,
  Hotel,
  MapPin,
  Sparkles,
  Utensils,
  Car,
  Plane,
  Building2,
  TreePine,
  Dumbbell,
} from "lucide-react";

const PRODUCT_CATEGORIES = [
  "food",
  "beverages",
  "accommodation",
  "tours",
  "transport",
  "souvenirs",
  "spa",
  "entertainment",
  "general",
];

const CURRENCIES = ["USD", "NGN", "KES", "GHS", "ZAR", "EUR", "GBP"];

type ProductForm = {
  name: string;
  description: string;
  category: string;
  price: string;
  currency: string;
  sku: string;
  available: boolean;
  featured: boolean;
  imageUrl: string;
  // Extended metadata fields (stored in metadata JSON column)
  meta: Record<string, string>;
};

const defaultForm: ProductForm = {
  name: "",
  description: "",
  category: "general",
  price: "",
  currency: "USD",
  sku: "",
  available: true,
  featured: false,
  imageUrl: "",
  meta: {},
};

// ── Service-type templates ─────────────────────────────────────────────────────

interface ServiceTemplate {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  /** Establishment types this template applies to */
  forTypes: string[];
  /** Pre-filled form values */
  defaults: Partial<ProductForm>;
  /** Extra metadata fields to show in the form */
  metaFields: Array<{
    key: string;
    label: string;
    placeholder: string;
    type?: "text" | "number" | "select";
    options?: string[];
  }>;
}

const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    id: "hotel_room",
    label: "Hotel Room",
    icon: Hotel,
    description: "Standard or deluxe room with bed configuration and occupancy",
    forTypes: ["hotel", "beach_resort"],
    defaults: { category: "accommodation", currency: "USD" },
    metaFields: [
      { key: "bedType", label: "Bed Type", placeholder: "e.g. King, Twin, Double", type: "select", options: ["King", "Queen", "Twin", "Double", "Single", "Suite"] },
      { key: "maxOccupancy", label: "Max Occupancy", placeholder: "e.g. 2", type: "number" },
      { key: "floorNumber", label: "Floor", placeholder: "e.g. 3", type: "number" },
      { key: "viewType", label: "View", placeholder: "e.g. Ocean, Garden, City", type: "select", options: ["Ocean", "Garden", "City", "Pool", "Mountain", "No view"] },
      { key: "roomSize", label: "Room Size (m²)", placeholder: "e.g. 32", type: "number" },
    ],
  },
  {
    id: "tour_package",
    label: "Tour Package",
    icon: MapPin,
    description: "Guided tour with duration, group size, and meeting point",
    forTypes: ["tour_operator", "safari_lodge", "travel_agency"],
    defaults: { category: "tours", currency: "USD" },
    metaFields: [
      { key: "durationHours", label: "Duration (hours)", placeholder: "e.g. 4", type: "number" },
      { key: "maxGroupSize", label: "Max Group Size", placeholder: "e.g. 12", type: "number" },
      { key: "departureTime", label: "Departure Time", placeholder: "e.g. 08:00 AM" },
      { key: "meetingPoint", label: "Meeting Point", placeholder: "e.g. Hotel lobby, Main gate" },
      { key: "difficulty", label: "Difficulty", placeholder: "Easy / Moderate / Challenging", type: "select", options: ["Easy", "Moderate", "Challenging", "Expert"] },
      { key: "includes", label: "What's Included", placeholder: "e.g. Lunch, transport, guide" },
    ],
  },
  {
    id: "spa_treatment",
    label: "Spa Treatment",
    icon: Sparkles,
    description: "Massage, facial, or wellness treatment with duration and room type",
    forTypes: ["spa_wellness", "hotel", "beach_resort"],
    defaults: { category: "spa", currency: "USD" },
    metaFields: [
      { key: "durationMinutes", label: "Duration (minutes)", placeholder: "e.g. 60", type: "number" },
      { key: "treatmentType", label: "Treatment Type", placeholder: "e.g. Swedish Massage", type: "select", options: ["Swedish Massage", "Deep Tissue", "Hot Stone", "Facial", "Body Wrap", "Aromatherapy", "Reflexology", "Manicure", "Pedicure", "Other"] },
      { key: "roomType", label: "Room Type", placeholder: "e.g. Single, Couple", type: "select", options: ["Single", "Couple", "Group", "Open area"] },
      { key: "therapistGender", label: "Therapist Preference", placeholder: "Any / Female / Male", type: "select", options: ["Any", "Female", "Male"] },
    ],
  },
  {
    id: "restaurant_dish",
    label: "Menu Item",
    icon: Utensils,
    description: "Food or beverage item with cuisine type and dietary tags",
    forTypes: ["restaurant", "nightclub", "conference_center"],
    defaults: { category: "food", currency: "USD" },
    metaFields: [
      { key: "cuisineType", label: "Cuisine Type", placeholder: "e.g. African, Italian, Asian", type: "select", options: ["African", "Italian", "Asian", "American", "Mediterranean", "French", "Mexican", "Indian", "Fusion", "Other"] },
      { key: "dietaryTags", label: "Dietary Tags", placeholder: "e.g. Vegan, Gluten-free, Halal" },
      { key: "spiceLevel", label: "Spice Level", placeholder: "Mild / Medium / Hot", type: "select", options: ["None", "Mild", "Medium", "Hot", "Extra Hot"] },
      { key: "servingSize", label: "Serving Size", placeholder: "e.g. 250g, 1 portion" },
    ],
  },
  {
    id: "car_rental",
    label: "Vehicle Rental",
    icon: Car,
    description: "Car or vehicle rental with type, capacity, and daily rate",
    forTypes: ["car_rental"],
    defaults: { category: "transport", currency: "USD" },
    metaFields: [
      { key: "vehicleType", label: "Vehicle Type", placeholder: "e.g. Sedan, SUV, Van", type: "select", options: ["Sedan", "SUV", "4x4", "Van", "Minibus", "Luxury", "Motorbike", "Bicycle"] },
      { key: "seatingCapacity", label: "Seating Capacity", placeholder: "e.g. 5", type: "number" },
      { key: "transmission", label: "Transmission", placeholder: "Automatic / Manual", type: "select", options: ["Automatic", "Manual"] },
      { key: "fuelType", label: "Fuel Type", placeholder: "Petrol / Diesel / Electric", type: "select", options: ["Petrol", "Diesel", "Electric", "Hybrid"] },
      { key: "includesDriver", label: "Includes Driver", placeholder: "Yes / No", type: "select", options: ["Yes", "No"] },
    ],
  },
  {
    id: "flight_seat",
    label: "Flight / Seat Class",
    icon: Plane,
    description: "Airline seat class with route and baggage allowance",
    forTypes: ["airline"],
    defaults: { category: "transport", currency: "USD" },
    metaFields: [
      { key: "seatClass", label: "Seat Class", placeholder: "Economy / Business / First", type: "select", options: ["Economy", "Premium Economy", "Business", "First"] },
      { key: "route", label: "Route", placeholder: "e.g. LOS → NBO" },
      { key: "baggageKg", label: "Baggage Allowance (kg)", placeholder: "e.g. 23", type: "number" },
      { key: "mealIncluded", label: "Meal Included", placeholder: "Yes / No", type: "select", options: ["Yes", "No"] },
    ],
  },
  {
    id: "event_ticket",
    label: "Event Ticket",
    icon: Building2,
    description: "Concert, sports, or museum admission ticket with zone/section",
    forTypes: ["concert_venue", "museum", "theme_park", "sports_venue", "nightclub"],
    defaults: { category: "entertainment", currency: "USD" },
    metaFields: [
      { key: "zone", label: "Zone / Section", placeholder: "e.g. VIP, General, Section A" },
      { key: "eventDate", label: "Event Date", placeholder: "e.g. 2026-04-15" },
      { key: "eventTime", label: "Event Time", placeholder: "e.g. 7:00 PM" },
      { key: "ageRestriction", label: "Age Restriction", placeholder: "e.g. 18+, All ages", type: "select", options: ["All ages", "13+", "16+", "18+", "21+"] },
    ],
  },
  {
    id: "safari_experience",
    label: "Safari Experience",
    icon: TreePine,
    description: "Game drive or bush walk with vehicle type and duration",
    forTypes: ["safari_lodge"],
    defaults: { category: "tours", currency: "USD" },
    metaFields: [
      { key: "experienceType", label: "Experience Type", placeholder: "Game Drive / Bush Walk / Night Drive", type: "select", options: ["Morning Game Drive", "Afternoon Game Drive", "Night Drive", "Bush Walk", "Boat Safari", "Hot Air Balloon"] },
      { key: "durationHours", label: "Duration (hours)", placeholder: "e.g. 3", type: "number" },
      { key: "maxGuests", label: "Max Guests per Vehicle", placeholder: "e.g. 6", type: "number" },
      { key: "vehicleType", label: "Vehicle Type", placeholder: "e.g. Open 4x4, Boat", type: "select", options: ["Open 4x4", "Closed 4x4", "Boat", "Walking (guided)", "Helicopter"] },
    ],
  },
  {
    id: "gym_class",
    label: "Fitness Class / Gym",
    icon: Dumbbell,
    description: "Fitness class or gym day pass with capacity and instructor",
    forTypes: ["spa_wellness", "hotel", "sports_venue", "beach_resort"],
    defaults: { category: "entertainment", currency: "USD" },
    metaFields: [
      { key: "classType", label: "Class Type", placeholder: "e.g. Yoga, HIIT, Pilates", type: "select", options: ["Yoga", "HIIT", "Pilates", "Spin", "Zumba", "CrossFit", "Swimming", "Tennis", "Day Pass"] },
      { key: "durationMinutes", label: "Duration (minutes)", placeholder: "e.g. 60", type: "number" },
      { key: "maxCapacity", label: "Max Capacity", placeholder: "e.g. 15", type: "number" },
      { key: "equipmentProvided", label: "Equipment Provided", placeholder: "Yes / No", type: "select", options: ["Yes", "No", "Partial"] },
    ],
  },
];

// ── Image upload helper ────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<{ base64Data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(",")[1] ?? "";
      resolve({ base64Data, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Image upload widget ────────────────────────────────────────────────────────

function ProductImageUpload({
  establishmentId,
  imageUrl,
  onUploaded,
}: {
  establishmentId: number;
  imageUrl: string;
  onUploaded: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(imageUrl);

  const uploadMut = trpc.merchantProducts.uploadImage.useMutation({
    onSuccess: (data) => {
      onUploaded(data.url);
      setPreviewUrl(data.url);
      setUploading(false);
      toast.success("Image uploaded");
    },
    onError: (e) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!ALLOWED.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP, or GIF images are allowed");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image must be under 3 MB");
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);
    try {
      const { base64Data, mimeType } = await readFileAsBase64(file);
      uploadMut.mutate({
        establishmentId,
        base64Data,
        mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        filename: file.name,
      });
    } catch {
      setUploading(false);
      toast.error("Failed to read image file");
    }
  };

  const handleRemove = () => {
    setPreviewUrl("");
    onUploaded("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-1">
      <Label>Product Image</Label>
      <div className="flex items-start gap-3">
        <div
          className="relative w-20 h-20 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0 cursor-pointer group"
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="Product" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <ImagePlus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            Click the box to upload a product photo. Accepted: JPEG, PNG, WebP, GIF. Max 3 MB.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Uploading…</>
            ) : (
              <><ImagePlus className="w-3 h-3 mr-1" /> {previewUrl ? "Change Image" : "Upload Image"}</>
            )}
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ── Quick Setup Template Picker ────────────────────────────────────────────────

function QuickSetupBanner({
  establishmentType,
  onSelectTemplate,
}: {
  establishmentType: string;
  onSelectTemplate: (template: ServiceTemplate) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const applicable = SERVICE_TEMPLATES.filter((t) =>
    t.forTypes.includes(establishmentType)
  );

  if (!applicable.length) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="py-3 px-4 cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-semibold text-primary">
              Quick Setup Templates
            </CardTitle>
            <Badge variant="outline" className="text-xs border-primary/40 text-primary">
              {applicable.length} available
            </Badge>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <p className="text-xs text-muted-foreground mb-3">
            Select a template to pre-fill the product form with fields specific to your establishment type.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {applicable.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => onSelectTemplate(template)}
                  className="flex flex-col items-start gap-1 p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-medium">{template.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {template.description}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Meta fields editor (shown inside the product dialog) ──────────────────────

function MetaFieldsEditor({
  fields,
  meta,
  onChange,
}: {
  fields: ServiceTemplate["metaFields"];
  meta: Record<string, string>;
  onChange: (meta: Record<string, string>) => void;
}) {
  if (!fields.length) return null;

  const set = (key: string, value: string) => onChange({ ...meta, [key]: value });

  return (
    <>
      <Separator />
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Service Details
        </p>
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <div key={field.key} className={`space-y-1 ${field.key === "includes" || field.key === "meetingPoint" ? "col-span-2" : ""}`}>
              <Label className="text-xs">{field.label}</Label>
              {field.type === "select" && field.options ? (
                <Select
                  value={meta[field.key] ?? ""}
                  onValueChange={(v) => set(field.key, v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={field.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  type={field.type === "number" ? "number" : "text"}
                  placeholder={field.placeholder}
                  value={meta[field.key] ?? ""}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MerchantProducts() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: establishments, isLoading: estLoading } =
    trpc.merchantRevenue.myEstablishments.useQuery();

  const [selectedEstId, setSelectedEstId] = useState<number | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [activeTemplate, setActiveTemplate] = useState<ServiceTemplate | null>(null);

  const estId = selectedEstId ?? establishments?.[0]?.id ?? 0;
  const currentEst = establishments?.find((e) => e.id === estId);

  const { data: products, isLoading: productsLoading } =
    trpc.merchantProducts.list.useQuery(
      { establishmentId: estId },
      { enabled: estId > 0 }
    );

  const createMut = trpc.merchantProducts.create.useMutation({
    onSuccess: () => {
      utils.merchantProducts.list.invalidate({ establishmentId: estId });
      toast.success("Product added successfully");
      setShowDialog(false);
      setForm(defaultForm);
      setActiveTemplate(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.merchantProducts.update.useMutation({
    onSuccess: () => {
      utils.merchantProducts.list.invalidate({ establishmentId: estId });
      toast.success("Product updated");
      setShowDialog(false);
      setEditingId(null);
      setForm(defaultForm);
      setActiveTemplate(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.merchantProducts.toggleAvailability.useMutation({
    onMutate: async ({ id }) => {
      await utils.merchantProducts.list.cancel({ establishmentId: estId });
      const prev = utils.merchantProducts.list.getData({ establishmentId: estId });
      utils.merchantProducts.list.setData({ establishmentId: estId }, (old) =>
        old?.map((p) => (p.id === id ? { ...p, available: !p.available } : p))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      utils.merchantProducts.list.setData({ establishmentId: estId }, ctx?.prev);
    },
    onSettled: () => {
      utils.merchantProducts.list.invalidate({ establishmentId: estId });
    },
  });

  const deleteMut = trpc.merchantProducts.delete.useMutation({
    onSuccess: () => {
      utils.merchantProducts.list.invalidate({ establishmentId: estId });
      toast.success("Product deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setActiveTemplate(null);
    setShowDialog(true);
  };

  const openEdit = (p: NonNullable<typeof products>[number]) => {
    setEditingId(p.id);
    setActiveTemplate(null);
    const existingMeta = (p.metadata as Record<string, string> | null) ?? {};
    setForm({
      name: p.name,
      description: p.description ?? "",
      category: p.category,
      price: p.price,
      currency: p.currency,
      sku: p.sku ?? "",
      available: p.available,
      featured: p.featured,
      imageUrl: p.imageUrl ?? "",
      meta: existingMeta,
    });
    setShowDialog(true);
  };

  const applyTemplate = (template: ServiceTemplate) => {
    setActiveTemplate(template);
    setForm((f) => ({
      ...f,
      ...template.defaults,
      name: f.name || template.label,
      meta: {},
    }));
    setShowDialog(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("Product name is required");
    if (!form.price || isNaN(parseFloat(form.price)))
      return toast.error("Valid price is required");
    const payload = {
      ...form,
      imageUrl: form.imageUrl || undefined,
      sku: form.sku || undefined,
      price: form.price,
      // Merge template meta into the metadata field
      metadata: Object.keys(form.meta).length > 0 ? form.meta : undefined,
    };
    if (editingId) {
      updateMut.mutate({ id: editingId, establishmentId: estId, ...payload });
    } else {
      createMut.mutate({ establishmentId: estId, ...payload });
    }
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group products by category
  const grouped = (products ?? []).reduce(
    (acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push(p);
      return acc;
    },
    {} as Record<string, NonNullable<typeof products>>
  );

  if (!user) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-primary" />
            Product Catalog
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your products and menu items for tourist-facing QR payments
          </p>
        </div>
        <Button onClick={openCreate} disabled={estId === 0}>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Establishment selector */}
      {estLoading ? (
        <div className="h-10 bg-muted animate-pulse rounded" />
      ) : !establishments?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No verified establishment found.</p>
            <p className="text-xs mt-1">
              Complete restaurant onboarding first to manage products.
            </p>
          </CardContent>
        </Card>
      ) : (
        establishments.length > 1 && (
          <div className="flex items-center gap-3">
            <Label className="text-sm">Establishment:</Label>
            <Select
              value={String(estId)}
              onValueChange={(v) => setSelectedEstId(Number(v))}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {establishments.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      )}

      {/* Quick Setup Templates — shown when establishment has no products yet */}
      {currentEst && !productsLoading && (!products || products.length === 0) && (
        <QuickSetupBanner
          establishmentType={currentEst.type}
          onSelectTemplate={applyTemplate}
        />
      )}

      {/* Stats bar */}
      {products && products.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{products.length}</p>
              <p className="text-xs text-muted-foreground">Total Products</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-green-500">
                {products.filter((p) => p.available).length}
              </p>
              <p className="text-xs text-muted-foreground">Available</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold text-amber-500">
                {products.filter((p) => p.featured).length}
              </p>
              <p className="text-xs text-muted-foreground">Featured</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Products grouped by category */}
      {productsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !products?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No products yet</p>
            <p className="text-xs mt-1">
              Use a Quick Setup template above or add a product manually.
            </p>
            <Button className="mt-4" size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <Card key={category}>
              <CardHeader
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => toggleCategory(category)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {collapsedCategories.has(category) ? (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                    <Tag className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm font-semibold capitalize">
                      {category}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs">
                      {items.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              {!collapsedCategories.has(category) && (
                <CardContent className="pt-0 pb-3 px-4">
                  <div className="divide-y divide-border">
                    {items.map((product) => {
                      const meta = (product.metadata as Record<string, string> | null) ?? {};
                      const metaEntries = Object.entries(meta).filter(([, v]) => v);
                      return (
                        <div
                          key={product.id}
                          className="flex items-center justify-between py-3 gap-4"
                        >
                          {/* Thumbnail */}
                          <div className="w-10 h-10 rounded-lg border border-border bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {product.name}
                              </span>
                              {product.featured && (
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                              )}
                              {product.sku && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  #{product.sku}
                                </span>
                              )}
                            </div>
                            {product.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {product.description}
                              </p>
                            )}
                            {/* Metadata spec table with human-readable labels */}
                            {metaEntries.length > 0 && (
                              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                {metaEntries.map(([k, v]) => {
                                  // Find human-readable label from SERVICE_TEMPLATES
                                  const allFields = SERVICE_TEMPLATES.flatMap(t => t.metaFields);
                                  const fieldDef = allFields.find(f => f.key === k);
                                  const label = fieldDef?.label ?? k.replace(/([A-Z])/g, " $1").trim();
                                  return (
                                    <div key={k} className="flex items-baseline gap-1 min-w-0">
                                      <span className="text-[10px] text-muted-foreground shrink-0 font-medium">{label}:</span>
                                      <span className="text-[10px] text-foreground truncate">{v}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-semibold tabular-nums">
                              {product.currency}{" "}
                              {parseFloat(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <Switch
                              checked={product.available}
                              onCheckedChange={() =>
                                toggleMut.mutate({ id: product.id, establishmentId: estId })
                              }
                              title={product.available ? "Mark unavailable" : "Mark available"}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(product)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`Delete "${product.name}"? This cannot be undone.`)) {
                                  deleteMut.mutate({ id: product.id, establishmentId: estId });
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) setActiveTemplate(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeTemplate && <activeTemplate.icon className="w-4 h-4 text-primary" />}
              {editingId ? "Edit Product" : activeTemplate ? `New ${activeTemplate.label}` : "Add New Product"}
            </DialogTitle>
            {activeTemplate && (
              <p className="text-xs text-muted-foreground">{activeTemplate.description}</p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Image upload */}
            {estId > 0 && (
              <ProductImageUpload
                establishmentId={estId}
                imageUrl={form.imageUrl}
                onUploaded={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Product Name *</Label>
                <Input
                  placeholder="e.g. Deluxe Ocean Room, Sunrise Safari Drive"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Category *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>SKU / Code</Label>
                <Input
                  placeholder="Optional product code"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Description</Label>
                <Textarea
                  placeholder="Brief description visible to tourists..."
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.available}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, available: v }))}
                />
                <Label className="cursor-pointer">Available for purchase</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.featured}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))}
                />
                <Label className="cursor-pointer">Featured product</Label>
              </div>
            </div>

            {/* Template-specific metadata fields */}
            {activeTemplate && (
              <MetaFieldsEditor
                fields={activeTemplate.metaFields}
                meta={form.meta}
                onChange={(meta) => setForm((f) => ({ ...f, meta }))}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {editingId ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
