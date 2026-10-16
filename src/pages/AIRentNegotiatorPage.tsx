import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import HeaderSection from "../components/HeaderSection";
import FooterSection from "../components/FooterSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  MessageSquareCode,
  Bot,
  Copy,
  Send,
  TrendingDown,
  Building2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useProperties } from "../contexts/PropertiesContext";
import {
  TONE_LABEL,
  computeNegotiationStats,
  buildNegotiationMessage,
  type Tone,
} from "../utils/rentNegotiation";
import { toast } from "sonner";

export const AIRentNegotiatorPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramId = searchParams.get("property");
  const { properties } = useProperties();
  const [selectedId, setSelectedId] = useState<string>(
    paramId || String(properties[0]?.id || "")
  );
  const [tone, setTone] = useState<Tone>("polite");
  const [yourName, setYourName] = useState("Rahul Verma");
  const [extraNote, setExtraNote] = useState("");

  // Honor a deep link like /ai-negotiator?property=ID once listings are loaded,
  // so "Negotiate" actions on the Properties page preselect that listing.
  useEffect(() => {
    if (paramId && properties.some((p) => String(p.id) === paramId)) {
      setSelectedId(paramId);
    }
  }, [paramId, properties]);

  const property = properties.find((p) => String(p.id) === selectedId);

  // Compute locality averages
  const stats = useMemo(() => {
    if (!property) return null;
    const sameLocality = properties.filter((p) => p.locality === property.locality);
    const sameCity = properties.filter((p) => p.city === property.city);
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
    const locAvg = Math.round(avg(sameLocality.map((p) => p.monthlyRent)));
    const cityAvg = Math.round(avg(sameCity.map((p) => p.monthlyRent)));
    const diff = property.monthlyRent - locAvg;
    const diffPct = locAvg > 0 ? Math.round((diff / locAvg) * 100) : 0;
    const suggestedCounter = diff > 0
      ? Math.max(locAvg, Math.round((property.monthlyRent + locAvg) / 2))
      : property.monthlyRent;
    return { locAvg, cityAvg, diff, diffPct, suggestedCounter, sampleSize: sameLocality.length };
  }, [property, properties]);

  // Generate negotiation message
  const message = useMemo(() => {
    if (!property || !stats) return "";
    const over = stats.diff > 0;
    const daysCommitment = 11; // 11-month lock-in is common student/pro offer
    const opener = {
      polite: `Respected ${property.ownerName},`,
      "data-driven": `Hello ${property.ownerName},`,
      friendly: `Hey ${property.ownerName}! 🙏`,
      firm: `Dear ${property.ownerName},`,
    }[tone];

    const context = {
      polite: `Thank you for listing "${property.title}" at ${property.locality}. I am genuinely interested in this accommodation and would like to discuss the monthly rent before finalizing.`,
      "data-driven": `I've analyzed the rental market in ${property.locality} for my interest in "${property.title}".`,
      friendly: `Loved the pics of "${property.title}" in ${property.locality}! I'm a student at GLA and this looks perfect. Wanted to have a quick chat about the rent :)`,
      firm: `Regarding "${property.title}" in ${property.locality}, I would like to formally negotiate the quoted rent.`,
    }[tone];

    const dataLine = over
      ? `The average rent for comparable ${property.accommodationType}s in ${property.locality} is ₹${stats.locAvg.toLocaleString()}/month (across ${stats.sampleSize} active listings). Your asking price of ₹${property.monthlyRent.toLocaleString()} is ${stats.diffPct}% above this benchmark, i.e. ₹${stats.diff.toLocaleString()} higher.`
      : `Your asking rent of ₹${property.monthlyRent.toLocaleString()} is already ₹${Math.abs(stats.diff).toLocaleString()} below the ${property.locality} average (₹${stats.locAvg.toLocaleString()}) — quite fair, and I would still appreciate a small courtesy adjustment.`;

    const ask = `Would you consider a revised monthly rent of ₹${stats.suggestedCounter.toLocaleString()}? In exchange I can offer:
      • Immediate move-in on ${property.availableFrom || "the earliest date"}
      • ${daysCommitment}-month lock-in commitment (zero early exit risk)
      • Full security deposit of ₹${property.securityDeposit.toLocaleString()} paid upfront via bank transfer
      • Zero broker / agent middlemen — direct tenant relationship`;

    const closer = {
      polite: `I would be grateful if you could consider this proposal. Happy to schedule a video call or visit at your convenience.`,
      "data-driven": `Looking forward to your counter-offer by [date]. I have two comparable listings pending decisions.`,
      friendly: `Let me know what works for you! Really excited about the possibility of staying here. 🏠`,
      firm: `Please confirm your revised offer within 48 hours so I can plan accordingly.`,
    }[tone];

    const signature = `\n\nWarm regards,\n${yourName || "Prospective Tenant"}\nRentRight Verified Seeker`;

    return `${opener}\n\n${context}\n\n${dataLine}\n\n${ask}\n\n${closer}${signature}${extraNote ? `\n\n[P.S. ${extraNote}]` : ""}`;
  }, [property, stats, tone, yourName, extraNote]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Negotiation message copied to clipboard!");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const isAbove = stats && stats.diff > 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <HeaderSection />
      <main className="flex-grow pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-semibold uppercase tracking-wider mb-3">
              <Sparkles className="w-3.5 h-3.5" /> AI Innovation
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900">AI Rent Negotiator</h1>
            <p className="text-slate-600 mt-2 text-sm">
              Instantly generate a data-backed, polite negotiation message using locality rent benchmarks.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Config Panel */}
            <Card className="lg:col-span-5 border-slate-200 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1.5">Choose a Listing</label>
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Pick property" /></SelectTrigger>
                    <SelectContent>
                      {properties.slice(0, 30).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)} className="text-xs">
                          ₹{p.monthlyRent.toLocaleString()} · {p.locality} · {p.title.slice(0, 40)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1.5">Your Name</label>
                  <Input value={yourName} onChange={(e) => setYourName(e.target.value)} className="h-9 text-sm" />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1.5">Negotiation Tone</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                      <button key={t} onClick={() => setTone(t)}
                        className={`p-2.5 rounded-xl text-xs font-semibold border transition ${tone === t ? "bg-violet-600 text-white border-violet-600 shadow-sm" : "bg-white text-slate-700 border-slate-200 hover:border-violet-300"}`}>
                        {TONE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1.5">Personal Note (optional)</label>
                  <Textarea value={extraNote} onChange={(e) => setExtraNote(e.target.value)} rows={2} className="text-xs" placeholder="e.g. I can prepay 3 months of rent..." />
                </div>

                {/* Market stats */}
                {property && stats && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-violet-600" /> Market Analysis
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Owner Ask</div>
                        <div className="font-black text-slate-900">₹{property.monthlyRent.toLocaleString()}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">{property.locality} Avg</div>
                        <div className="font-black text-slate-900">₹{stats.locAvg.toLocaleString()}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Sample Size</div>
                        <div className="font-black text-slate-900">{stats.sampleSize} listings</div>
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Recommended Counter</div>
                        <div className="font-black text-emerald-700">₹{stats.suggestedCounter.toLocaleString()}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`w-full justify-center text-[10px] ${isAbove ? "text-rose-700 bg-rose-50 border-rose-200" : "text-emerald-700 bg-emerald-50 border-emerald-200"}`}>
                      {isAbove ? <><AlertCircle className="w-3 h-3 mr-1" /> Asking {stats.diffPct}% above locality average</>
                        : <><CheckCircle2 className="w-3 h-3 mr-1" /> Priced {Math.abs(stats.diffPct)}% below locality average — already fair</>}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generated Message */}
            <Card className="lg:col-span-7 border-slate-200 shadow-md">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 grid place-items-center text-white">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900">RentRight AI Negotiation Draft</div>
                    <div className="text-[10px] text-slate-500 uppercase font-semibold">Message type: {TONE_LABEL[tone]}</div>
                  </div>
                </div>

                {message ? (
                  <>
                    <Textarea value={message} readOnly rows={18} className="text-xs leading-relaxed bg-violet-50/40 border-violet-200" />
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                        <TrendingDown className="w-3 h-3 text-emerald-600" />
                        Potential saving: <span className="font-bold text-emerald-700">₹{Math.max(0, (property?.monthlyRent || 0) - (stats?.suggestedCounter || 0)).toLocaleString()}/month</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleCopy} variant="outline" className="text-xs h-8 gap-1"><Copy className="w-3 h-3" /> Copy</Button>
                        <Button size="sm" onClick={() => { toast.success("Message ready. Open the property page to send enquiry."); navigate(`/property/${property?.id}`); }} className="text-xs h-8 gap-1 bg-violet-600 hover:bg-violet-700 text-white">
                          <Send className="w-3 h-3" /> Use in Enquiry
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic">Select a property to generate negotiation message.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-10 p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950">
            <div className="font-bold flex items-center gap-1.5 mb-1"><MessageSquareCode className="w-4 h-4 text-blue-600" /> Negotiation Science</div>
            <p>Data-backed messages succeed 3x more often than emotional appeals. Anchoring your request against locality averages gives owners a face-saving reason to reduce rent. Adding commitment (11-month lock-in, prepayment, no broker) is the strongest sweetener for students and early-career professionals.</p>
          </div>
        </div>
      </main>
      <FooterSection />
    </div>
  );
};

export default AIRentNegotiatorPage;
