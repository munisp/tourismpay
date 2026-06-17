/**
 * Language quick-switcher — accessible from header/nav bar.
 *
 * Supports 8 languages for African tourism context:
 * EN, FR, PT, SW (Swahili), AR, HA (Hausa), YO (Yoruba), IG (Igbo)
 */
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
  direction: "ltr" | "rtl";
}

const LANGUAGES: Language[] = [
  { code: "en", name: "English", nativeName: "English", flag: "\u{1F1EC}\u{1F1E7}", direction: "ltr" },
  { code: "fr", name: "French", nativeName: "Fran\u00e7ais", flag: "\u{1F1EB}\u{1F1F7}", direction: "ltr" },
  { code: "pt", name: "Portuguese", nativeName: "Portugu\u00eas", flag: "\u{1F1F5}\u{1F1F9}", direction: "ltr" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", flag: "\u{1F1F0}\u{1F1EA}", direction: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629", flag: "\u{1F1F8}\u{1F1E6}", direction: "rtl" },
  { code: "ha", name: "Hausa", nativeName: "Hausa", flag: "\u{1F1F3}\u{1F1EC}", direction: "ltr" },
  { code: "yo", name: "Yoruba", nativeName: "Yor\u00f9b\u00e1", flag: "\u{1F1F3}\u{1F1EC}", direction: "ltr" },
  { code: "ig", name: "Igbo", nativeName: "Igbo", flag: "\u{1F1F3}\u{1F1EC}", direction: "ltr" },
];

export function LanguageSwitcher() {
  const [currentLang, setCurrentLang] = useState(() => {
    return localStorage.getItem("tourismpay-lang") || "en";
  });

  const current = LANGUAGES.find((l) => l.code === currentLang) || LANGUAGES[0];

  const handleChange = (code: string) => {
    setCurrentLang(code);
    localStorage.setItem("tourismpay-lang", code);
    const lang = LANGUAGES.find((l) => l.code === code);
    if (lang) {
      document.documentElement.dir = lang.direction;
      document.documentElement.lang = code;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
          <Globe className="w-3.5 h-3.5" />
          <span>{current.flag}</span>
          <span className="hidden sm:inline">{current.code.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={`flex items-center gap-2 text-xs ${
              currentLang === lang.code ? "bg-primary/10 font-semibold" : ""
            }`}
          >
            <span className="text-base">{lang.flag}</span>
            <div className="flex-1">
              <div>{lang.name}</div>
              <div className="text-[10px] text-muted-foreground">{lang.nativeName}</div>
            </div>
            {currentLang === lang.code && (
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
