export type SupportedLanguage = "en" | "ha" | "yo" | "ig" | "pcm" | "fr" | "ar";

interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  region: string;
}

export class LanguageDetector {
  private patterns: Array<{ lang: SupportedLanguage; markers: RegExp[] }> = [
    { lang: "ha", markers: [/\b(ina|kana|yana|tana|muna|suna|yaya|sannu|nagode|barka)\b/i] },
    { lang: "yo", markers: [/\b(mo|o|a|won|ṣe|ni|pele|ẹ\s*ku|bawo)\b/i, /[ẹọṣ]/i] },
    { lang: "ig", markers: [/\b(ndewo|kedu|biko|ọ\s*dị|anyi|unu)\b/i, /[ịọụ]/i] },
    { lang: "pcm", markers: [/\b(wetin|how far|abeg|dey|no be|abi|oga|wahala|chop)\b/i] },
    { lang: "fr", markers: [/\b(je|vous|nous|comment|bonjour|merci|oui|non|est)\b/i] },
    { lang: "ar", markers: [/[\u0600-\u06FF]/] },
  ];

  detect(text: string): SupportedLanguage {
    for (const { lang, markers } of this.patterns) {
      for (const marker of markers) {
        if (marker.test(text)) return lang;
      }
    }
    return "en";
  }

  getSupportedLanguages(): LanguageInfo[] {
    return [
      { code: "en", name: "English", nativeName: "English", region: "Nigeria, Pan-African" },
      { code: "ha", name: "Hausa", nativeName: "Hausa", region: "Northern Nigeria, Niger, Chad" },
      { code: "yo", name: "Yoruba", nativeName: "Yorùbá", region: "Southwest Nigeria, Benin" },
      { code: "ig", name: "Igbo", nativeName: "Igbo", region: "Southeast Nigeria" },
      { code: "pcm", name: "Nigerian Pidgin", nativeName: "Naija", region: "Pan-Nigeria" },
      { code: "fr", name: "French", nativeName: "Français", region: "Francophone Africa" },
      { code: "ar", name: "Arabic", nativeName: "العربية", region: "North Africa, Northern Nigeria" },
    ];
  }
}
