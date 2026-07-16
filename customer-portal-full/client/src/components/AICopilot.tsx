import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Bot, 
  Send, 
  User, 
  Sparkles, 
  X,
  Minimize2,
  Lightbulb,
  Wand2,
  HelpCircle,
  Globe,
  Loader2
} from "lucide-react";

type CopilotLanguage = "en" | "yo" | "ha" | "ig" | "pcm";

const LANGUAGE_OPTIONS: { code: CopilotLanguage; name: string; nativeName: string }[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "ha", name: "Hausa", nativeName: "Hausa" },
  { code: "ig", name: "Igbo", nativeName: "Igbo" },
  { code: "pcm", name: "Pidgin", nativeName: "Naija Pidgin" },
];

const GREETINGS: Record<CopilotLanguage, string> = {
  en: "Hi! I'm your AI assistant, here to help you complete your insurance application.",
  yo: "Pẹlẹ o! Mo jẹ oluranlọwọ AI rẹ, mo wa nibi lati ran ọ lọwọ lati pari ohun elo iṣeduro rẹ.",
  ha: "Sannu! Ni ne mataimakinka na AI, ina nan don taimaka maka kammala aikace-aikacen inshorar ka.",
  ig: "Ndewo! Abụ m onye enyemaka AI gị, anọ m ebe a inyere gị aka imezu ngwa inshọransị gị.",
  pcm: "How far! Na me be your AI helper wey go help you finish your insurance application.",
};

const MULTILINGUAL_SUGGESTIONS: Record<CopilotLanguage, string[]> = {
  en: ["What documents do I need?", "Explain coverage options", "Help me fill this form"],
  yo: ["Awọn iwe wo ni mo nilo?", "Ṣalaye awọn aṣayan ideri", "Ran mi lọwọ lati kun fọọmu yii"],
  ha: ["Waɗanne takardu nake bukata?", "Bayyana zaɓuɓɓukan rufe", "Taimaka mini cika wannan fom"],
  ig: ["Kedu akwụkwọ m chọrọ?", "Kọwaa nhọrọ mkpuchi", "Nyere m aka dejupụta fọm a"],
  pcm: ["Wetin documents I need?", "Explain the coverage options", "Help me fill this form abeg"],
};

const UI_TEXT: Record<string, Record<CopilotLanguage, string>> = {
  askAnything: {
    en: "Ask me anything...",
    yo: "Beere ohunkohun lọwọ mi...",
    ha: "Tambaye ni komai...",
    ig: "Jụọ m ihe ọ bụla...",
    pcm: "Ask me anything...",
  },
  pressEnter: {
    en: "Press Enter to send or click a suggestion",
    yo: "Tẹ Tẹ sii lati firanṣẹ tabi tẹ imọran kan",
    ha: "Danna Shigar don aikawa ko danna shawara",
    ig: "Pịa Tinye iji zipu ma ọ bụ pịa ntụnye",
    pcm: "Press Enter to send or click suggestion",
  },
  aiAssistant: {
    en: "AI Application Assistant",
    yo: "Oluranlọwọ Ohun elo AI",
    ha: "Mataimakin Aikace-aikace na AI",
    ig: "Onye enyemaka Ngwa AI",
    pcm: "AI Application Assistant",
  },
  hereToHelp: {
    en: "Here to help you apply",
    yo: "Nibi lati ran ọ lọwọ lati lo",
    ha: "Anan don taimaka maka nema",
    ig: "Ebe a inyere gị aka itinye",
    pcm: "Dey here to help you apply",
  },
  online: {
    en: "Online",
    yo: "Lori ayelujara",
    ha: "A kan layi",
    ig: "N'ịntanetị",
    pcm: "Online",
  },
  thinking: {
    en: "Thinking...",
    yo: "Nronu...",
    ha: "Yana tunani...",
    ig: "Na-eche echiche...",
    pcm: "Dey think...",
  },
};

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  suggestions?: string[];
  action?: {
    type: "autofill" | "validate" | "explain";
    field?: string;
    value?: string;
  };
}

interface AICopilotProps {
  productType: string;
  currentStep: number;
  formData: Record<string, unknown>;
  onAutofill?: (field: string, value: string) => void;
  currentField?: string;
}

const FIELD_HELP: Record<string, Record<string, { help: string; tips: string[] }>> = {
  personal: {
    fullName: {
      help: "Enter your full legal name exactly as it appears on your government-issued ID (NIN slip, driver's license, or international passport).",
      tips: ["Use your full name, not nicknames", "Include middle names if on your ID", "Ensure spelling matches your documents"],
    },
    nin: {
      help: "Your National Identification Number (NIN) is an 11-digit number issued by NIMC. You can find it on your NIN slip or check via USSD *346#.",
      tips: ["NIN is exactly 11 digits", "No spaces or dashes needed", "If you don't have one, visit any NIMC office"],
    },
    bvn: {
      help: "Your Bank Verification Number (BVN) is an 11-digit number linked to your bank accounts. Dial *565*0# from your registered phone to retrieve it.",
      tips: ["BVN is exactly 11 digits", "Same BVN across all your banks", "Required for premium payments"],
    },
    phone: {
      help: "Enter your active Nigerian phone number. This will be used for OTP verification and policy notifications.",
      tips: ["Use format: +234 or 0 prefix", "Must be able to receive SMS", "This number will receive claim updates"],
    },
    email: {
      help: "Provide a valid email address for receiving policy documents, receipts, and important notifications.",
      tips: ["Use an email you check regularly", "Policy documents will be sent here", "Required for online account access"],
    },
  },
  coverage: {
    planType: {
      help: "Choose a plan based on your coverage needs and budget. Higher plans offer more comprehensive coverage but cost more.",
      tips: ["Basic: Essential coverage at lowest cost", "Standard: Balanced coverage for most needs", "Premium: Maximum protection with extras"],
    },
    startDate: {
      help: "Select when you want your coverage to begin. Most policies can start from the next business day after approval.",
      tips: ["Cannot be backdated", "Coverage begins at 12:01 AM on start date", "Allow 1-3 days for application processing"],
    },
    paymentFrequency: {
      help: "Choose how often you want to pay your premium. Annual payment offers the best discount.",
      tips: ["Annual: Save 10% on total premium", "Monthly: Easier on budget but costs more overall", "Auto-debit available for all options"],
    },
  },
  crop: {
    cropType: {
      help: "Select the primary crop you want to insure. Different crops have different risk profiles and coverage options.",
      tips: ["Maize, rice, and cassava are most common", "Multi-crop coverage available for premium plans", "Seasonal crops have specific planting windows"],
    },
    farmSize: {
      help: "Enter your farm size in hectares. This determines your maximum coverage amount and premium calculation.",
      tips: ["1 hectare = 2.47 acres", "Minimum insurable size is 0.5 hectares", "GPS verification may be required"],
    },
    irrigationType: {
      help: "Indicate your primary water source for farming. Irrigated farms typically have lower risk premiums.",
      tips: ["Rain-fed farms have higher weather risk", "Irrigation reduces drought claim likelihood", "Affects your premium calculation"],
    },
  },
  livestock: {
    livestockType: {
      help: "Select the type of animals you want to insure. Each animal type has specific coverage terms and valuation methods.",
      tips: ["Cattle, goats, and poultry most common", "Mixed herds can be covered under one policy", "Exotic breeds may need special valuation"],
    },
    numberOfAnimals: {
      help: "Enter the total number of animals to be covered. Each animal will be individually identified and valued.",
      tips: ["Minimum 5 animals for herd coverage", "Individual animal coverage available", "Ear tags or microchips required"],
    },
    vaccinationStatus: {
      help: "Indicate if your animals are up-to-date on required vaccinations. This affects eligibility and premium rates.",
      tips: ["Core vaccines required for coverage", "Vaccination records will be verified", "Unvaccinated animals may be excluded"],
    },
  },
  aquaculture: {
    fishSpecies: {
      help: "Select the fish species you're farming. Different species have different mortality rates and coverage terms.",
      tips: ["Catfish and tilapia most common in Nigeria", "Fingerling vs. table-size affects coverage", "Exotic species may need special assessment"],
    },
    stockingDensity: {
      help: "Enter the number of fish per cubic meter of water. Overstocking increases disease risk and may affect coverage.",
      tips: ["Recommended: 20-50 fish/m³ for catfish", "Higher density = higher risk premium", "Water quality monitoring required"],
    },
    waterSource: {
      help: "Indicate your primary water source. Water quality directly impacts fish health and claim eligibility.",
      tips: ["Borehole water preferred", "River water needs treatment", "Regular water testing required"],
    },
  },
  documents: {
    idDocument: {
      help: "Upload a clear photo or scan of your government-issued ID (NIN slip, driver's license, voter's card, or international passport).",
      tips: ["File size max 5MB", "Accepted formats: JPG, PNG, PDF", "All corners must be visible"],
    },
    proofOfAddress: {
      help: "Upload a utility bill, bank statement, or tenancy agreement dated within the last 3 months showing your current address.",
      tips: ["Must show your name and address", "Dated within last 3 months", "PHCN bill, water bill, or bank statement accepted"],
    },
  },
};

const PRODUCT_SPECIFIC_TIPS: Record<string, string[]> = {
  health: [
    "Pre-existing conditions must be declared - they may still be covered after a waiting period",
    "Add dependents now to get family coverage at a discounted rate",
    "Our network includes over 500 hospitals across Nigeria",
  ],
  auto: [
    "Third-party insurance is legally required in Nigeria",
    "Comprehensive coverage protects your own vehicle too",
    "Safe driver discounts available after 1 year claim-free",
  ],
  property: [
    "Coverage includes fire, flood, and theft protection",
    "Contents coverage can be added for personal belongings",
    "Annual property valuation ensures adequate coverage",
  ],
  life: [
    "Beneficiary information is crucial - ensure details are accurate",
    "Critical illness rider available for additional protection",
    "Premium remains fixed for the policy term",
  ],
  crop: [
    "Satellite imagery is used to verify farm boundaries and crop health",
    "Weather index triggers automatic payouts without claim filing",
    "Planting date must be within the approved season window",
  ],
  livestock: [
    "All animals must be tagged or microchipped before coverage begins",
    "Veterinary inspection required within 30 days of application",
    "Mortality coverage excludes pre-existing conditions",
  ],
  "weather-index": [
    "Payouts are automatic when weather triggers are met",
    "No claim filing required - smart contracts handle everything",
    "Coverage is based on nearest weather station data",
  ],
  aquaculture: [
    "Water quality testing required before coverage approval",
    "Stocking density affects your premium rate",
    "Disease outbreak coverage includes quarantine costs",
  ],
};

function getContextualResponse(
  productType: string,
  currentStep: number,
  currentField: string | undefined,
  message: string
): { response: string; suggestions: string[]; action?: Message["action"] } {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes("help") && currentField) {
    const stepKey = currentStep === 1 ? "personal" : currentStep === 2 ? "coverage" : "documents";
    const fieldHelp = FIELD_HELP[stepKey]?.[currentField] || FIELD_HELP[productType]?.[currentField];
    
    if (fieldHelp) {
      return {
        response: `**${currentField.replace(/([A-Z])/g, ' $1').trim()}**\n\n${fieldHelp.help}\n\n**Tips:**\n${fieldHelp.tips.map(t => `- ${t}`).join('\n')}`,
        suggestions: ["What documents do I need?", "How is my premium calculated?", "What's covered under this plan?"],
      };
    }
  }
  
  if (lowerMessage.includes("autofill") || lowerMessage.includes("fill") || lowerMessage.includes("auto")) {
    return {
      response: "I can help auto-fill some fields based on your uploaded documents. Would you like me to:\n\n1. **Extract info from your ID** - Name, date of birth, NIN\n2. **Use your profile data** - If you've applied before\n3. **Suggest common values** - Based on your location\n\nNote: You'll be able to review and edit all auto-filled values before submitting.",
      suggestions: ["Extract from my ID", "Use my profile", "Fill with suggestions"],
      action: { type: "autofill" },
    };
  }
  
  if (lowerMessage.includes("document") || lowerMessage.includes("upload")) {
    const docRequirements: Record<string, string> = {
      health: "- Valid government ID (NIN slip, driver's license, or passport)\n- Proof of address (utility bill or bank statement)\n- Passport photograph",
      auto: "- Valid government ID\n- Vehicle registration papers\n- Driver's license\n- Proof of address",
      property: "- Valid government ID\n- Property ownership documents or tenancy agreement\n- Recent property photos\n- Proof of address",
      life: "- Valid government ID\n- Proof of address\n- Medical examination report (for coverage above ₦10M)\n- Beneficiary ID copy",
      crop: "- Valid government ID\n- Land ownership or lease documents\n- Farm registration certificate\n- GPS coordinates of farm",
      livestock: "- Valid government ID\n- Animal purchase receipts\n- Vaccination records\n- Photos of animals with ear tags",
      "weather-index": "- Valid government ID\n- Farm location coordinates\n- Proof of farming activity",
      aquaculture: "- Valid government ID\n- Pond/facility ownership documents\n- Water quality test results\n- Stock purchase receipts",
    };
    
    return {
      response: `**Required Documents for ${productType.charAt(0).toUpperCase() + productType.slice(1)} Insurance:**\n\n${docRequirements[productType] || docRequirements.health}\n\n**Document Tips:**\n- All documents should be clear and legible\n- File size limit: 5MB per document\n- Accepted formats: JPG, PNG, PDF`,
      suggestions: ["How do I upload documents?", "Can I take a photo instead?", "What if I don't have all documents?"],
    };
  }
  
  if (lowerMessage.includes("premium") || lowerMessage.includes("cost") || lowerMessage.includes("price")) {
    return {
      response: `**How Your Premium is Calculated:**\n\nYour premium depends on several factors:\n\n1. **Coverage Amount** - Higher coverage = higher premium\n2. **Plan Type** - Premium plans cost more but offer better protection\n3. **Risk Factors** - Age, location, and history affect rates\n4. **Payment Frequency** - Annual payment saves 10%\n\n**For ${productType} insurance specifically:**\n${PRODUCT_SPECIFIC_TIPS[productType]?.slice(0, 2).map(t => `- ${t}`).join('\n') || '- Standard industry rates apply'}`,
      suggestions: ["Get a quote now", "What discounts are available?", "Can I pay monthly?"],
    };
  }
  
  if (lowerMessage.includes("cover") || lowerMessage.includes("protect") || lowerMessage.includes("include")) {
    const coverageInfo: Record<string, string> = {
      health: "hospitalization, surgery, outpatient care, maternity (Standard+), dental & optical (Premium)",
      auto: "third-party liability, own damage (Comprehensive), theft, fire, natural disasters",
      property: "fire, flood, theft, natural disasters, contents (optional)",
      life: "death benefit, critical illness (optional), disability (optional)",
      crop: "drought, flood, pest damage, disease, fire, theft",
      livestock: "death, disease, theft, accident, emergency veterinary care",
      "weather-index": "drought (rainfall deficit), excess rainfall, temperature extremes",
      aquaculture: "fish mortality, disease outbreak, water quality issues, theft, natural disasters",
    };
    
    return {
      response: `**What's Covered Under ${productType.charAt(0).toUpperCase() + productType.slice(1)} Insurance:**\n\n${coverageInfo[productType] || 'Standard coverage applies'}\n\n**What's NOT Covered:**\n- Intentional damage or fraud\n- Pre-existing conditions (waiting period may apply)\n- War, terrorism, nuclear events\n- Wear and tear / gradual deterioration`,
      suggestions: ["What's the claims process?", "Are there any exclusions?", "Can I add extra coverage?"],
    };
  }
  
  const tips = PRODUCT_SPECIFIC_TIPS[productType] || PRODUCT_SPECIFIC_TIPS.health;
  return {
    response: `I'm here to help you complete your ${productType} insurance application! Here are some tips:\n\n${tips.map(t => `- ${t}`).join('\n')}\n\nYou're currently on **Step ${currentStep}** of the application. What would you like help with?`,
    suggestions: [
      currentStep === 1 ? "Help with personal info" : currentStep === 2 ? "Explain coverage options" : "What documents do I need?",
      "How is my premium calculated?",
      "What's covered under this plan?",
    ],
  };
}

function buildSystemPrompt(productType: string, currentStep: number, language: CopilotLanguage): string {
  const languageInstructions: Record<CopilotLanguage, string> = {
    en: "Respond in English.",
    yo: "Dahun ni ede Yoruba. Respond in Yoruba language.",
    ha: "Amsa da Hausa. Respond in Hausa language.",
    ig: "Zaa na Igbo. Respond in Igbo language.",
    pcm: "Respond for Naija Pidgin English. Use casual Nigerian Pidgin like 'wetin', 'how far', 'abeg', 'no wahala', etc.",
  };

  return `You are an AI insurance assistant for TourismPay, a Nigerian insurance platform. You help customers complete their ${productType} insurance applications.

Current application step: ${currentStep} of 4 (1=Personal Info, 2=Coverage Details, 3=Documents, 4=Review)

${languageInstructions[language]}

Key guidelines:
- Be helpful, friendly, and concise
- Explain Nigerian insurance terms clearly
- Reference Nigerian regulations (NAICOM) when relevant
- Use Nigerian Naira (₦) for currency
- Mention USSD codes for NIN (*346#) and BVN (*565*0#) when relevant
- For agricultural insurance, explain satellite verification and weather index triggers
- Always provide actionable next steps

Respond with helpful information about the user's question. Keep responses concise but informative.`;
}

export default function AICopilot({ productType, currentStep, formData, onAutofill, currentField }: AICopilotProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [language, setLanguage] = useState<CopilotLanguage>("en");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{
      id: 1,
      role: "assistant",
      content: GREETINGS[language],
      timestamp: new Date(),
      suggestions: MULTILINGUAL_SUGGESTIONS[language],
    }]);
  }, [language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (currentField && isOpen && !isMinimized) {
      const stepKey = currentStep === 1 ? "personal" : currentStep === 2 ? "coverage" : "documents";
      const fieldHelp = FIELD_HELP[stepKey]?.[currentField] || FIELD_HELP[productType]?.[currentField];
      
      if (fieldHelp) {
        const existingHelpForField = messages.find(
          m => m.role === "assistant" && m.content.includes(`**${currentField.replace(/([A-Z])/g, ' $1').trim()}**`)
        );
        
        if (!existingHelpForField) {
          const helpMessage: Message = {
            id: messages.length + 1,
            role: "assistant",
            content: `**Tip for ${currentField.replace(/([A-Z])/g, ' $1').trim()}:**\n${fieldHelp.tips[0]}`,
            timestamp: new Date(),
            suggestions: [`More help with ${currentField}`, "Skip to next field"],
          };
          setMessages(prev => [...prev, helpMessage]);
        }
      }
    }
  }, [currentField]);

  const copilotMutation = trpc.ai.copilot.useMutation();

  const handleSend = async (text?: string) => {
    const messageText = text || inputValue;
    if (!messageText.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    try {
      const result = await copilotMutation.mutateAsync({
        message: messageText,
        systemPrompt: buildSystemPrompt(productType, currentStep, language),
        productType,
        currentStep,
        language,
        history: messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content
        }))
      });

      const assistantMessage: Message = {
        id: messages.length + 2,
        role: "assistant",
        content: result.response,
        timestamp: new Date(),
        suggestions: MULTILINGUAL_SUGGESTIONS[language],
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const fallbackResponse = getContextualResponse(productType, currentStep, currentField, messageText);
      const assistantMessage: Message = {
        id: messages.length + 2,
        role: "assistant",
        content: fallbackResponse.response,
        timestamp: new Date(),
        suggestions: MULTILINGUAL_SUGGESTIONS[language],
      };
      setMessages(prev => [...prev, assistantMessage]);
    }
    
    setIsTyping(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 z-50"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div 
          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full px-4 py-2 shadow-lg cursor-pointer flex items-center gap-2"
          onClick={() => setIsMinimized(false)}
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-medium">{UI_TEXT.aiAssistant[language]}</span>
          <Badge className="bg-white/20 text-white text-xs">{UI_TEXT.online[language]}</Badge>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[520px] bg-white rounded-lg shadow-2xl border flex flex-col z-50">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-3 rounded-t-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-sm">{UI_TEXT.aiAssistant[language]}</p>
              <p className="text-xs text-blue-100">{UI_TEXT.hereToHelp[language]}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={() => setIsMinimized(true)}>
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-white hover:bg-white/20" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-200" />
          <Select value={language} onValueChange={(val) => setLanguage(val as CopilotLanguage)}>
            <SelectTrigger className="h-7 w-32 bg-white/20 border-white/30 text-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map(lang => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge className="bg-green-500/80 text-white text-xs ml-auto">{UI_TEXT.online[language]}</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map(message => (
          <div key={message.id}>
            <div className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.role === "user" ? "bg-blue-600 text-white" : "bg-gradient-to-br from-purple-500 to-blue-500 text-white"
              }`}>
                {message.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div className={`max-w-[85%] rounded-lg p-2.5 text-sm ${
                message.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100"
              }`}>
                <div className="whitespace-pre-wrap">
                  {message.content.split('\n').map((line, i) => {
                    if (line.startsWith('**') && line.includes('**')) {
                      const parts = line.split('**');
                      return (
                        <p key={i} className="mt-1">
                          {parts.map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}
                        </p>
                      );
                    }
                    if (line.startsWith('- ')) {
                      return <p key={i} className="ml-3 text-xs">{line}</p>;
                    }
                    if (line.match(/^\d\./)) {
                      return <p key={i} className="ml-2 text-xs">{line}</p>;
                    }
                    return line ? <p key={i}>{line}</p> : <br key={i} />;
                  })}
                </div>
              </div>
            </div>
            
            {message.role === "assistant" && message.suggestions && (
              <div className="ml-9 mt-2 flex flex-wrap gap-1.5">
                {message.suggestions.map((suggestion, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <Lightbulb className="h-3 w-3 mr-1 text-yellow-500" />
                    {suggestion}
                  </Button>
                ))}
              </div>
            )}

            {message.action?.type === "autofill" && onAutofill && (
              <div className="ml-9 mt-2">
                <Button
                  size="sm"
                  className="text-xs h-7 bg-green-600 hover:bg-green-700"
                  onClick={() => onAutofill("fullName", "Demo User")}
                >
                  <Wand2 className="h-3 w-3 mr-1" />
                  Auto-fill Available Fields
                </Button>
              </div>
            )}
          </div>
        ))}
        
        {isTyping && (
          <div className="flex gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="bg-gray-100 rounded-lg p-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t bg-gray-50 rounded-b-lg">
        <div className="flex gap-2">
          <Input
            placeholder={UI_TEXT.askAnything[language]}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isTyping}
            className="text-sm h-9"
          />
          <Button 
            onClick={() => handleSend()} 
            disabled={isTyping || !inputValue.trim()}
            size="sm"
            className="h-9 w-9 p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-2 text-xs text-muted-foreground">
          <HelpCircle className="h-3 w-3" />
          <span>{UI_TEXT.pressEnter[language]}</span>
        </div>
      </div>
    </div>
  );
}
