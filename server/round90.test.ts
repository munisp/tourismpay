/**
 * Round 90 — Theme Toggle Tests
 * Verifies the ThemeContext upgrade and ThemeToggle component files
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function readClient(rel: string) {
  return readFileSync(join(ROOT, "client/src", rel), "utf-8");
}

describe("ThemeContext — 3-way dark/light/system support", () => {
  const ctx = readClient("contexts/ThemeContext.tsx");

  it("exports Theme type with system option", () => {
    expect(ctx).toContain('"system"');
    expect(ctx).toContain("export type Theme");
  });

  it("reads stored theme from localStorage key tourismPay_theme", () => {
    expect(ctx).toContain("tourismPay_theme");
  });

  it("resolves system theme via matchMedia", () => {
    expect(ctx).toContain("prefers-color-scheme: dark");
    expect(ctx).toContain("getSystemTheme");
  });

  it("applies resolved theme class to document.documentElement", () => {
    expect(ctx).toContain("root.classList.add(resolvedTheme)");
    expect(ctx).toContain("root.classList.remove");
  });

  it("exposes setTheme function in context", () => {
    expect(ctx).toContain("setTheme: (theme: Theme) => void");
  });

  it("exposes resolvedTheme in context", () => {
    expect(ctx).toContain("resolvedTheme:");
  });

  it("maintains backward-compat toggleTheme", () => {
    expect(ctx).toContain("toggleTheme");
    expect(ctx).toContain("switchable: true");
  });

  it("persists theme to localStorage on change", () => {
    expect(ctx).toContain('localStorage.setItem("tourismPay_theme"');
  });
});

describe("ThemeToggle component — PWA", () => {
  const toggle = readClient("components/ThemeToggle.tsx");

  it("imports Sun, Moon, Monitor icons", () => {
    expect(toggle).toContain("Sun");
    expect(toggle).toContain("Moon");
    expect(toggle).toContain("Monitor");
  });

  it("uses useTheme hook from ThemeContext", () => {
    expect(toggle).toContain("useTheme");
    expect(toggle).toContain("setTheme");
  });

  it("renders a DropdownMenu with three options", () => {
    expect(toggle).toContain("DropdownMenu");
    expect(toggle).toContain('"light"');
    expect(toggle).toContain('"dark"');
    expect(toggle).toContain('"system"');
  });

  it("shows active checkmark on selected theme", () => {
    expect(toggle).toContain("✓");
    expect(toggle).toContain("theme === value");
  });
});

describe("AppShell — ThemeToggle integration", () => {
  const shell = readClient("components/layout/AppShell.tsx");

  it("imports ThemeToggle component", () => {
    expect(shell).toContain('import { ThemeToggle }');
    expect(shell).toContain("ThemeToggle");
  });

  it("renders ThemeToggle in the header", () => {
    // The toggle should appear before the Live indicator
    const toggleIdx = shell.indexOf("<ThemeToggle");
    const liveIdx = shell.indexOf("LIVE");
    expect(toggleIdx).toBeGreaterThan(-1);
    expect(liveIdx).toBeGreaterThan(-1);
    expect(toggleIdx).toBeLessThan(liveIdx);
  });
});

describe("PaymentSwitch dashboard — next-themes integration", () => {
  const psRoot = join(ROOT, "../tourismpay-comprehensive-archive/04-payment-switch/admin-dashboard");

  it("has next-themes in package.json", () => {
    const pkg = JSON.parse(readFileSync(join(psRoot, "package.json"), "utf-8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["next-themes"]).toBeDefined();
  });

  it("ThemeProvider component wraps NextThemesProvider", () => {
    const provider = readFileSync(join(psRoot, "src/components/ThemeProvider.tsx"), "utf-8");
    expect(provider).toContain("next-themes");
    expect(provider).toContain("NextThemesProvider");
  });

  it("ThemeToggle component uses useTheme from next-themes", () => {
    const toggle = readFileSync(join(psRoot, "src/components/ThemeToggle.tsx"), "utf-8");
    expect(toggle).toContain("next-themes");
    expect(toggle).toContain("useTheme");
    expect(toggle).toContain('"light"');
    expect(toggle).toContain('"dark"');
    expect(toggle).toContain('"system"');
  });

  it("layout.tsx wraps app with ThemeProvider", () => {
    const layout = readFileSync(join(psRoot, "src/app/layout.tsx"), "utf-8");
    expect(layout).toContain("ThemeProvider");
    expect(layout).toContain('defaultTheme="dark"');
    expect(layout).toContain("enableSystem");
    expect(layout).toContain("suppressHydrationWarning");
  });

  it("Header.tsx renders ThemeToggle", () => {
    const header = readFileSync(join(psRoot, "src/components/layout/Header.tsx"), "utf-8");
    expect(header).toContain("ThemeToggle");
    expect(header).toContain("dark:");
  });
});
