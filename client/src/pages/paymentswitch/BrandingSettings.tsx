// @ts-nocheck
import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { HexColorPicker } from "react-colorful";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Upload, Share2, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Ubuntu",
  "Nunito",
  "Playfair Display",
];

const BRANDING_PRESETS = {
  default: {
    name: "Default Blue",
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    fontFamily: "Inter",
    borderRadius: "8px",
  },
  dark: {
    name: "Dark Mode",
    primaryColor: "#6366f1",
    secondaryColor: "#4f46e5",
    backgroundColor: "#1f2937",
    textColor: "#f9fafb",
    fontFamily: "Inter",
    borderRadius: "8px",
  },
  colorful: {
    name: "Colorful",
    primaryColor: "#ec4899",
    secondaryColor: "#db2777",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    fontFamily: "Poppins",
    borderRadius: "12px",
  },
  minimal: {
    name: "Minimal",
    primaryColor: "#000000",
    secondaryColor: "#374151",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    fontFamily: "Helvetica",
    borderRadius: "4px",
  },
};

export default function BrandingSettings() {
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState<number | null>(null);
  const [branding, setBranding] = useState({
    logo: "",
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    backgroundColor: "#ffffff",
    textColor: "#1f2937",
    fontFamily: "Inter",
    borderRadius: "8px",
  });

  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);
  const [showSecondaryPicker, setShowSecondaryPicker] = useState(false);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [showTextPicker, setShowTextPicker] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExpiry, setPreviewExpiry] = useState<Date | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const generatePreviewMutation = trpc.merchant.generatePreviewSession.useMutation();

  const { data: merchants } = trpc.merchant.list.useQuery();
  const { data: brandingData, isLoading } = trpc.merchant.getBranding.useQuery(
    { id: merchantId! },
    { enabled: !!merchantId }
  );
  const updateBrandingMutation = trpc.merchant.updateBranding.useMutation();

  useEffect(() => {
    if (merchants && merchants.length > 0) {
      setMerchantId(merchants[0].id);
    }
  }, [merchants]);

  useEffect(() => {
    if (brandingData) {
      setBranding({
        logo: brandingData.logo || "",
        primaryColor: brandingData.primaryColor || "#2563eb",
        secondaryColor: brandingData.secondaryColor || "#1e40af",
        backgroundColor: brandingData.backgroundColor || "#ffffff",
        textColor: brandingData.textColor || "#1f2937",
        fontFamily: brandingData.fontFamily || "Inter",
        borderRadius: brandingData.borderRadius || "8px",
      });
    }
  }, [brandingData]);

  const handleSave = async () => {
    if (!merchantId) return;

    try {
      await updateBrandingMutation.mutateAsync({
        id: merchantId,
        logo: branding.logo || undefined,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        backgroundColor: branding.backgroundColor,
        textColor: branding.textColor,
        fontFamily: branding.fontFamily,
        borderRadius: branding.borderRadius,
      });
      toast.success("Branding settings saved successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to save branding settings");
    }
  };

  const handleGeneratePreview = async () => {
    if (!merchantId) return;

    try {
      const result = await generatePreviewMutation.mutateAsync({ id: merchantId });
      const fullUrl = `${window.location.origin}${result.previewUrl}`;
      setPreviewUrl(fullUrl);
      setPreviewExpiry(result.expiresAt);
      toast.success("Preview link generated!");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate preview link");
    }
  };

  const copyPreviewLink = () => {
    if (previewUrl) {
      navigator.clipboard.writeText(previewUrl);
      setLinkCopied(true);
      toast.success("Preview link copied to clipboard");
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const applyPreset = (preset: keyof typeof BRANDING_PRESETS) => {
    const presetData = BRANDING_PRESETS[preset];
    setBranding({
      ...branding,
      primaryColor: presetData.primaryColor,
      secondaryColor: presetData.secondaryColor,
      backgroundColor: presetData.backgroundColor,
      textColor: presetData.textColor,
      fontFamily: presetData.fontFamily,
      borderRadius: presetData.borderRadius,
    });
    toast.success(`Applied ${presetData.name} preset`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Branding Settings</h1>
        <p className="text-muted-foreground mt-2">
          Customize the appearance of your checkout page to match your brand
        </p>
      </div>

      <div className="grid gap-6">
        {/* Presets */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Presets</CardTitle>
            <CardDescription>Apply a pre-configured branding theme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(BRANDING_PRESETS).map(([key, preset]) => (
                <Button
                  key={key}
                  variant="outline"
                  onClick={() => applyPreset(key as keyof typeof BRANDING_PRESETS)}
                  className="h-auto flex-col p-4"
                >
                  <div className="flex gap-2 mb-2">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: preset.primaryColor }}
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: preset.secondaryColor }}
                    />
                  </div>
                  <span className="text-sm">{preset.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Logo */}
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>Upload your company logo (recommended size: 200x40px)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="logo">Logo URL</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="logo"
                  value={branding.logo}
                  onChange={(e) => setBranding({ ...branding, logo: e.target.value })}
                  placeholder="https://example.com/logo.png"
                />
                <Button variant="outline" size="icon">
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {branding.logo && (
              <div className="border rounded-lg p-4 bg-muted/50">
                <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                <img
                  src={branding.logo}
                  alt="Logo preview"
                  className="max-h-10 max-w-[200px] object-contain"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader>
            <CardTitle>Colors</CardTitle>
            <CardDescription>Customize your brand colors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Primary Color */}
              <div>
                <Label>Primary Color</Label>
                <Popover open={showPrimaryPicker} onOpenChange={setShowPrimaryPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start mt-2"
                    >
                      <div
                        className="w-6 h-6 rounded mr-2"
                        style={{ backgroundColor: branding.primaryColor }}
                      />
                      {branding.primaryColor}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3">
                    <HexColorPicker
                      color={branding.primaryColor}
                      onChange={(color) => setBranding({ ...branding, primaryColor: color })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Secondary Color */}
              <div>
                <Label>Secondary Color</Label>
                <Popover open={showSecondaryPicker} onOpenChange={setShowSecondaryPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start mt-2"
                    >
                      <div
                        className="w-6 h-6 rounded mr-2"
                        style={{ backgroundColor: branding.secondaryColor }}
                      />
                      {branding.secondaryColor}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3">
                    <HexColorPicker
                      color={branding.secondaryColor}
                      onChange={(color) => setBranding({ ...branding, secondaryColor: color })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Background Color */}
              <div>
                <Label>Background Color</Label>
                <Popover open={showBackgroundPicker} onOpenChange={setShowBackgroundPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start mt-2"
                    >
                      <div
                        className="w-6 h-6 rounded mr-2 border"
                        style={{ backgroundColor: branding.backgroundColor }}
                      />
                      {branding.backgroundColor}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3">
                    <HexColorPicker
                      color={branding.backgroundColor}
                      onChange={(color) => setBranding({ ...branding, backgroundColor: color })}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Text Color */}
              <div>
                <Label>Text Color</Label>
                <Popover open={showTextPicker} onOpenChange={setShowTextPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start mt-2"
                    >
                      <div
                        className="w-6 h-6 rounded mr-2"
                        style={{ backgroundColor: branding.textColor }}
                      />
                      {branding.textColor}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3">
                    <HexColorPicker
                      color={branding.textColor}
                      onChange={(color) => setBranding({ ...branding, textColor: color })}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Typography & Style */}
        <Card>
          <CardHeader>
            <CardTitle>Typography & Style</CardTitle>
            <CardDescription>Customize fonts and styling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fontFamily">Font Family</Label>
                <Select
                  value={branding.fontFamily}
                  onValueChange={(value) => setBranding({ ...branding, fontFamily: value })}
                >
                  <SelectTrigger id="fontFamily" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILIES.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="borderRadius">Border Radius</Label>
                <Select
                  value={branding.borderRadius}
                  onValueChange={(value) => setBranding({ ...branding, borderRadius: value })}
                >
                  <SelectTrigger id="borderRadius" className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0px">None (0px)</SelectItem>
                    <SelectItem value="4px">Small (4px)</SelectItem>
                    <SelectItem value="8px">Medium (8px)</SelectItem>
                    <SelectItem value="12px">Large (12px)</SelectItem>
                    <SelectItem value="16px">Extra Large (16px)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Live Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>See how your checkout will look</CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border rounded-lg overflow-hidden"
              style={{
                backgroundColor: branding.backgroundColor,
                color: branding.textColor,
                fontFamily: branding.fontFamily,
              }}
            >
              <div
                className="p-4 text-white"
                style={{
                  background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`,
                  borderRadius: `${branding.borderRadius} ${branding.borderRadius} 0 0`,
                }}
              >
                {branding.logo ? (
                  <img
                    src={branding.logo}
                    alt="Logo"
                    className="max-h-10 max-w-[200px] object-contain mx-auto"
                  />
                ) : (
                  <h3 className="text-xl font-semibold text-center">Your Logo Here</h3>
                )}
              </div>
              <div className="p-6 space-y-4">
                <h4 className="text-lg font-semibold">Complete Payment</h4>
                <div className="space-y-2">
                  <div
                    className="border p-3"
                    style={{ borderRadius: branding.borderRadius }}
                  >
                    Card Number
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      className="border p-3"
                      style={{ borderRadius: branding.borderRadius }}
                    >
                      MM/YY
                    </div>
                    <div
                      className="border p-3"
                      style={{ borderRadius: branding.borderRadius }}
                    >
                      CVC
                    </div>
                  </div>
                </div>
                <button
                  className="w-full text-white py-3 font-semibold"
                  style={{
                    backgroundColor: branding.primaryColor,
                    borderRadius: branding.borderRadius,
                  }}
                >
                  Pay $100.00
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shareable Preview Link */}
        <Card>
          <CardHeader>
            <CardTitle>Share Preview</CardTitle>
            <CardDescription>
              Generate a shareable link to preview your branding with team members
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleGeneratePreview}
              disabled={generatePreviewMutation.isPending}
              className="w-full sm:w-auto"
            >
              {generatePreviewMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Share2 className="w-4 h-4 mr-2" />
              )}
              Generate Preview Link
            </Button>

            {previewUrl && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input value={previewUrl} readOnly className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyPreviewLink}
                  >
                    {linkCopied ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold">QR Code</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Scan with mobile device to preview
                    </p>
                    <div className="flex justify-center">
                      <QRCodeSVG value={previewUrl} size={150} />
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 space-y-2">
                    <p className="text-sm font-semibold">Link Details</p>
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">
                        <span className="font-medium">Expires:</span>{" "}
                        {previewExpiry
                          ? new Date(previewExpiry).toLocaleString()
                          : "N/A"}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-medium">Valid for:</span> 24 hours
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Anyone with this link can view your branding preview
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              if (brandingData) {
                setBranding({
                  logo: brandingData.logo || "",
                  primaryColor: brandingData.primaryColor || "#2563eb",
                  secondaryColor: brandingData.secondaryColor || "#1e40af",
                  backgroundColor: brandingData.backgroundColor || "#ffffff",
                  textColor: brandingData.textColor || "#1f2937",
                  fontFamily: brandingData.fontFamily || "Inter",
                  borderRadius: brandingData.borderRadius || "8px",
                });
              }
              toast.info("Changes reset");
            }}
          >
            Reset
          </Button>
          <Button onClick={handleSave} disabled={updateBrandingMutation.isPending}>
            {updateBrandingMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
