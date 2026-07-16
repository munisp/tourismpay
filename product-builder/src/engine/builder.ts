import { v4 as uuidv4 } from "uuid";

export interface ProductDefinition {
  id: string;
  name: string;
  type: string;
  status: "draft" | "review" | "approved" | "published" | "retired";
  version: number;
  benefits: Benefit[];
  exclusions: string[];
  premiumFormula: PremiumFormula;
  underwritingRules: UnderwritingRule[];
  claimsWorkflow: ClaimsStep[];
  waitingPeriod: number;
  maxAge: number;
  minAge: number;
  currency: string;
  regulatoryApproval: string;
  createdAt: string;
  updatedAt: string;
}

export interface Benefit {
  id: string;
  name: string;
  description: string;
  amount: number;
  type: "fixed" | "percentage" | "actual";
  limit: number;
  sublimit?: number;
  waitingPeriod: number;
}

export interface PremiumFormula {
  baseRate: number;
  factors: PremiumFactor[];
  minPremium: number;
  maxPremium: number;
  taxes: { name: string; rate: number }[];
}

export interface PremiumFactor {
  variable: string;
  type: "multiplier" | "additive" | "table_lookup";
  values: Record<string, number>;
}

export interface UnderwritingRule {
  field: string;
  operator: "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "in" | "between";
  value: unknown;
  action: "accept" | "decline" | "refer" | "load";
  loadPercentage?: number;
  message?: string;
}

export interface ClaimsStep {
  id: string;
  name: string;
  type: "auto_check" | "document_required" | "approval" | "payment";
  condition?: string;
  autoApproveThreshold?: number;
  requiredDocuments?: string[];
  approverRole?: string;
}

export class ProductBuilderEngine {
  private products: Map<string, ProductDefinition> = new Map();

  getTemplates() {
    return [
      {
        id: "tpl-motor-tp",
        name: "Motor Third Party",
        type: "motor",
        description: "Basic motor third party liability template with NMID compliance",
        benefits: [
          { name: "Third Party Bodily Injury", amount: 1000000, type: "fixed" as const },
          { name: "Third Party Property Damage", amount: 500000, type: "fixed" as const },
        ],
      },
      {
        id: "tpl-hospital-cash",
        name: "Hospital Cash Plan",
        type: "health",
        description: "Daily hospital cash benefit microinsurance template",
        benefits: [
          { name: "Daily Hospital Cash", amount: 5000, type: "fixed" as const },
          { name: "Surgical Benefit", amount: 50000, type: "fixed" as const },
        ],
      },
      {
        id: "tpl-funeral",
        name: "Funeral Cover",
        type: "funeral",
        description: "Fixed-benefit funeral cover with quick payout",
        benefits: [
          { name: "Funeral Benefit", amount: 500000, type: "fixed" as const },
          { name: "Repatriation", amount: 100000, type: "fixed" as const },
        ],
      },
      {
        id: "tpl-crop-parametric",
        name: "Crop Insurance (Parametric)",
        type: "crop",
        description: "Satellite-indexed crop insurance with automatic payout",
        benefits: [
          { name: "Drought Payout", amount: 75000, type: "fixed" as const },
          { name: "Excess Rain Payout", amount: 50000, type: "fixed" as const },
        ],
      },
      {
        id: "tpl-device",
        name: "Device Protection",
        type: "device",
        description: "Mobile phone and gadget protection embedded at point of sale",
        benefits: [
          { name: "Theft Replacement", amount: 300000, type: "actual" as const },
          { name: "Accidental Damage", amount: 200000, type: "actual" as const },
        ],
      },
    ];
  }

  createProduct(input: Partial<ProductDefinition>): ProductDefinition {
    const product: ProductDefinition = {
      id: uuidv4(),
      name: input.name || "New Product",
      type: input.type || "general",
      status: "draft",
      version: 1,
      benefits: input.benefits || [],
      exclusions: input.exclusions || [],
      premiumFormula: input.premiumFormula || { baseRate: 0, factors: [], minPremium: 0, maxPremium: 0, taxes: [] },
      underwritingRules: input.underwritingRules || [],
      claimsWorkflow: input.claimsWorkflow || [],
      waitingPeriod: input.waitingPeriod || 0,
      maxAge: input.maxAge || 65,
      minAge: input.minAge || 18,
      currency: input.currency || "NGN",
      regulatoryApproval: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.products.set(product.id, product);
    return product;
  }

  getProduct(id: string): ProductDefinition | undefined {
    return this.products.get(id);
  }

  updateProduct(id: string, updates: Partial<ProductDefinition>): ProductDefinition | undefined {
    const product = this.products.get(id);
    if (!product) return undefined;
    Object.assign(product, updates, { updatedAt: new Date().toISOString(), version: product.version + 1 });
    return product;
  }

  publishProduct(id: string) {
    const product = this.products.get(id);
    if (!product) return { error: "Product not found" };
    product.status = "published";
    product.updatedAt = new Date().toISOString();
    return { status: "published", message: `Product '${product.name}' is now live` };
  }
}
