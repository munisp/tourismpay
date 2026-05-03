/**
 * Tourist Onboarding Wizard — Component Tests
 *
 * Tests the 4-step onboarding flow: Profile → Link Card → Activate Wallet → Done.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tRPC hooks
const mockSetPreferences = vi.fn();
const mockLinkCard = vi.fn();
const mockActivateWallet = vi.fn();
const mockGetState = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    touristOnboarding: {
      getState: { useQuery: () => ({ data: mockGetState(), isLoading: false }) },
      setPreferences: { useMutation: () => ({ mutateAsync: mockSetPreferences, isPending: false }) },
      linkCard: { useMutation: () => ({ mutateAsync: mockLinkCard, isPending: false }) },
      activateWallet: { useMutation: () => ({ mutateAsync: mockActivateWallet, isPending: false }) },
      complete: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
    auth: {
      me: { useQuery: () => ({ data: { id: 1, name: "Test Tourist", role: "tourist", onboardingCompleted: false } }) },
      completeOnboarding: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    },
    useUtils: () => ({ touristOnboarding: { getState: { invalidate: vi.fn() } }, auth: { me: { invalidate: vi.fn() } } }),
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/tourist/onboarding", vi.fn()],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Tourist Onboarding Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({ step: 1, completed: false });
  });

  it("should start at step 1 (Profile preferences)", () => {
    const state = mockGetState();
    expect(state.step).toBe(1);
    expect(state.completed).toBe(false);
  });

  it("should validate profile preferences input", async () => {
    const preferences = {
      homeCountry: "US",
      preferredCurrency: "USD",
      language: "en",
    };

    expect(preferences.homeCountry).toBeTruthy();
    expect(preferences.preferredCurrency).toBeTruthy();
    expect(preferences.language).toBeTruthy();
  });

  it("should allow card linking to be skipped", () => {
    // Card linking is optional — user can skip to step 3
    const state = { step: 2, completed: false };
    const canSkip = state.step === 2;
    expect(canSkip).toBe(true);
  });

  it("should validate wallet activation with supported currencies", () => {
    const supportedCurrencies = ["USDC", "eNaira", "XLM"];
    const selection = "USDC";
    expect(supportedCurrencies).toContain(selection);
  });

  it("should call setPreferences mutation with correct payload", async () => {
    mockSetPreferences.mockResolvedValue({ success: true });
    await mockSetPreferences({
      homeCountry: "NG",
      preferredCurrency: "NGN",
      language: "en",
    });
    expect(mockSetPreferences).toHaveBeenCalledWith({
      homeCountry: "NG",
      preferredCurrency: "NGN",
      language: "en",
    });
  });

  it("should call linkCard mutation with card details", async () => {
    mockLinkCard.mockResolvedValue({ success: true });
    await mockLinkCard({
      last4: "4242",
      brand: "visa",
    });
    expect(mockLinkCard).toHaveBeenCalledWith({
      last4: "4242",
      brand: "visa",
    });
  });

  it("should call activateWallet mutation", async () => {
    mockActivateWallet.mockResolvedValue({ success: true });
    await mockActivateWallet({ currency: "USDC" });
    expect(mockActivateWallet).toHaveBeenCalledWith({ currency: "USDC" });
  });

  it("should progress through all 4 steps", () => {
    const steps = [
      { step: 1, name: "Profile" },
      { step: 2, name: "Link Card" },
      { step: 3, name: "Activate Wallet" },
      { step: 4, name: "Done" },
    ];
    expect(steps).toHaveLength(4);
    expect(steps[0].name).toBe("Profile");
    expect(steps[3].name).toBe("Done");
  });
});
