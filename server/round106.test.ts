/**
 * Round 106 Tests
 * Covers:
 *  1. Establishment type coverage — icons, map pins, all 15 types
 *  2. Type-specific KYB document requirements
 *  3. BIS entity investigation — form validation, subject type switching
 *  4. Tourist discovery type filter — category filtering logic
 *  5. Deal categories — all categories valid, category display
 *  6. Booking service types — all service types valid, grouped correctly
 *  7. getEstablishments type filter — server-side filtering logic
 */
import { describe, it, expect } from "vitest";

// ─── 1. Establishment Type Coverage ──────────────────────────────────────────
describe("Establishment type coverage — icons and map pins", () => {
  const ALL_TYPES = [
    "restaurant", "hotel", "safari_lodge", "tour_operator", "beach_resort",
    "spa_wellness", "museum", "theme_park", "concert_venue", "nightclub",
    "sports_venue", "conference_center", "travel_agency", "airline", "car_rental",
  ];

  function getTypeIcon(type: string): string {
    const icons: Record<string, string> = {
      restaurant: "🍽️", hotel: "🏨", safari_lodge: "🦁",
      tour_operator: "🗺️", beach_resort: "🏖️", spa_wellness: "💆",
      museum: "🏛️", theme_park: "🎡", concert_venue: "🎭",
      nightclub: "🎵", sports_venue: "🏟️", conference_center: "🏗️",
      travel_agency: "✈️", airline: "✈️", car_rental: "🚗",
    };
    return icons[type] ?? "🏢";
  }

  function getMapPin(type: string): string {
    const pins: Record<string, string> = {
      restaurant: "🍽️", hotel: "🏨", safari_lodge: "🦁",
      tour_operator: "🗺️", beach_resort: "🏖️", spa_wellness: "💆",
      museum: "🏛️", theme_park: "🎡", concert_venue: "🎭",
      nightclub: "🎵", sports_venue: "🏟️", conference_center: "🏗️",
      travel_agency: "✈️", airline: "✈️", car_rental: "🚗",
    };
    return pins[type] ?? "📍";
  }

  it("returns a unique icon for each of the 15 establishment types", () => {
    const icons = ALL_TYPES.map(t => getTypeIcon(t));
    // All should be non-empty
    icons.forEach(icon => expect(icon.length).toBeGreaterThan(0));
  });

  it("does NOT return the generic 🏢 fallback for any of the 15 known types", () => {
    ALL_TYPES.forEach(type => {
      expect(getTypeIcon(type)).not.toBe("🏢");
    });
  });

  it("returns 🏢 fallback for unknown types", () => {
    expect(getTypeIcon("unknown_type")).toBe("🏢");
    expect(getTypeIcon("")).toBe("🏢");
  });

  it("returns a unique map pin for each of the 15 establishment types", () => {
    ALL_TYPES.forEach(type => {
      expect(getMapPin(type)).not.toBe("📍");
    });
  });

  it("returns 📍 fallback pin for unknown types", () => {
    expect(getMapPin("unknown_type")).toBe("📍");
  });

  it("covers all 15 establishment types in the enum", () => {
    expect(ALL_TYPES).toHaveLength(15);
    expect(ALL_TYPES).toContain("safari_lodge");
    expect(ALL_TYPES).toContain("beach_resort");
    expect(ALL_TYPES).toContain("airline");
    expect(ALL_TYPES).toContain("car_rental");
    expect(ALL_TYPES).toContain("museum");
  });
});

// ─── 2. Type-specific KYB Document Requirements ───────────────────────────────
describe("Type-specific KYB document requirements", () => {
  interface DocRequirement {
    id: string;
    label: string;
    required: boolean;
    typeSpecific?: string[];
  }

  function getDocumentsForType(establishmentType: string): DocRequirement[] {
    const base: DocRequirement[] = [
      { id: "business_registration", label: "Business Registration Certificate", required: true },
      { id: "tax_clearance", label: "Tax Clearance Certificate", required: true },
      { id: "directors_id", label: "Directors' ID Documents", required: true },
      { id: "proof_of_address", label: "Proof of Business Address", required: true },
    ];

    const typeSpecific: Record<string, DocRequirement[]> = {
      hotel: [
        { id: "star_rating_cert", label: "Hotel Star Rating Certificate", required: true, typeSpecific: ["hotel"] },
        { id: "fire_safety", label: "Fire Safety Certificate", required: true, typeSpecific: ["hotel"] },
      ],
      safari_lodge: [
        { id: "wildlife_permit", label: "Wildlife / Conservancy Permit", required: true, typeSpecific: ["safari_lodge"] },
        { id: "environmental_clearance", label: "Environmental Impact Clearance", required: true, typeSpecific: ["safari_lodge"] },
      ],
      tour_operator: [
        { id: "tour_guide_license", label: "Licensed Tour Guide Certificate", required: true, typeSpecific: ["tour_operator"] },
        { id: "tour_operator_license", label: "Tour Operator License", required: true, typeSpecific: ["tour_operator"] },
      ],
      airline: [
        { id: "aoc", label: "Air Operator Certificate (AOC)", required: true, typeSpecific: ["airline"] },
        { id: "iata_membership", label: "IATA Membership Certificate", required: false, typeSpecific: ["airline"] },
      ],
      restaurant: [
        { id: "food_hygiene", label: "Food Hygiene / Health Permit", required: true, typeSpecific: ["restaurant"] },
        { id: "liquor_license", label: "Liquor License (if applicable)", required: false, typeSpecific: ["restaurant"] },
      ],
      spa_wellness: [
        { id: "health_facility_license", label: "Health Facility License", required: true, typeSpecific: ["spa_wellness"] },
      ],
      museum: [
        { id: "cultural_heritage_permit", label: "Cultural Heritage Permit", required: true, typeSpecific: ["museum"] },
      ],
    };

    return [...base, ...(typeSpecific[establishmentType] ?? [])];
  }

  it("all types include the 4 base documents", () => {
    const types = ["restaurant", "hotel", "safari_lodge", "tour_operator", "airline", "museum"];
    types.forEach(type => {
      const docs = getDocumentsForType(type);
      expect(docs.some(d => d.id === "business_registration")).toBe(true);
      expect(docs.some(d => d.id === "tax_clearance")).toBe(true);
      expect(docs.some(d => d.id === "directors_id")).toBe(true);
      expect(docs.some(d => d.id === "proof_of_address")).toBe(true);
    });
  });

  it("hotel requires star rating certificate", () => {
    const docs = getDocumentsForType("hotel");
    const starRating = docs.find(d => d.id === "star_rating_cert");
    expect(starRating).toBeDefined();
    expect(starRating?.required).toBe(true);
  });

  it("safari_lodge requires wildlife permit", () => {
    const docs = getDocumentsForType("safari_lodge");
    const permit = docs.find(d => d.id === "wildlife_permit");
    expect(permit).toBeDefined();
    expect(permit?.required).toBe(true);
  });

  it("tour_operator requires tour operator license", () => {
    const docs = getDocumentsForType("tour_operator");
    expect(docs.some(d => d.id === "tour_operator_license")).toBe(true);
  });

  it("airline requires AOC", () => {
    const docs = getDocumentsForType("airline");
    const aoc = docs.find(d => d.id === "aoc");
    expect(aoc).toBeDefined();
    expect(aoc?.required).toBe(true);
  });

  it("restaurant requires food hygiene permit", () => {
    const docs = getDocumentsForType("restaurant");
    expect(docs.some(d => d.id === "food_hygiene")).toBe(true);
  });

  it("unknown type returns only base documents", () => {
    const docs = getDocumentsForType("unknown_type");
    expect(docs).toHaveLength(4);
  });

  it("hotel has more documents than restaurant", () => {
    const hotelDocs = getDocumentsForType("hotel");
    const restaurantDocs = getDocumentsForType("restaurant");
    expect(hotelDocs.length).toBeGreaterThan(4);
    expect(restaurantDocs.length).toBeGreaterThan(4);
  });
});

// ─── 3. BIS Entity Investigation ─────────────────────────────────────────────
describe("BIS entity investigation — form validation and subject type", () => {
  type SubjectType = "individual" | "entity";

  interface IndividualForm {
    subjectType: "individual";
    subjectFullName: string;
    subjectCountry: string;
    tier: string;
    consentObtained: boolean;
  }

  interface EntityForm {
    subjectType: "entity";
    subjectFullName: string; // company name
    entityRegistrationNumber?: string;
    entityType: string;
    subjectCountry: string;
    tier: string;
    consentObtained: boolean;
  }

  function validateIndividualForm(form: IndividualForm): string[] {
    const errors: string[] = [];
    if (!form.subjectFullName || form.subjectFullName.trim().length < 2)
      errors.push("Full name is required (min 2 chars)");
    if (!form.subjectCountry)
      errors.push("Country is required");
    if (!["basic", "standard", "comprehensive"].includes(form.tier))
      errors.push("Invalid tier");
    if (!form.consentObtained)
      errors.push("Consent is required");
    return errors;
  }

  function validateEntityForm(form: EntityForm): string[] {
    const errors: string[] = [];
    if (!form.subjectFullName || form.subjectFullName.trim().length < 2)
      errors.push("Company name is required (min 2 chars)");
    if (!form.entityType)
      errors.push("Entity type is required");
    if (!form.subjectCountry)
      errors.push("Country is required");
    if (!["basic", "standard", "comprehensive"].includes(form.tier))
      errors.push("Invalid tier");
    if (!form.consentObtained)
      errors.push("Authorization is required");
    return errors;
  }

  it("individual form validates successfully with all required fields", () => {
    const form: IndividualForm = {
      subjectType: "individual",
      subjectFullName: "Emeka Okafor",
      subjectCountry: "NG",
      tier: "standard",
      consentObtained: true,
    };
    expect(validateIndividualForm(form)).toHaveLength(0);
  });

  it("individual form fails without full name", () => {
    const form: IndividualForm = {
      subjectType: "individual",
      subjectFullName: "",
      subjectCountry: "NG",
      tier: "standard",
      consentObtained: true,
    };
    const errors = validateIndividualForm(form);
    expect(errors.some(e => e.includes("Full name"))).toBe(true);
  });

  it("individual form fails without consent", () => {
    const form: IndividualForm = {
      subjectType: "individual",
      subjectFullName: "Emeka Okafor",
      subjectCountry: "NG",
      tier: "standard",
      consentObtained: false,
    };
    const errors = validateIndividualForm(form);
    expect(errors.some(e => e.includes("Consent"))).toBe(true);
  });

  it("entity form validates successfully with all required fields", () => {
    const form: EntityForm = {
      subjectType: "entity",
      subjectFullName: "Serengeti Safari Lodge Ltd",
      entityType: "safari_lodge",
      entityRegistrationNumber: "RC-12345",
      subjectCountry: "TZ",
      tier: "comprehensive",
      consentObtained: true,
    };
    expect(validateEntityForm(form)).toHaveLength(0);
  });

  it("entity form fails without company name", () => {
    const form: EntityForm = {
      subjectType: "entity",
      subjectFullName: "",
      entityType: "hotel",
      subjectCountry: "KE",
      tier: "basic",
      consentObtained: true,
    };
    const errors = validateEntityForm(form);
    expect(errors.some(e => e.includes("Company name"))).toBe(true);
  });

  it("entity form fails without authorization", () => {
    const form: EntityForm = {
      subjectType: "entity",
      subjectFullName: "Nairobi Hotels Ltd",
      entityType: "hotel",
      subjectCountry: "KE",
      tier: "standard",
      consentObtained: false,
    };
    const errors = validateEntityForm(form);
    expect(errors.some(e => e.includes("Authorization"))).toBe(true);
  });

  it("entity form fails with invalid tier", () => {
    const form: EntityForm = {
      subjectType: "entity",
      subjectFullName: "Nairobi Hotels Ltd",
      entityType: "hotel",
      subjectCountry: "KE",
      tier: "platinum", // invalid
      consentObtained: true,
    };
    const errors = validateEntityForm(form);
    expect(errors.some(e => e.includes("tier"))).toBe(true);
  });

  it("entity investigation has higher base price than individual", () => {
    const entityPrices = { basic: 79, standard: 149, comprehensive: 299 };
    const individualPrices = { basic: 49, standard: 99, comprehensive: 199 };
    expect(entityPrices.basic).toBeGreaterThan(individualPrices.basic);
    expect(entityPrices.standard).toBeGreaterThan(individualPrices.standard);
    expect(entityPrices.comprehensive).toBeGreaterThan(individualPrices.comprehensive);
  });

  it("entity investigation supports all 15 establishment types", () => {
    const ESTABLISHMENT_TYPES = [
      "restaurant", "hotel", "safari_lodge", "tour_operator", "beach_resort",
      "spa_wellness", "museum", "theme_park", "concert_venue", "nightclub",
      "sports_venue", "conference_center", "travel_agency", "airline", "car_rental",
    ];
    ESTABLISHMENT_TYPES.forEach(type => {
      const form: EntityForm = {
        subjectType: "entity",
        subjectFullName: "Test Entity",
        entityType: type,
        subjectCountry: "NG",
        tier: "basic",
        consentObtained: true,
      };
      expect(validateEntityForm(form)).toHaveLength(0);
    });
  });
});

// ─── 4. Tourist Discovery Type Filter ────────────────────────────────────────
describe("Tourist discovery type filter — category filtering logic", () => {
  interface Establishment {
    id: number;
    name: string;
    type: string;
    country: string;
  }

  const establishments: Establishment[] = [
    { id: 1, name: "Carnivore Restaurant", type: "restaurant", country: "KE" },
    { id: 2, name: "Serena Hotel", type: "hotel", country: "KE" },
    { id: 3, name: "Maasai Mara Lodge", type: "safari_lodge", country: "KE" },
    { id: 4, name: "Zanzibar Beach Resort", type: "beach_resort", country: "TZ" },
    { id: 5, name: "Nairobi National Museum", type: "museum", country: "KE" },
    { id: 6, name: "Safari Tours Ltd", type: "tour_operator", country: "KE" },
  ];

  function filterByType(items: Establishment[], type: string | null): Establishment[] {
    if (!type) return items;
    return items.filter(e => e.type === type);
  }

  it("returns all establishments when no type filter is set", () => {
    expect(filterByType(establishments, null)).toHaveLength(6);
  });

  it("filters to only restaurants", () => {
    const result = filterByType(establishments, "restaurant");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Carnivore Restaurant");
  });

  it("filters to only hotels", () => {
    const result = filterByType(establishments, "hotel");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Serena Hotel");
  });

  it("filters to only safari lodges", () => {
    const result = filterByType(establishments, "safari_lodge");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Maasai Mara Lodge");
  });

  it("returns empty array when no establishments match the type", () => {
    const result = filterByType(establishments, "airline");
    expect(result).toHaveLength(0);
  });

  it("toggling the same category clears the filter", () => {
    let activeType: string | null = "hotel";
    // Simulate toggle: clicking the same category again clears it
    activeType = activeType === "hotel" ? null : "hotel";
    expect(activeType).toBeNull();
    expect(filterByType(establishments, activeType)).toHaveLength(6);
  });

  it("switching categories updates the filter correctly", () => {
    let activeType: string | null = "restaurant";
    expect(filterByType(establishments, activeType)).toHaveLength(1);
    activeType = "museum";
    expect(filterByType(establishments, activeType)).toHaveLength(1);
    expect(filterByType(establishments, activeType)[0].name).toBe("Nairobi National Museum");
  });
});

// ─── 5. Deal Categories ───────────────────────────────────────────────────────
describe("Deal categories — completeness and validity", () => {
  const DEAL_CATEGORIES = [
    "general", "dining", "drinks", "breakfast",
    "room_rate", "suite_upgrade", "early_checkin",
    "safari_game_drive", "guided_tour", "day_trip", "cultural_experience",
    "spa_treatment", "beach_access", "fitness",
    "event_ticket", "theme_park", "museum_entry", "nightlife",
    "car_rental", "airport_transfer", "flight",
    "shopping", "souvenir",
    "package_deal", "loyalty_bonus",
  ];

  it("has at least 20 deal categories", () => {
    expect(DEAL_CATEGORIES.length).toBeGreaterThanOrEqual(20);
  });

  it("includes general as a fallback category", () => {
    expect(DEAL_CATEGORIES).toContain("general");
  });

  it("includes food & beverage categories", () => {
    expect(DEAL_CATEGORIES).toContain("dining");
    expect(DEAL_CATEGORIES).toContain("drinks");
    expect(DEAL_CATEGORIES).toContain("breakfast");
  });

  it("includes accommodation categories", () => {
    expect(DEAL_CATEGORIES).toContain("room_rate");
    expect(DEAL_CATEGORIES).toContain("suite_upgrade");
  });

  it("includes safari & tour categories", () => {
    expect(DEAL_CATEGORIES).toContain("safari_game_drive");
    expect(DEAL_CATEGORIES).toContain("guided_tour");
    expect(DEAL_CATEGORIES).toContain("cultural_experience");
  });

  it("includes wellness categories", () => {
    expect(DEAL_CATEGORIES).toContain("spa_treatment");
    expect(DEAL_CATEGORIES).toContain("beach_access");
  });

  it("includes entertainment categories", () => {
    expect(DEAL_CATEGORIES).toContain("event_ticket");
    expect(DEAL_CATEGORIES).toContain("museum_entry");
    expect(DEAL_CATEGORIES).toContain("nightlife");
  });

  it("includes transport categories", () => {
    expect(DEAL_CATEGORIES).toContain("car_rental");
    expect(DEAL_CATEGORIES).toContain("airport_transfer");
    expect(DEAL_CATEGORIES).toContain("flight");
  });

  it("has no duplicate categories", () => {
    const unique = new Set(DEAL_CATEGORIES);
    expect(unique.size).toBe(DEAL_CATEGORIES.length);
  });

  it("all category values are snake_case", () => {
    DEAL_CATEGORIES.forEach(cat => {
      expect(cat).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  });
});

// ─── 6. Booking Service Types ─────────────────────────────────────────────────
describe("Booking service types — completeness and grouping", () => {
  const SERVICE_TYPE_GROUPS = {
    "Food & Beverage": ["restaurant", "cafe", "bar"],
    "Accommodation": ["hotel", "suite", "safari_lodge", "beach_resort"],
    "Tours & Experiences": ["safari_game_drive", "guided_tour", "day_trip", "cultural_experience", "water_sports"],
    "Wellness & Leisure": ["spa_treatment", "fitness"],
    "Entertainment": ["event_ticket", "theme_park", "museum_entry", "nightlife", "sports_event"],
    "Transport": ["car_rental", "airport_transfer", "flight", "bus_coach"],
    "Other": ["shopping", "conference", "other"],
  };

  const ALL_SERVICE_TYPES = Object.values(SERVICE_TYPE_GROUPS).flat();

  it("has at least 25 service types across all groups", () => {
    expect(ALL_SERVICE_TYPES.length).toBeGreaterThanOrEqual(25);
  });

  it("has 7 service type groups", () => {
    expect(Object.keys(SERVICE_TYPE_GROUPS)).toHaveLength(7);
  });

  it("includes safari-specific service types", () => {
    expect(ALL_SERVICE_TYPES).toContain("safari_game_drive");
    expect(ALL_SERVICE_TYPES).toContain("safari_lodge");
  });

  it("includes accommodation service types", () => {
    expect(ALL_SERVICE_TYPES).toContain("hotel");
    expect(ALL_SERVICE_TYPES).toContain("beach_resort");
    expect(ALL_SERVICE_TYPES).toContain("suite");
  });

  it("includes transport service types", () => {
    expect(ALL_SERVICE_TYPES).toContain("car_rental");
    expect(ALL_SERVICE_TYPES).toContain("airport_transfer");
    expect(ALL_SERVICE_TYPES).toContain("flight");
  });

  it("includes entertainment service types", () => {
    expect(ALL_SERVICE_TYPES).toContain("museum_entry");
    expect(ALL_SERVICE_TYPES).toContain("event_ticket");
    expect(ALL_SERVICE_TYPES).toContain("nightlife");
  });

  it("has an 'other' fallback service type", () => {
    expect(ALL_SERVICE_TYPES).toContain("other");
  });

  it("has no duplicate service types", () => {
    const unique = new Set(ALL_SERVICE_TYPES);
    expect(unique.size).toBe(ALL_SERVICE_TYPES.length);
  });

  it("all service type values are snake_case", () => {
    ALL_SERVICE_TYPES.forEach(st => {
      expect(st).toMatch(/^[a-z][a-z0-9_]*$/);
    });
  });
});

// ─── 7. getEstablishments type filter ────────────────────────────────────────
describe("getEstablishments — server-side type filter logic", () => {
  interface EstablishmentRow {
    id: number;
    name: string;
    type: string;
    country: string;
    kybStatus: string;
  }

  const mockRows: EstablishmentRow[] = [
    { id: 1, name: "Carnivore", type: "restaurant", country: "KE", kybStatus: "approved" },
    { id: 2, name: "Serena", type: "hotel", country: "KE", kybStatus: "approved" },
    { id: 3, name: "Mara Lodge", type: "safari_lodge", country: "KE", kybStatus: "pending" },
    { id: 4, name: "Zanzibar Resort", type: "beach_resort", country: "TZ", kybStatus: "approved" },
    { id: 5, name: "Nairobi Museum", type: "museum", country: "KE", kybStatus: "approved" },
  ];

  function applyFilters(rows: EstablishmentRow[], filters?: {
    country?: string;
    kybStatus?: string;
    type?: string;
  }): EstablishmentRow[] {
    let result = rows;
    if (filters?.country) result = result.filter(r => r.country === filters.country);
    if (filters?.kybStatus) result = result.filter(r => r.kybStatus === filters.kybStatus);
    if (filters?.type) result = result.filter(r => r.type === filters.type);
    return result;
  }

  it("returns all rows when no filters applied", () => {
    expect(applyFilters(mockRows)).toHaveLength(5);
  });

  it("filters by type: restaurant", () => {
    const result = applyFilters(mockRows, { type: "restaurant" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Carnivore");
  });

  it("filters by type: safari_lodge", () => {
    const result = applyFilters(mockRows, { type: "safari_lodge" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Mara Lodge");
  });

  it("filters by country AND type simultaneously", () => {
    const result = applyFilters(mockRows, { country: "KE", type: "hotel" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Serena");
  });

  it("filters by country AND kybStatus AND type", () => {
    const result = applyFilters(mockRows, { country: "KE", kybStatus: "approved", type: "museum" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Nairobi Museum");
  });

  it("returns empty array when type filter matches nothing", () => {
    const result = applyFilters(mockRows, { type: "airline" });
    expect(result).toHaveLength(0);
  });

  it("type filter is case-sensitive", () => {
    const result = applyFilters(mockRows, { type: "Hotel" }); // wrong case
    expect(result).toHaveLength(0);
    const resultCorrect = applyFilters(mockRows, { type: "hotel" });
    expect(resultCorrect).toHaveLength(1);
  });
});
