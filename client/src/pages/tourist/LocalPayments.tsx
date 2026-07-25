/**
 * Local Payments — Everyday payment flows for tourists & diaspora
 *
 * 8 tabs: Bill Pay, Virtual Card, Bank Transfer, Ride-Hailing,
 *         Payment Links, Split Bill, Request Money, USSD Pay
 */
import { useState } from "react";
import {
  Phone, CreditCard, Building2, Car, Link2, Users2, HandCoins, Terminal,
  Zap, Tv, Wifi, Droplets, ChevronRight, Search, Plus, Snowflake,
  Sun, Shield, Eye, EyeOff, Send, Copy, Share2, QrCode,
  MapPin, Clock, Star, Receipt, ArrowRight, Check,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// ─── Bill Payment Tab ──────────────────────────────────────────────────────

function BillPaymentTab() {
  const [category, setCategory] = useState<string>("airtime");
  const [provider, setProvider] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");

  const categories = [
    { id: "airtime", name: "Airtime", icon: Phone, color: "text-green-500" },
    { id: "data", name: "Data", icon: Wifi, color: "text-blue-500" },
    { id: "electricity", name: "Electricity", icon: Zap, color: "text-yellow-500" },
    { id: "cable_tv", name: "Cable TV", icon: Tv, color: "text-purple-500" },
    { id: "water", name: "Water", icon: Droplets, color: "text-cyan-500" },
    { id: "internet", name: "Internet", icon: Wifi, color: "text-indigo-500" },
  ];

  const providers: Record<string, Array<{ id: string; name: string }>> = {
    airtime: [
      { id: "mtn-ng-airtime", name: "MTN Nigeria" },
      { id: "airtel-ng-airtime", name: "Airtel Nigeria" },
      { id: "glo-ng-airtime", name: "Glo Nigeria" },
      { id: "9mobile-ng-airtime", name: "9mobile Nigeria" },
      { id: "safaricom-ke-airtime", name: "Safaricom (KE)" },
    ],
    data: [
      { id: "mtn-ng-data", name: "MTN Nigeria Data" },
      { id: "airtel-ng-data", name: "Airtel Nigeria Data" },
      { id: "glo-ng-data", name: "Glo Nigeria Data" },
    ],
    electricity: [
      { id: "ekedc-prepaid", name: "EKEDC (Eko)" },
      { id: "ikedc-prepaid", name: "IKEDC (Ikeja)" },
      { id: "aedc-prepaid", name: "AEDC (Abuja)" },
      { id: "phed-prepaid", name: "PHED (Port Harcourt)" },
      { id: "ibedc-prepaid", name: "IBEDC (Ibadan)" },
      { id: "kplc-prepaid", name: "Kenya Power (KE)" },
    ],
    cable_tv: [
      { id: "dstv-ng", name: "DStv Nigeria" },
      { id: "gotv-ng", name: "GOtv Nigeria" },
      { id: "startimes-ng", name: "StarTimes Nigeria" },
    ],
    water: [{ id: "lswc-ng", name: "Lagos Water Corp" }],
    internet: [
      { id: "spectranet-ng", name: "Spectranet" },
      { id: "smile-ng", name: "Smile Communications" },
    ],
  };

  const dataPlans = [
    { id: "500mb-1d", name: "500MB — 1 day", price: "₦150" },
    { id: "1gb-1d", name: "1GB — 1 day", price: "₦300" },
    { id: "2gb-30d", name: "2GB — 30 days", price: "₦1,200" },
    { id: "5gb-30d", name: "5GB — 30 days", price: "₦2,500" },
    { id: "10gb-30d", name: "10GB — 30 days", price: "₦3,500" },
    { id: "25gb-30d", name: "25GB — 30 days", price: "₦6,000" },
  ];

  const placeholders: Record<string, string> = {
    airtime: "Phone number (e.g., 08012345678)",
    data: "Phone number (e.g., 08012345678)",
    electricity: "Meter number",
    cable_tv: "Smart card number",
    water: "Account number",
    internet: "Account number",
  };

  const handlePay = () => {
    if (!provider || !accountNumber || (!amount && category !== "data")) {
      toast.error("Please fill all fields");
      return;
    }
    toast.success(`${categories.find(c => c.id === category)?.name} payment of ₦${parseFloat(amount || "0").toLocaleString()} submitted!`);
  };

  return (
    <div className="space-y-6">
      {/* Category selector */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {categories.map(cat => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.id}
              onClick={() => { setCategory(cat.id); setProvider(""); }}
              className={`p-3 rounded-lg border-2 transition-all text-center ${
                category === cat.id ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              <Icon className={`w-6 h-6 mx-auto mb-1 ${cat.color}`} />
              <p className="text-xs font-medium">{cat.name}</p>
            </button>
          );
        })}
      </div>

      <Separator />

      {/* Provider */}
      <div className="space-y-2">
        <Label>Select Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger>
            <SelectValue placeholder="Choose provider" />
          </SelectTrigger>
          <SelectContent>
            {(providers[category] ?? []).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Account/Phone */}
      <div className="space-y-2">
        <Label>{category === "airtime" || category === "data" ? "Phone Number" : "Account Number"}</Label>
        <Input
          placeholder={placeholders[category]}
          value={accountNumber}
          onChange={e => setAccountNumber(e.target.value)}
        />
      </div>

      {/* Data plans (only for data category) */}
      {category === "data" && provider && (
        <div className="space-y-2">
          <Label>Select Data Plan</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {dataPlans.map(plan => (
              <button
                key={plan.id}
                onClick={() => { setSelectedPlan(plan.id); setAmount(plan.price.replace(/[₦,]/g, "")); }}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedPlan === plan.id ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30"
                }`}
              >
                <p className="text-sm font-semibold">{plan.name}</p>
                <p className="text-xs text-muted-foreground">{plan.price}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Amount (for non-data) */}
      {category !== "data" && (
        <div className="space-y-2">
          <Label>Amount (NGN)</Label>
          <Input
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
      )}

      <Button onClick={handlePay} className="w-full" size="lg" disabled={!provider || !accountNumber}>
        <Send className="w-4 h-4 mr-2" />
        Pay {amount ? `₦${parseFloat(amount).toLocaleString()}` : ""}
      </Button>
    </div>
  );
}

// ─── Virtual Card Tab ──────────────────────────────────────────────────────

function VirtualCardTab() {
  const [cards] = useState([
    { id: "vc1", type: "visa", masked: "4242 **** **** 7890", balance: 250.00, currency: "USD", status: "active", label: "Travel Card" },
    { id: "vc2", type: "mastercard", masked: "5399 **** **** 3456", balance: 50000, currency: "NGN", status: "active", label: "Local Expenses" },
  ]);
  const [showIssue, setShowIssue] = useState(false);
  const [cardType, setCardType] = useState("visa");
  const [currency, setCurrency] = useState("USD");
  const [fundAmount, setFundAmount] = useState("100");
  const [label, setLabel] = useState("Travel Card");

  const handleIssue = () => {
    toast.success(`${cardType.toUpperCase()} virtual card issued! Balance: ${currency} ${fundAmount}`);
    setShowIssue(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Virtual Cards</h3>
          <p className="text-sm text-muted-foreground">Use at any POS terminal, online store, or ATM</p>
        </div>
        <Button onClick={() => setShowIssue(!showIssue)} size="sm">
          <Plus className="w-4 h-4 mr-1" /> New Card
        </Button>
      </div>

      {showIssue && (
        <Card className="border-primary">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Card Type</Label>
                <Select value={cardType} onValueChange={setCardType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="mastercard">Mastercard</SelectItem>
                    <SelectItem value="verve">Verve (Nigeria)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="NGN">NGN</SelectItem>
                    <SelectItem value="KES">KES</SelectItem>
                    <SelectItem value="GHS">GHS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Initial Funding</Label>
                <Input type="number" value={fundAmount} onChange={e => setFundAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Card Label</Label>
                <Input value={label} onChange={e => setLabel(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2"><Switch defaultChecked /> POS</label>
                <label className="flex items-center gap-2"><Switch defaultChecked /> Online</label>
                <label className="flex items-center gap-2"><Switch /> ATM</label>
                <label className="flex items-center gap-2"><Switch defaultChecked /> International</label>
              </div>
            </div>
            <Button onClick={handleIssue} className="w-full">
              Issue {cardType.toUpperCase()} Virtual Card
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Card list */}
      <div className="grid gap-4">
        {cards.map(card => (
          <Card key={card.id} className="overflow-hidden">
            <div className={`h-2 ${card.type === "visa" ? "bg-blue-500" : card.type === "mastercard" ? "bg-red-500" : "bg-green-500"}`} />
            <CardContent className="pt-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5" />
                    <span className="font-mono text-sm">{card.masked}</span>
                    <Badge variant="outline" className="text-xs uppercase">{card.type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{card.currency} {card.balance.toLocaleString()}</p>
                  <Badge variant={card.status === "active" ? "default" : "destructive"} className="text-xs">
                    {card.status}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => toast.success("Card funded!")}>
                  <Plus className="w-3 h-3 mr-1" /> Fund
                </Button>
                <Button size="sm" variant="outline" onClick={() => toast.success("Card frozen!")}>
                  <Snowflake className="w-3 h-3 mr-1" /> Freeze
                </Button>
                <Button size="sm" variant="outline">
                  <Shield className="w-3 h-3 mr-1" /> Controls
                </Button>
                <Button size="sm" variant="outline">
                  <Receipt className="w-3 h-3 mr-1" /> Transactions
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Bank Transfer Tab ─────────────────────────────────────────────────────

function BankTransferTab() {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [amount, setAmount] = useState("");
  const [narration, setNarration] = useState("");
  const [verified, setVerified] = useState(false);

  const banks = [
    { code: "044", name: "Access Bank" },
    { code: "058", name: "GTBank" },
    { code: "011", name: "First Bank" },
    { code: "033", name: "UBA" },
    { code: "057", name: "Zenith Bank" },
    { code: "070", name: "Fidelity Bank" },
    { code: "232", name: "Sterling Bank" },
    { code: "035", name: "Wema Bank" },
    { code: "999", name: "OPay" },
    { code: "998", name: "PalmPay" },
    { code: "101", name: "Kuda" },
    { code: "214", name: "FCMB" },
    { code: "050", name: "Ecobank" },
    { code: "076", name: "Polaris Bank" },
    { code: "032", name: "Union Bank" },
    { code: "039", name: "Stanbic IBTC" },
    { code: "082", name: "Keystone Bank" },
    { code: "030", name: "Heritage Bank" },
  ];

  const handleVerify = () => {
    if (accountNumber.length !== 10) {
      toast.error("Account number must be 10 digits");
      return;
    }
    setAccountName(`Customer ${accountNumber.slice(0, 3)}****${accountNumber.slice(7)}`);
    setVerified(true);
    toast.success("Account verified!");
  };

  const handleTransfer = () => {
    const amt = parseFloat(amount);
    const fee = amt <= 5000 ? 10.75 : amt <= 50000 ? 25.75 : 53.75;
    toast.success(`₦${amt.toLocaleString()} sent to ${accountName}! Fee: ₦${fee}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Send to Any Nigerian Bank Account</h3>
        <p className="text-sm text-muted-foreground">Instant transfer via NIBSS NIP — arrives in seconds</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Select Bank</Label>
          <Select value={bankCode} onValueChange={v => { setBankCode(v); setVerified(false); setAccountName(""); }}>
            <SelectTrigger>
              <SelectValue placeholder="Choose bank" />
            </SelectTrigger>
            <SelectContent>
              {banks.map(b => (
                <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Account Number (NUBAN)</Label>
          <div className="flex gap-2">
            <Input
              placeholder="10-digit account number"
              maxLength={10}
              value={accountNumber}
              onChange={e => { setAccountNumber(e.target.value.replace(/\D/g, "")); setVerified(false); }}
            />
            <Button onClick={handleVerify} disabled={accountNumber.length !== 10 || !bankCode} variant="outline">
              <Search className="w-4 h-4 mr-1" /> Verify
            </Button>
          </div>
        </div>

        {verified && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2">
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">{accountName}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label>Amount (NGN)</Label>
          <Input
            type="number"
            placeholder="Enter amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          {amount && (
            <p className="text-xs text-muted-foreground">
              Fee: ₦{parseFloat(amount) <= 5000 ? "10.75" : parseFloat(amount) <= 50000 ? "25.75" : "53.75"} (NIBSS NIP)
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Narration (optional)</Label>
          <Input
            placeholder="Payment description"
            value={narration}
            onChange={e => setNarration(e.target.value)}
            maxLength={100}
          />
        </div>

        <Button onClick={handleTransfer} className="w-full" size="lg" disabled={!verified || !amount}>
          <Send className="w-4 h-4 mr-2" />
          Send ₦{amount ? parseFloat(amount).toLocaleString() : "0"}
        </Button>
      </div>
    </div>
  );
}

// ─── Ride-Hailing Tab ──────────────────────────────────────────────────────

function RideHailingTab() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [showQuotes, setShowQuotes] = useState(false);

  const providers = [
    { id: "uber", name: "Uber", arrival: "4 min", fare: "₦2,450", color: "bg-black text-white" },
    { id: "bolt", name: "Bolt", arrival: "3 min", fare: "₦2,150", color: "bg-green-500 text-white" },
    { id: "indrive", name: "inDrive", arrival: "5 min", fare: "₦1,800", color: "bg-purple-500 text-white" },
    { id: "rida", name: "Rida", arrival: "6 min", fare: "₦1,650", color: "bg-blue-500 text-white" },
  ];

  const handleGetQuotes = () => {
    if (!pickup || !dropoff) {
      toast.error("Enter pickup and dropoff locations");
      return;
    }
    setShowQuotes(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Book a Ride</h3>
        <p className="text-sm text-muted-foreground">Pay with your TourismPay wallet — no cash needed</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1"><MapPin className="w-3 h-3 text-green-500" /> Pickup</Label>
          <Input placeholder="Enter pickup location" value={pickup} onChange={e => setPickup(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-1"><MapPin className="w-3 h-3 text-red-500" /> Dropoff</Label>
          <Input placeholder="Enter dropoff location" value={dropoff} onChange={e => setDropoff(e.target.value)} />
        </div>

        <Button onClick={handleGetQuotes} className="w-full" disabled={!pickup || !dropoff}>
          <Car className="w-4 h-4 mr-2" /> Compare Ride Prices
        </Button>
      </div>

      {showQuotes && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Available Rides</h4>
          {providers.map(p => (
            <Card key={p.id} className="cursor-pointer hover:border-primary transition-all">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${p.color}`}>
                    {p.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{p.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {p.arrival} · <Star className="w-3 h-3 text-yellow-500" /> 4.8
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">{p.fare}</p>
                  <Button size="sm" className="mt-1" onClick={() => toast.success(`${p.name} ride booked!`)}>
                    Book <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Payment Links Tab ─────────────────────────────────────────────────────

function PaymentLinksTab() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [generatedLink, setGeneratedLink] = useState("");

  const handleCreate = () => {
    if (!description) { toast.error("Add a description"); return; }
    const linkId = Math.random().toString(36).substring(2, 10);
    setGeneratedLink(`https://pay.tourismpay.com/p/${linkId}`);
    toast.success("Payment link created!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Payment Links</h3>
        <p className="text-sm text-muted-foreground">Create shareable payment links — send via WhatsApp, SMS, or email</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Amount (optional — payer enters amount)</Label>
          <Input type="number" placeholder="Amount in NGN" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input placeholder="e.g., Safari booking deposit" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <Button onClick={handleCreate} className="w-full">
          <Link2 className="w-4 h-4 mr-2" /> Create Payment Link
        </Button>
      </div>

      {generatedLink && (
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4 space-y-3">
            <Label>Your Payment Link</Label>
            <div className="flex gap-2">
              <Input value={generatedLink} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(generatedLink); toast.success("Copied!"); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Pay me: ${generatedLink}`)}`)}>
                <Share2 className="w-4 h-4 mr-1" /> WhatsApp
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success("QR code generated!")}>
                <QrCode className="w-4 h-4 mr-1" /> QR Code
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Split Bill Tab ────────────────────────────────────────────────────────

function SplitBillTab() {
  const [totalAmount, setTotalAmount] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState([
    { name: "You", amount: 0 },
    { name: "", amount: 0 },
  ]);

  const addParticipant = () => {
    setParticipants([...participants, { name: "", amount: 0 }]);
  };

  const updateName = (idx: number, name: string) => {
    const updated = [...participants];
    updated[idx].name = name;
    setParticipants(updated);
  };

  const handleSplit = () => {
    if (!totalAmount || !description) { toast.error("Fill total and description"); return; }
    const perPerson = parseFloat(totalAmount) / participants.length;
    toast.success(`Bill split! Each person owes ₦${perPerson.toLocaleString()}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Split a Bill</h3>
        <p className="text-sm text-muted-foreground">Divide expenses among your travel group</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Total Amount (NGN)</Label>
            <Input type="number" placeholder="e.g., 25000" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input placeholder="e.g., Dinner at Terra Kulture" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Participants ({participants.length})</Label>
            <Button variant="ghost" size="sm" onClick={addParticipant}>
              <Plus className="w-3 h-3 mr-1" /> Add Person
            </Button>
          </div>
          {participants.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                placeholder={i === 0 ? "You" : `Person ${i + 1}`}
                value={p.name}
                onChange={e => updateName(i, e.target.value)}
                disabled={i === 0}
              />
              {totalAmount && (
                <span className="text-sm font-mono w-32 text-right">
                  ₦{(parseFloat(totalAmount) / participants.length).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
          ))}
        </div>

        <Button onClick={handleSplit} className="w-full" disabled={!totalAmount || participants.length < 2}>
          <Users2 className="w-4 h-4 mr-2" /> Split & Send Requests
        </Button>
      </div>
    </div>
  );
}

// ─── Request Money Tab ─────────────────────────────────────────────────────

function RequestMoneyTab() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");

  const handleRequest = () => {
    if (!amount || !description) { toast.error("Fill amount and description"); return; }
    toast.success("Payment request sent!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Request Money</h3>
        <p className="text-sm text-muted-foreground">Send a payment request to anyone — they pay from their wallet</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Amount (NGN)</Label>
          <Input type="number" placeholder="How much?" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>From (email or username)</Label>
          <Input placeholder="friend@email.com or @username" value={recipient} onChange={e => setRecipient(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>What's it for?</Label>
          <Input placeholder="e.g., Tour guide fee, shared taxi" value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <Button onClick={handleRequest} className="w-full" size="lg">
          <HandCoins className="w-4 h-4 mr-2" /> Send Request
        </Button>
      </div>
    </div>
  );
}

// ─── USSD Pay Tab ──────────────────────────────────────────────────────────

function USSDPayTab() {
  const [amount, setAmount] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">USSD Payment</h3>
        <p className="text-sm text-muted-foreground">Pay offline merchants using your phone's dialer — no internet needed</p>
      </div>

      <Card className="bg-black text-green-400 font-mono">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-lg">Dial from your phone:</p>
            <p className="text-3xl font-bold">*555#</p>
            <div className="text-left text-sm space-y-1 border border-green-400/30 p-4 rounded">
              <p>1. Check Balance</p>
              <p>2. Pay Merchant</p>
              <p>3. Send Money</p>
              <p>4. Buy Airtime</p>
              <p>5. Bill Payment</p>
              <p>6. Request Money</p>
              <p>7. Mini Statement</p>
            </div>
            <p className="text-xs text-green-400/60">Works on any phone — no internet required</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <p className="text-sm font-semibold">Quick Pay — Generate USSD Code</p>
        <div className="space-y-2">
          <Label>Amount (NGN)</Label>
          <Input type="number" placeholder="Enter amount" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <Button variant="outline" className="w-full" onClick={() => toast.success(`Dial *555*2*${amount}# to pay`)}>
          <Terminal className="w-4 h-4 mr-2" />
          Generate USSD Code {amount ? `(*555*2*${amount}#)` : ""}
        </Button>
      </div>

      <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-yellow-600 dark:text-yellow-400">
        <strong>NCC Notice:</strong> USSD services require an active Nigerian SIM card. Standard session charges of ₦6.98/20s apply.
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function LocalPayments() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Local Payments</h1>
        <p className="text-muted-foreground">Pay for everyday items — food, transport, bills, hospital, and more</p>
      </div>

      <Tabs defaultValue="bills" className="w-full">
        <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 h-auto gap-1">
          <TabsTrigger value="bills" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">Bills</span>
          </TabsTrigger>
          <TabsTrigger value="card" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <CreditCard className="w-4 h-4" />
            <span className="hidden sm:inline">Card</span>
          </TabsTrigger>
          <TabsTrigger value="bank" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Bank</span>
          </TabsTrigger>
          <TabsTrigger value="rides" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <Car className="w-4 h-4" />
            <span className="hidden sm:inline">Rides</span>
          </TabsTrigger>
          <TabsTrigger value="links" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Links</span>
          </TabsTrigger>
          <TabsTrigger value="split" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <Users2 className="w-4 h-4" />
            <span className="hidden sm:inline">Split</span>
          </TabsTrigger>
          <TabsTrigger value="request" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <HandCoins className="w-4 h-4" />
            <span className="hidden sm:inline">Request</span>
          </TabsTrigger>
          <TabsTrigger value="ussd" className="text-xs px-2 py-2 flex flex-col items-center gap-1">
            <Terminal className="w-4 h-4" />
            <span className="hidden sm:inline">USSD</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bills">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Phone className="w-5 h-5" /> Bill Payments</CardTitle><CardDescription>Buy airtime, data, pay electricity, cable TV, and more</CardDescription></CardHeader><CardContent><BillPaymentTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="card">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="w-5 h-5" /> Virtual Cards</CardTitle><CardDescription>Issue Visa/Mastercard/Verve cards for POS, online shopping, and ATM</CardDescription></CardHeader><CardContent><VirtualCardTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="bank">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5" /> Bank Transfer</CardTitle><CardDescription>Send money to any Nigerian bank account via NIBSS NIP</CardDescription></CardHeader><CardContent><BankTransferTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="rides">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Car className="w-5 h-5" /> Ride-Hailing</CardTitle><CardDescription>Book rides with Uber, Bolt, inDrive — pay from wallet</CardDescription></CardHeader><CardContent><RideHailingTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="links">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" /> Payment Links</CardTitle><CardDescription>Create shareable payment links for merchants or friends</CardDescription></CardHeader><CardContent><PaymentLinksTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="split">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users2 className="w-5 h-5" /> Split Bill</CardTitle><CardDescription>Divide restaurant bills and shared expenses</CardDescription></CardHeader><CardContent><SplitBillTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="request">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><HandCoins className="w-5 h-5" /> Request Money</CardTitle><CardDescription>Send payment requests to friends or clients</CardDescription></CardHeader><CardContent><RequestMoneyTab /></CardContent></Card>
        </TabsContent>
        <TabsContent value="ussd">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Terminal className="w-5 h-5" /> USSD Payment</CardTitle><CardDescription>Pay offline — dial *555# from any phone</CardDescription></CardHeader><CardContent><USSDPayTab /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
