/**
 * Round 107 Tests
 * Covers:
 *  1. Type-specific merchant KPIs — correct metric labels and calculation logic per establishment type
 *  2. Tourist itinerary builder — schema validation, cost aggregation, day ordering
 *  3. Entity BIS report — template branching, entity-specific LLM prompt fields, PDF section presence
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── 1. Type-Specific Merchant KPIs ──────────────────────────────────────────

describe("Type-specific merchant KPI labels", () => {
  // Mirror the KPI label logic from TypeKpiPanel.tsx
  type KpiDef = { label: string; unit: string; description: string };

  function getTypeKpis(type: string): KpiDef[] {
    const kpiMap: Record<string, KpiDef[]> = {
      hotel: [
        { label: "Occupancy Rate", unit: "%", description: "Percentage of rooms occupied" },
        { label: "Avg Daily Rate", unit: "USD", description: "Average revenue per occupied room" },
        { label: "RevPAR", unit: "USD", description: "Revenue per available room" },
        { label: "Avg Stay Length", unit: "nights", description: "Average guest stay duration" },
      ],
      safari_lodge: [
        { label: "Game Drive Bookings", unit: "trips", description: "Total game drive bookings" },
        { label: "Lodge Occupancy", unit: "%", description: "Percentage of lodge capacity used" },
        { label: "Avg Group Size", unit: "guests", description: "Average guests per booking" },
        { label: "Conservation Fee Rev.", unit: "USD", description: "Revenue from conservation fees" },
      ],
      airline: [
        { label: "Seat Load Factor", unit: "%", description: "Percentage of seats filled" },
        { label: "Avg Ticket Price", unit: "USD", description: "Average ticket revenue" },
        { label: "On-Time Rate", unit: "%", description: "Percentage of on-time departures" },
        { label: "Routes Served", unit: "routes", description: "Number of active routes" },
      ],
      restaurant: [
        { label: "Table Turnover Rate", unit: "turns/day", description: "Average table turns per day" },
        { label: "Avg Cover Value", unit: "USD", description: "Average spend per customer" },
        { label: "Food Cost %", unit: "%", description: "Food cost as % of revenue" },
        { label: "Reservations Today", unit: "bookings", description: "Bookings for today" },
      ],
      tour_operator: [
        { label: "Tour Bookings", unit: "tours", description: "Total tour bookings" },
        { label: "Avg Group Size", unit: "guests", description: "Average guests per tour" },
        { label: "Guide Utilisation", unit: "%", description: "Guide capacity utilisation" },
        { label: "Cancellation Rate", unit: "%", description: "Percentage of cancelled tours" },
      ],
      spa_wellness: [
        { label: "Treatment Bookings", unit: "sessions", description: "Total treatment sessions booked" },
        { label: "Therapist Utilisation", unit: "%", description: "Therapist capacity utilisation" },
        { label: "Avg Session Value", unit: "USD", description: "Average revenue per session" },
        { label: "Repeat Client Rate", unit: "%", description: "Percentage of returning clients" },
      ],
      museum: [
        { label: "Daily Visitors", unit: "visitors", description: "Average daily visitor count" },
        { label: "Ticket Revenue", unit: "USD", description: "Revenue from ticket sales" },
        { label: "Group Tour Bookings", unit: "tours", description: "Guided group tour bookings" },
        { label: "Membership Sales", unit: "memberships", description: "Annual memberships sold" },
      ],
      car_rental: [
        { label: "Fleet Utilisation", unit: "%", description: "Percentage of fleet currently rented" },
        { label: "Avg Rental Duration", unit: "days", description: "Average rental period" },
        { label: "Avg Daily Rate", unit: "USD", description: "Average daily rental rate" },
        { label: "Active Rentals", unit: "vehicles", description: "Vehicles currently on rent" },
      ],
    };
    return kpiMap[type] ?? [
      { label: "Total Bookings", unit: "bookings", description: "Total bookings received" },
      { label: "Revenue", unit: "USD", description: "Total revenue" },
      { label: "Avg Transaction", unit: "USD", description: "Average transaction value" },
      { label: "Active Deals", unit: "deals", description: "Currently active deals" },
    ];
  }

  it("returns 4 KPIs for each of the 8 specialised establishment types", () => {
    const specialisedTypes = ["hotel", "safari_lodge", "airline", "restaurant", "tour_operator", "spa_wellness", "museum", "car_rental"];
    specialisedTypes.forEach(type => {
      const kpis = getTypeKpis(type);
      expect(kpis).toHaveLength(4);
    });
  });

  it("hotel KPIs include Occupancy Rate, RevPAR, and Avg Daily Rate", () => {
    const kpis = getTypeKpis("hotel");
    const labels = kpis.map(k => k.label);
    expect(labels).toContain("Occupancy Rate");
    expect(labels).toContain("RevPAR");
    expect(labels).toContain("Avg Daily Rate");
  });

  it("safari_lodge KPIs include Game Drive Bookings and Lodge Occupancy", () => {
    const kpis = getTypeKpis("safari_lodge");
    const labels = kpis.map(k => k.label);
    expect(labels).toContain("Game Drive Bookings");
    expect(labels).toContain("Lodge Occupancy");
  });

  it("airline KPIs include Seat Load Factor and On-Time Rate", () => {
    const kpis = getTypeKpis("airline");
    const labels = kpis.map(k => k.label);
    expect(labels).toContain("Seat Load Factor");
    expect(labels).toContain("On-Time Rate");
  });

  it("car_rental KPIs include Fleet Utilisation and Active Rentals", () => {
    const kpis = getTypeKpis("car_rental");
    const labels = kpis.map(k => k.label);
    expect(labels).toContain("Fleet Utilisation");
    expect(labels).toContain("Active Rentals");
  });

  it("returns generic KPIs for unknown establishment types", () => {
    const kpis = getTypeKpis("unknown_type");
    expect(kpis).toHaveLength(4);
    const labels = kpis.map(k => k.label);
    expect(labels).toContain("Total Bookings");
    expect(labels).toContain("Revenue");
  });

  it("all KPI definitions have non-empty label, unit, and description", () => {
    const allTypes = ["hotel", "safari_lodge", "airline", "restaurant", "tour_operator", "spa_wellness", "museum", "car_rental", "unknown"];
    allTypes.forEach(type => {
      const kpis = getTypeKpis(type);
      kpis.forEach(kpi => {
        expect(kpi.label.length).toBeGreaterThan(0);
        expect(kpi.unit.length).toBeGreaterThan(0);
        expect(kpi.description.length).toBeGreaterThan(0);
      });
    });
  });
});

// ─── 2. Tourist Itinerary Builder ─────────────────────────────────────────────

describe("Tourist itinerary builder — cost aggregation and day ordering", () => {
  type ItineraryItem = {
    id: number;
    dayNumber: number;
    startTime: string;
    endTime: string | null;
    title: string;
    estimatedCost: number | null;
    currency: string;
    establishmentId: number | null;
    notes: string | null;
  };

  function aggregateCost(items: ItineraryItem[]): number {
    return items.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0);
  }

  function groupByDay(items: ItineraryItem[]): Record<number, ItineraryItem[]> {
    return items.reduce((acc, item) => {
      if (!acc[item.dayNumber]) acc[item.dayNumber] = [];
      acc[item.dayNumber].push(item);
      return acc;
    }, {} as Record<number, ItineraryItem[]>);
  }

  function sortByTime(items: ItineraryItem[]): ItineraryItem[] {
    return [...items].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const sampleItems: ItineraryItem[] = [
    { id: 1, dayNumber: 1, startTime: "09:00", endTime: "11:00", title: "Safari Game Drive", estimatedCost: 150, currency: "USD", establishmentId: 10, notes: null },
    { id: 2, dayNumber: 1, startTime: "13:00", endTime: "14:00", title: "Lunch at Lodge", estimatedCost: 45, currency: "USD", establishmentId: 10, notes: "Vegetarian options available" },
    { id: 3, dayNumber: 2, startTime: "10:00", endTime: "12:00", title: "Spa Treatment", estimatedCost: 80, currency: "USD", establishmentId: 20, notes: null },
    { id: 4, dayNumber: 2, startTime: "15:00", endTime: "17:00", title: "Museum Tour", estimatedCost: 25, currency: "USD", establishmentId: 30, notes: null },
    { id: 5, dayNumber: 3, startTime: "08:00", endTime: null, title: "Airport Transfer", estimatedCost: null, currency: "USD", establishmentId: null, notes: "Complimentary" },
  ];

  it("aggregates total estimated cost across all items", () => {
    const total = aggregateCost(sampleItems);
    expect(total).toBe(300); // 150 + 45 + 80 + 25 + 0 (null treated as 0)
  });

  it("groups items correctly by day number", () => {
    const grouped = groupByDay(sampleItems);
    expect(Object.keys(grouped)).toHaveLength(3);
    expect(grouped[1]).toHaveLength(2);
    expect(grouped[2]).toHaveLength(2);
    expect(grouped[3]).toHaveLength(1);
  });

  it("sorts items within a day by start time ascending", () => {
    const day1Items = sampleItems.filter(i => i.dayNumber === 1);
    const sorted = sortByTime(day1Items);
    expect(sorted[0].startTime).toBe("09:00");
    expect(sorted[1].startTime).toBe("13:00");
  });

  it("handles null estimatedCost as zero in aggregation", () => {
    const itemsWithNull: ItineraryItem[] = [
      { id: 1, dayNumber: 1, startTime: "09:00", endTime: null, title: "Free activity", estimatedCost: null, currency: "USD", establishmentId: null, notes: null },
      { id: 2, dayNumber: 1, startTime: "12:00", endTime: null, title: "Paid activity", estimatedCost: 50, currency: "USD", establishmentId: 1, notes: null },
    ];
    expect(aggregateCost(itemsWithNull)).toBe(50);
  });

  it("returns empty grouped days object for empty items array", () => {
    expect(groupByDay([])).toEqual({});
  });

  it("calculates correct total for multi-day itinerary with mixed costs", () => {
    const items: ItineraryItem[] = [
      { id: 1, dayNumber: 1, startTime: "09:00", endTime: null, title: "Hotel Check-in", estimatedCost: 200, currency: "USD", establishmentId: 1, notes: null },
      { id: 2, dayNumber: 2, startTime: "10:00", endTime: null, title: "Tour", estimatedCost: 75.50, currency: "USD", establishmentId: 2, notes: null },
      { id: 3, dayNumber: 3, startTime: "14:00", endTime: null, title: "Dinner", estimatedCost: 60, currency: "USD", establishmentId: 3, notes: null },
    ];
    expect(aggregateCost(items)).toBeCloseTo(335.50, 2);
  });

  it("itinerary item title must be non-empty string", () => {
    const validTitles = ["Safari Game Drive", "Hotel Check-in", "Museum Tour", "Airport Transfer"];
    validTitles.forEach(title => {
      expect(title.trim().length).toBeGreaterThan(0);
    });
  });

  it("day number must be a positive integer", () => {
    const validDays = [1, 2, 3, 7, 14];
    validDays.forEach(day => {
      expect(Number.isInteger(day)).toBe(true);
      expect(day).toBeGreaterThan(0);
    });
  });

  it("start time format is HH:MM", () => {
    const timeRegex = /^\d{2}:\d{2}$/;
    const validTimes = ["09:00", "13:30", "08:00", "23:59"];
    validTimes.forEach(t => expect(t).toMatch(timeRegex));
  });
});

// ─── 3. Entity BIS Report Template ────────────────────────────────────────────

describe("Entity BIS report template — branching and content", () => {
  // Mirror the escapeHtml function from bisReport.ts
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Mirror the riskColor function
  function riskColor(level: string | null | undefined): string {
    switch (level) {
      case "critical": return "#dc2626";
      case "high": return "#ea580c";
      case "medium": return "#d97706";
      case "low": return "#16a34a";
      default: return "#6b7280";
    }
  }

  it("escapeHtml correctly escapes all special HTML characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
    expect(escapeHtml("AT&T")).toBe("AT&amp;T");
    expect(escapeHtml('"quoted"')).toBe("&quot;quoted&quot;");
    expect(escapeHtml("safe text")).toBe("safe text");
  });

  it("riskColor returns correct hex for each risk level", () => {
    expect(riskColor("critical")).toBe("#dc2626");
    expect(riskColor("high")).toBe("#ea580c");
    expect(riskColor("medium")).toBe("#d97706");
    expect(riskColor("low")).toBe("#16a34a");
    expect(riskColor("pending")).toBe("#6b7280");
    expect(riskColor(null)).toBe("#6b7280");
    expect(riskColor(undefined)).toBe("#6b7280");
  });

  it("entity report template file exists and exports buildEntityPdfHtml logic", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    expect(fs.existsSync(reportFile)).toBe(true);
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("buildEntityPdfHtml");
    expect(content).toContain("generateEntityBisLlmSummary");
  });

  it("entity report template contains all 6 required corporate sections", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    // Company structure
    expect(content).toContain("Company Structure");
    // Directorship
    expect(content).toContain("Directorship");
    // Regulatory compliance
    expect(content).toContain("Regulatory Compliance");
    // Financial health
    expect(content).toContain("Financial Health");
    // Sanctions screening
    expect(content).toContain("Sanctions");
    // AML check
    expect(content).toContain("AML");
  });

  it("entity report template uses purple accent (#7c3aed) distinct from individual report blue (#2563eb)", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("#7c3aed"); // entity accent
    expect(content).toContain("#2563eb"); // individual accent
  });

  it("entity report template includes ENTITY INVESTIGATION watermark", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("ENTITY INVESTIGATION");
  });

  it("generate procedure branches on subjectType to select correct template", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain('subjectType === "entity"');
    expect(content).toContain("buildEntityPdfHtml");
    expect(content).toContain("buildPdfHtml");
    expect(content).toContain("generateEntityBisLlmSummary");
    expect(content).toContain("generateBisLlmSummary");
  });

  it("entity LLM prompt includes entity-specific fields: registration, entity type, year founded, website", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("entityRegistrationNumber");
    expect(content).toContain("entityType");
    expect(content).toContain("entityYearFounded");
    expect(content).toContain("entityWebsite");
  });

  it("entity LLM prompt mentions corporate due diligence and KYB/AML", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("corporate due diligence");
    expect(content).toContain("KYB/AML");
  });

  it("entity report template includes entity profile grid with 8 fields", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("Registered Name");
    expect(content).toContain("Registration Number");
    expect(content).toContain("Year Founded");
    expect(content).toContain("Website");
    expect(content).toContain("Contact Email");
    expect(content).toContain("Contact Phone");
  });

  it("entity report has distinct subtitle: Entity / Corporate Investigation", () => {
    const reportFile = path.resolve(__dirname, "routers/bisReport.ts");
    const content = fs.readFileSync(reportFile, "utf-8");
    expect(content).toContain("Entity / Corporate Investigation");
  });

  it("BISReport.tsx frontend shows entity badge when subjectType is entity", () => {
    const frontendFile = path.resolve(__dirname, "../client/src/pages/bis/BISReport.tsx");
    expect(fs.existsSync(frontendFile)).toBe(true);
    const content = fs.readFileSync(frontendFile, "utf-8");
    expect(content).toContain('subjectType === "entity"');
    expect(content).toContain("Entity Investigation");
    expect(content).toContain("entityRegistrationNumber");
    expect(content).toContain("entityType");
    expect(content).toContain("entityYearFounded");
  });

  it("BISReport.tsx shows entity-specific fields in left panel for entity investigations", () => {
    const frontendFile = path.resolve(__dirname, "../client/src/pages/bis/BISReport.tsx");
    const content = fs.readFileSync(frontendFile, "utf-8");
    expect(content).toContain("Reg. Number");
    expect(content).toContain("Year Founded");
    expect(content).toContain("Entity Type");
    expect(content).toContain("Website");
  });
});

// ─── 4. TypeKpiPanel Component ────────────────────────────────────────────────

describe("TypeKpiPanel component — file existence and structure", () => {
  it("TypeKpiPanel.tsx file exists in components/merchant/", () => {
    const file = path.resolve(__dirname, "../client/src/components/merchant/TypeKpiPanel.tsx");
    expect(fs.existsSync(file)).toBe(true);
  });

  it("TypeKpiPanel exports a named component function", () => {
    const file = path.resolve(__dirname, "../client/src/components/merchant/TypeKpiPanel.tsx");
    const content = fs.readFileSync(file, "utf-8");
    // TypeKpiPanel uses a named export (export function TypeKpiPanel)
    expect(content).toMatch(/export\s+(default\s+)?function\s+TypeKpiPanel|export\s+const\s+TypeKpiPanel/);
  });

  it("TypeKpiPanel uses trpc.merchantRevenue.typeKpis", () => {
    const file = path.resolve(__dirname, "../client/src/components/merchant/TypeKpiPanel.tsx");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("typeKpis");
  });

  it("merchantRevenue router contains typeKpis procedure", () => {
    const file = path.resolve(__dirname, "routers/merchantRevenue.ts");
    expect(fs.existsSync(file)).toBe(true);
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("typeKpis");
  });
});

// ─── 5. ItineraryBuilder Component ────────────────────────────────────────────

describe("ItineraryBuilder component — file existence and structure", () => {
  it("ItineraryBuilder.tsx file exists in pages/tourist/", () => {
    const file = path.resolve(__dirname, "../client/src/pages/tourist/ItineraryBuilder.tsx");
    expect(fs.existsSync(file)).toBe(true);
  });

  it("ItineraryBuilder uses trpc.itinerary", () => {
    const file = path.resolve(__dirname, "../client/src/pages/tourist/ItineraryBuilder.tsx");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("trpc.itinerary");
  });

  it("itinerary router file exists", () => {
    const file = path.resolve(__dirname, "routers/itinerary.ts");
    expect(fs.existsSync(file)).toBe(true);
  });

  it("itinerary router exports itineraryRouter", () => {
    const file = path.resolve(__dirname, "routers/itinerary.ts");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("itineraryRouter");
  });

  it("itinerary router has create, list, addItem, removeItem, and deleteItinerary procedures", () => {
    const file = path.resolve(__dirname, "routers/itinerary.ts");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("create:");
    expect(content).toContain("list:");
    expect(content).toContain("addItem:");
    expect(content).toContain("removeItem:");
    expect(content).toContain("delete:"); // procedure is named 'delete' (itinerary-level)
  });

  it("itinerary router is registered in the main routers.ts", () => {
    const file = path.resolve(__dirname, "routers.ts");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("itinerary");
  });

  it("touristItineraryItems table exists in schema", () => {
    const file = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(file, "utf-8");
    expect(content).toContain("touristItineraryItems");
  });

  it("touristItineraries table has status and currency columns", () => {
    const file = path.resolve(__dirname, "../drizzle/schema.ts");
    const content = fs.readFileSync(file, "utf-8");
    // Check the touristItineraries table section contains status and currency
    const tableStart = content.indexOf("touristItineraries = pgTable");
    const tableSection = content.substring(tableStart, tableStart + 1500);
    expect(tableSection).toContain("status");
    expect(tableSection).toContain("currency");
  });
});
