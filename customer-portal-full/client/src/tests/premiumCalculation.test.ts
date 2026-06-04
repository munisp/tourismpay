import { describe, it, expect } from "vitest";

interface PremiumFactors {
  baseRate: number;
  age: number;
  coverageAmount: number;
  riskMultiplier: number;
  discounts: number[];
}

interface ClaimValidation {
  policyId: string;
  claimAmount: number;
  coverageLimit: number;
  deductible: number;
  policyStatus: "active" | "expired" | "suspended";
}

interface KYCValidation {
  nin: string;
  bvn: string;
  phone: string;
  email: string;
  dateOfBirth: string;
}

function calculatePremium(factors: PremiumFactors): number {
  const { baseRate, age, coverageAmount, riskMultiplier, discounts } = factors;
  
  let ageFactor = 1;
  if (age < 25) ageFactor = 1.5;
  else if (age < 35) ageFactor = 1.0;
  else if (age < 45) ageFactor = 1.1;
  else if (age < 55) ageFactor = 1.3;
  else if (age < 65) ageFactor = 1.6;
  else ageFactor = 2.0;

  let premium = baseRate * (coverageAmount / 100000) * ageFactor * riskMultiplier;

  const totalDiscount = discounts.reduce((sum, d) => sum + d, 0);
  const cappedDiscount = Math.min(totalDiscount, 0.3);
  premium = premium * (1 - cappedDiscount);

  return Math.round(premium * 100) / 100;
}

function validateClaim(claim: ClaimValidation): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (claim.policyStatus !== "active") {
    errors.push(`Policy is ${claim.policyStatus}. Claims can only be filed on active policies.`);
  }

  if (claim.claimAmount <= 0) {
    errors.push("Claim amount must be greater than zero.");
  }

  if (claim.claimAmount > claim.coverageLimit) {
    errors.push(`Claim amount (${claim.claimAmount}) exceeds coverage limit (${claim.coverageLimit}).`);
  }

  if (claim.claimAmount <= claim.deductible) {
    errors.push(`Claim amount (${claim.claimAmount}) is less than or equal to deductible (${claim.deductible}).`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateKYC(data: KYCValidation): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!/^\d{11}$/.test(data.nin)) {
    errors.nin = "NIN must be exactly 11 digits";
  }

  if (!/^\d{11}$/.test(data.bvn)) {
    errors.bvn = "BVN must be exactly 11 digits";
  }

  if (!/^(\+234|0)[789][01]\d{8}$/.test(data.phone.replace(/\s/g, ""))) {
    errors.phone = "Invalid Nigerian phone number format";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Invalid email format";
  }

  const dob = new Date(data.dateOfBirth);
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  if (age < 18) {
    errors.dateOfBirth = "Must be at least 18 years old";
  }
  if (age > 100) {
    errors.dateOfBirth = "Invalid date of birth";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

function calculateRiskScore(factors: {
  age: number;
  occupation: string;
  healthConditions: string[];
  smokingStatus: boolean;
  location: string;
  claimsHistory: number;
}): number {
  let score = 50;

  if (factors.age < 30) score += 10;
  else if (factors.age < 40) score += 5;
  else if (factors.age < 50) score -= 5;
  else if (factors.age < 60) score -= 10;
  else score -= 20;

  const highRiskOccupations = ["mining", "construction", "security", "transportation"];
  if (highRiskOccupations.includes(factors.occupation.toLowerCase())) {
    score -= 15;
  }

  score -= factors.healthConditions.length * 5;

  if (factors.smokingStatus) {
    score -= 10;
  }

  const highRiskLocations = ["lagos-island", "port-harcourt", "kano"];
  if (highRiskLocations.includes(factors.location.toLowerCase())) {
    score -= 5;
  }

  score -= factors.claimsHistory * 3;

  return Math.max(0, Math.min(100, score));
}

describe("Premium Calculation", () => {
  it("calculates base premium correctly", () => {
    const premium = calculatePremium({
      baseRate: 5000,
      age: 30,
      coverageAmount: 1000000,
      riskMultiplier: 1.0,
      discounts: [],
    });
    expect(premium).toBe(50000);
  });

  it("applies age factor for young drivers", () => {
    const premium = calculatePremium({
      baseRate: 5000,
      age: 22,
      coverageAmount: 1000000,
      riskMultiplier: 1.0,
      discounts: [],
    });
    expect(premium).toBe(75000);
  });

  it("applies age factor for seniors", () => {
    const premium = calculatePremium({
      baseRate: 5000,
      age: 70,
      coverageAmount: 1000000,
      riskMultiplier: 1.0,
      discounts: [],
    });
    expect(premium).toBe(100000);
  });

  it("applies risk multiplier correctly", () => {
    const premium = calculatePremium({
      baseRate: 5000,
      age: 30,
      coverageAmount: 1000000,
      riskMultiplier: 1.5,
      discounts: [],
    });
    expect(premium).toBe(75000);
  });

  it("applies discounts correctly", () => {
    const premium = calculatePremium({
      baseRate: 5000,
      age: 30,
      coverageAmount: 1000000,
      riskMultiplier: 1.0,
      discounts: [0.1, 0.05],
    });
    expect(premium).toBe(42500);
  });

  it("caps total discount at 30%", () => {
    const premium = calculatePremium({
      baseRate: 5000,
      age: 30,
      coverageAmount: 1000000,
      riskMultiplier: 1.0,
      discounts: [0.2, 0.2, 0.1],
    });
    expect(premium).toBe(35000);
  });
});

describe("Claim Validation", () => {
  it("validates a valid claim", () => {
    const result = validateClaim({
      policyId: "POL-001",
      claimAmount: 50000,
      coverageLimit: 1000000,
      deductible: 10000,
      policyStatus: "active",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects claim on expired policy", () => {
    const result = validateClaim({
      policyId: "POL-001",
      claimAmount: 50000,
      coverageLimit: 1000000,
      deductible: 10000,
      policyStatus: "expired",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Policy is expired. Claims can only be filed on active policies.");
  });

  it("rejects claim exceeding coverage limit", () => {
    const result = validateClaim({
      policyId: "POL-001",
      claimAmount: 1500000,
      coverageLimit: 1000000,
      deductible: 10000,
      policyStatus: "active",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("exceeds coverage limit"))).toBe(true);
  });

  it("rejects claim below deductible", () => {
    const result = validateClaim({
      policyId: "POL-001",
      claimAmount: 5000,
      coverageLimit: 1000000,
      deductible: 10000,
      policyStatus: "active",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("deductible"))).toBe(true);
  });

  it("rejects zero claim amount", () => {
    const result = validateClaim({
      policyId: "POL-001",
      claimAmount: 0,
      coverageLimit: 1000000,
      deductible: 10000,
      policyStatus: "active",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Claim amount must be greater than zero.");
  });
});

describe("KYC Validation", () => {
  it("validates correct KYC data", () => {
    const result = validateKYC({
      nin: "12345678901",
      bvn: "12345678901",
      phone: "08012345678",
      email: "test@example.com",
      dateOfBirth: "1990-01-01",
    });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it("rejects invalid NIN", () => {
    const result = validateKYC({
      nin: "1234567890",
      bvn: "12345678901",
      phone: "08012345678",
      email: "test@example.com",
      dateOfBirth: "1990-01-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.nin).toBe("NIN must be exactly 11 digits");
  });

  it("rejects invalid BVN", () => {
    const result = validateKYC({
      nin: "12345678901",
      bvn: "123456789",
      phone: "08012345678",
      email: "test@example.com",
      dateOfBirth: "1990-01-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.bvn).toBe("BVN must be exactly 11 digits");
  });

  it("rejects invalid phone number", () => {
    const result = validateKYC({
      nin: "12345678901",
      bvn: "12345678901",
      phone: "12345678901",
      email: "test@example.com",
      dateOfBirth: "1990-01-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.phone).toBe("Invalid Nigerian phone number format");
  });

  it("accepts phone with +234 prefix", () => {
    const result = validateKYC({
      nin: "12345678901",
      bvn: "12345678901",
      phone: "+2348012345678",
      email: "test@example.com",
      dateOfBirth: "1990-01-01",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = validateKYC({
      nin: "12345678901",
      bvn: "12345678901",
      phone: "08012345678",
      email: "invalid-email",
      dateOfBirth: "1990-01-01",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe("Invalid email format");
  });

  it("rejects underage applicant", () => {
    const today = new Date();
    const underageDate = new Date(today.getFullYear() - 17, today.getMonth(), today.getDate());
    const result = validateKYC({
      nin: "12345678901",
      bvn: "12345678901",
      phone: "08012345678",
      email: "test@example.com",
      dateOfBirth: underageDate.toISOString().split("T")[0],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.dateOfBirth).toBe("Must be at least 18 years old");
  });
});

describe("Risk Score Calculation", () => {
  it("calculates base risk score for low-risk profile", () => {
    const score = calculateRiskScore({
      age: 28,
      occupation: "software engineer",
      healthConditions: [],
      smokingStatus: false,
      location: "abuja",
      claimsHistory: 0,
    });
    expect(score).toBe(60);
  });

  it("reduces score for high-risk occupation", () => {
    const score = calculateRiskScore({
      age: 28,
      occupation: "construction",
      healthConditions: [],
      smokingStatus: false,
      location: "abuja",
      claimsHistory: 0,
    });
    expect(score).toBe(45);
  });

  it("reduces score for health conditions", () => {
    const score = calculateRiskScore({
      age: 28,
      occupation: "software engineer",
      healthConditions: ["diabetes", "hypertension"],
      smokingStatus: false,
      location: "abuja",
      claimsHistory: 0,
    });
    expect(score).toBe(50);
  });

  it("reduces score for smokers", () => {
    const score = calculateRiskScore({
      age: 28,
      occupation: "software engineer",
      healthConditions: [],
      smokingStatus: true,
      location: "abuja",
      claimsHistory: 0,
    });
    expect(score).toBe(50);
  });

  it("reduces score for high-risk locations", () => {
    const score = calculateRiskScore({
      age: 28,
      occupation: "software engineer",
      healthConditions: [],
      smokingStatus: false,
      location: "lagos-island",
      claimsHistory: 0,
    });
    expect(score).toBe(55);
  });

  it("reduces score for claims history", () => {
    const score = calculateRiskScore({
      age: 28,
      occupation: "software engineer",
      healthConditions: [],
      smokingStatus: false,
      location: "abuja",
      claimsHistory: 3,
    });
    expect(score).toBe(51);
  });

  it("caps score at 0 minimum", () => {
    const score = calculateRiskScore({
      age: 75,
      occupation: "mining",
      healthConditions: ["diabetes", "hypertension", "heart disease", "cancer"],
      smokingStatus: true,
      location: "lagos-island",
      claimsHistory: 10,
    });
    expect(score).toBe(0);
  });

  it("caps score at 100 maximum", () => {
    const score = calculateRiskScore({
      age: 25,
      occupation: "teacher",
      healthConditions: [],
      smokingStatus: false,
      location: "jos",
      claimsHistory: 0,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});
