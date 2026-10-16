import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useProperties, Property, TenantReview } from "../contexts/PropertiesContext";
import { useAuth } from "../contexts/AuthContext";
import HeaderSection from "../components/HeaderSection";
import FooterSection from "../components/FooterSection";
import EnquiryModal from "../components/EnquiryModal";
import ReportListingModal from "../components/ReportListingModal";
import CompareFloatingBar from "../components/CompareFloatingBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  ShieldCheck,
  Star,
  Scale,
  Heart,
  Calendar,
  Clock,
  Home,
  Check,
  Info,
  Lock,
  Flag,
  Share2,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Utensils,
  Zap,
  Sparkles,
  Building2,
  AlertTriangle,
  FileCheck,
  PhoneOff,
  MessageSquareQuote,
  ThumbsUp,
  Wallet,
  Plus,
  ShieldAlert,
  Bot,
  Copy,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  TONE_LABEL,
  computeNegotiationStats,
  buildNegotiationMessage,
  type Tone,
} from "../utils/rentNegotiation";

export const PropertyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    getPropertyById,
    addToCompare,
    isComparing,
    isSaved,
    toggleSaveProperty,
    addBooking,
    getReviewsForProperty,
    addReview,
    markReviewHelpful,
    reviews,
    properties
  } = useProperties();
  const { isAuthenticated, user } = useAuth();

  const property = getPropertyById(Number(id));

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [scheduleVisitOpen, setScheduleVisitOpen] = useState(false);

  // Inline AI Rent Negotiator (shared logic with property cards & /ai-negotiator)
  const [negOpen, setNegOpen] = useState(false);
  const [negTone, setNegTone] = useState<Tone>("polite");
  const [counterStr, setCounterStr] = useState("");
  const [enquiryDraft, setEnquiryDraft] = useState<string | undefined>(undefined);

  const negStats = useMemo(
    () => computeNegotiationStats(property, properties),
    [property, properties]
  );

  const negMessage = useMemo(() => {
    if (!property || !negStats) return "";
    const counter = Number(counterStr);
    return buildNegotiationMessage({
      property,
      stats: negStats,
      tone: negTone,
      yourName: user?.name || "Prospective Tenant",
      counterRent: counter > 0 ? counter : undefined,
    });
  }, [property, negStats, negTone, counterStr, user]);

  const handleNegotiateCopy = async () => {
    try {
      await navigator.clipboard.writeText(negMessage);
      toast.success("Negotiation message copied!");
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const handleUseInEnquiry = () => {
    setEnquiryDraft(negMessage);
    setEnquiryOpen(true);
  };

  // Visit booking state
  const [visitDate, setVisitDate] = useState<Date | undefined>(new Date());
  const [visitTimeSlot, setVisitTimeSlot] = useState("11:00 AM");
  const [visitType, setVisitType] = useState<"in-person" | "virtual">("in-person");
  const [visitNotes, setVisitNotes] = useState("");

  // Tenant review state
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newReview, setNewReview] = useState({
    tenantName: "",
    rating: 5,
    depositReturned: "Full" as TenantReview["depositReturned"],
    title: "",
    comment: "",
    movedOut: "2026-09",
    cleanliness: 5,
    safety: 5,
    ownerBehavior: 5,
    valueForMoney: 5,
  });

  const propertyReviews = useMemo(
    () => (property ? getReviewsForProperty(property.id) : []),
    [property, reviews, getReviewsForProperty]
  );

  const avgDimension = (dim: keyof TenantReview["dimensions"]) => {
    if (propertyReviews.length === 0) return 0;
    return Math.round((propertyReviews.reduce((s, r) => s + r.dimensions[dim], 0) / propertyReviews.length) * 10) / 10;
  };

  const submitReview = () => {
    if (!property) return;
    if (!newReview.tenantName.trim() || !newReview.title.trim() || !newReview.comment.trim()) {
      toast.error("Please fill in name, headline, and comment");
      return;
    }
    addReview({
      propertyId: property.id,
      tenantName: newReview.tenantName,
      rating: newReview.rating,
      depositReturned: newReview.depositReturned,
      title: newReview.title,
      comment: newReview.comment,
      movedOut: newReview.movedOut,
      dimensions: {
        cleanliness: newReview.cleanliness,
        safety: newReview.safety,
        ownerBehavior: newReview.ownerBehavior,
        valueForMoney: newReview.valueForMoney,
      },
    });
    setShowReviewForm(false);
    setNewReview({ ...newReview, tenantName: "", title: "", comment: "" });
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (!property) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <HeaderSection />
        <main className="flex-grow pt-32 pb-16 flex items-center justify-center">
          <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Accommodation Not Found</h1>
            <p className="text-xs text-slate-500 mb-6">
              The rental property you are looking for may have been archived or rented out.
            </p>
            <Link to="/properties">
              <Button className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
                Browse Active Rentals
              </Button>
            </Link>
          </div>
        </main>
        <FooterSection />
      </div>
    );
  }

  const comparing = isComparing(property.id);
  const saved = isSaved(property.id);
  const isAvailable = property.listingStatus === "Available";

  const handleConfirmVisit = () => {
    if (!visitDate) {
      toast.error("Please pick a date for your visit");
      return;
    }

    addBooking({
      userId: user?.id || 1,
      propertyId: property.id,
      propertyTitle: property.title,
      date: visitDate.toISOString().split("T")[0],
      timeSlot: visitTimeSlot,
      visitType,
      status: "pending",
      seekerName: user?.name || "Seeker Rahul",
      notes: visitNotes || `Scheduled ${visitType} tour via RentRight`
    });

    setScheduleVisitOpen(false);
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Property link copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <HeaderSection />

      <main className="flex-grow pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Breadcrumb & Top Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link to="/properties" className="hover:text-violet-600 font-medium">Accommodations</Link>
              <span>/</span>
              <span>{property.locality}</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold truncate max-w-xs">{property.title}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addToCompare(property.id)}
                className={`text-xs h-8 gap-1.5 ${comparing ? "bg-violet-50 text-violet-700 border-violet-300" : ""}`}
              >
                <Scale className="w-3.5 h-3.5" />
                {comparing ? "Comparing" : "Add to Compare"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSaveProperty(property.id)}
                className={`text-xs h-8 gap-1.5 ${saved ? "text-rose-600 bg-rose-50 border-rose-300" : ""}`}
              >
                <Heart className={`w-3.5 h-3.5 ${saved ? "fill-rose-600" : ""}`} />
                {saved ? "Saved" : "Save"}
              </Button>

              <Button variant="outline" size="sm" onClick={handleShare} className="text-xs h-8 px-2.5">
                <Share2 className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReportOpen(true)}
                className="text-xs h-8 text-rose-600 hover:bg-rose-50 gap-1 px-2"
                title="Report Suspicious or Outdated Listing"
              >
                <Flag className="w-3.5 h-3.5" /> Report
              </Button>
            </div>
          </div>

          {/* Photo Gallery Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-8 rounded-2xl overflow-hidden bg-slate-900 p-1">
            <div className="md:col-span-8 relative aspect-[16/10] bg-slate-950 overflow-hidden rounded-xl">
              <img
                src={property.images[activeImageIndex] || property.images[0]}
                alt={property.title}
                className="w-full h-full object-cover"
              />

              {/* Status and Verified Badges */}
              <div className="absolute top-3 left-3 flex gap-2">
                <Badge className={`${isAvailable ? "bg-emerald-600" : "bg-slate-700"} text-white text-xs`}>
                  {property.listingStatus}
                </Badge>
                {property.verificationStatus === "Verified" ? (
                  <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> {property.verificationProof?.documentType || "Physically Verified"}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-rose-100 text-rose-800 border border-rose-300 text-xs font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Unverified Owner Claim
                  </Badge>
                )}
              </div>
            </div>

            <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-1 gap-2">
              {property.images.map((img, idx) => (
                <div
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`aspect-[16/9] rounded-xl overflow-hidden cursor-pointer border-2 transition ${
                    activeImageIndex === idx ? "border-violet-500 shadow-md" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>

          {/* Main 2-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Details, Facilities, Rules, AI Insight */}
            <div className="lg:col-span-8 space-y-6">
              {/* Title & Key Highlights Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-violet-50 text-violet-800 text-xs font-bold">
                      {property.accommodationType}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
                      {property.occupancyPreference} Occupancy
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
                      {property.furnishing}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-bold text-slate-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/60">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span>{property.rating} Rating</span>
                  </div>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-snug">
                  {property.title}
                </h1>

                <div className="flex items-center gap-2 text-slate-600 text-xs sm:text-sm">
                  <MapPin className="w-4 h-4 text-violet-600 shrink-0" />
                  <span>{property.address}, {property.locality}, {property.city}</span>
                </div>

                {/* Quick specs grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Available From</span>
                    <span className="font-semibold text-slate-800">{property.availableFrom || "Immediate"}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Tenant</span>
                    <span className="font-semibold text-slate-800">{property.targetAudience}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Nearest Metro</span>
                    <span className="font-semibold text-slate-800">{property.metroDistanceKm ? `${property.metroDistanceKm} km` : "Nearby"}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Room Size</span>
                    <span className="font-semibold text-slate-800">{property.area || 220} sq ft</span>
                  </div>
                </div>
              </div>

              {/* Tabs: Overview, Facilities, Rules, Location */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
                <Tabs defaultValue="overview" className="space-y-6">
                  <TabsList className="bg-slate-100 p-1 rounded-xl">
                    <TabsTrigger value="overview" className="text-xs">Overview & Living</TabsTrigger>
                    <TabsTrigger value="amenities" className="text-xs">Amenities & Food</TabsTrigger>
                    <TabsTrigger value="rules" className="text-xs">House Rules & Curfew</TabsTrigger>
                    <TabsTrigger value="transparency" className="text-xs">Fair Tenancy Notice</TabsTrigger>
                  </TabsList>

                  {/* Overview */}
                  <TabsContent value="overview" className="space-y-4 text-xs text-slate-700 leading-relaxed">
                    <h3 className="text-base font-bold text-slate-900">About this Accommodation</h3>
                    <p>{property.description}</p>

                    <div className="p-4 rounded-xl bg-violet-50/70 border border-violet-100 flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-violet-900 text-xs">RentRight Tenant Transparency Note</h4>
                        <p className="text-[11px] text-violet-800 mt-1">
                          This accommodation has been vetted for student and early-career professional residency. All utilities, maintenance charges, and sub-meter policies are declared upfront with zero hidden broker commissions.
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Amenities */}
                  <TabsContent value="amenities" className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Included Amenities & Services</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {property.amenities.map((amenity, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-semibold text-slate-800">{amenity}</span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  {/* House Rules */}
                  <TabsContent value="rules" className="space-y-4">
                    <h3 className="text-base font-bold text-slate-900">Community & House Guidelines</h3>
                    <div className="space-y-2 text-xs">
                      {property.houseRules && property.houseRules.length > 0 ? (
                        property.houseRules.map((rule, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-600 mt-1.5 shrink-0" />
                            <span>{rule}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500">Standard quiet community guidelines apply after 10:30 PM.</p>
                      )}
                    </div>
                  </TabsContent>

                  {/* Fair Tenancy Notice */}
                  <TabsContent value="transparency" className="space-y-4 text-xs leading-relaxed text-slate-600">
                    <h3 className="text-base font-bold text-slate-900">RentRight Non-Discrimination Tenancy Clause</h3>
                    <p>
                      In adherence to RentRight's Fair Tenancy Charter and constitutional principles, this accommodation operates under strict zero-discrimination standards:
                    </p>
                    <ul className="list-disc list-inside space-y-1.5 text-slate-700 font-medium">
                      <li>No applicant may be rejected based on caste, religion, food habit, or gender identity.</li>
                      <li>Security deposits must be refunded in full within 7 business days of vacating, subject only to actual utility dues and standard agreed paint deductions.</li>
                      <li>Tenant private phone numbers are never publicly disclosed without written consent.</li>
                    </ul>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* Right Column: Pricing Breakdown & Action Sticky Card */}
            <div className="lg:col-span-4 space-y-5 sticky top-24">
              <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-lg space-y-5">
                {/* Rent & Deposit Box */}
                <div className="pb-4 border-b border-slate-100">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900">
                      ₹{property.monthlyRent?.toLocaleString()}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">/month</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Security Deposit: <strong>₹{property.securityDeposit?.toLocaleString()}</strong>
                  </div>
                </div>

                {/* Move-in Cost Estimator */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>1st Month Rent:</span>
                    <span>₹{property.monthlyRent?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Refundable Deposit:</span>
                    <span>₹{property.securityDeposit?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Maintenance & Care:</span>
                    <span>{property.maintenance ? `₹${property.maintenance}` : "₹0 (Included)"}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-slate-900 text-sm">
                    <span>Total Move-in Cost:</span>
                    <span className="text-violet-700">
                      ₹{(property.monthlyRent + property.securityDeposit + (property.maintenance || 0)).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* CTA Buttons */}
                <div className="space-y-2.5 pt-2">
                  <Button
                    onClick={() => { setEnquiryDraft(undefined); setEnquiryOpen(true); }}
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-5 text-sm shadow-md gap-2"
                  >
                    Send Rental Enquiry
                  </Button>

                  <Button
                    onClick={() => setScheduleVisitOpen(true)}
                    variant="outline"
                    className="w-full border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold py-5 text-xs gap-2"
                  >
                    <Calendar className="w-4 h-4 text-violet-600" />
                    Schedule Property Viewing
                  </Button>
                </div>

                {/* Inline AI Rent Negotiator */}
                <div className="pt-1">
                  <Button
                    onClick={() => setNegOpen((v) => !v)}
                    variant="outline"
                    className="w-full border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 font-semibold py-4 text-xs gap-2"
                  >
                    <Bot className="w-4 h-4" />
                    {negOpen ? "Hide Negotiator" : "Negotiate Rent with AI"}
                  </Button>

                  {negOpen && negStats && (
                    <div className="mt-2 p-3 rounded-xl bg-fuchsia-50/70 border border-fuchsia-200 space-y-2.5 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-800">AI Rent Negotiator</span>
                        <span className="text-[10px] text-slate-500">{property.locality} avg ₹{negStats.locAvg.toLocaleString()}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {(Object.keys(TONE_LABEL) as Tone[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setNegTone(t)}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold border transition ${negTone === t ? "bg-fuchsia-600 text-white border-fuchsia-600" : "bg-white text-slate-700 border-slate-200 hover:border-fuchsia-300"}`}
                          >
                            {TONE_LABEL[t]}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-slate-600 shrink-0">Your offer</label>
                        <div className="relative flex-1">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">₹</span>
                          <Input
                            inputMode="numeric"
                            value={counterStr}
                            placeholder={String(negStats.suggestedCounter)}
                            onChange={(e) => setCounterStr(e.target.value.replace(/[^0-9]/g, ""))}
                            className="h-8 text-xs pl-5"
                          />
                        </div>
                      </div>

                      <Textarea readOnly value={negMessage} rows={8} className="text-[11px] leading-relaxed bg-white border-fuchsia-200" />

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">
                          Recommended: <strong className="text-emerald-700">₹{negStats.suggestedCounter.toLocaleString()}</strong>
                        </span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={handleNegotiateCopy} className="text-[11px] h-7 gap-1 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50">
                            <Copy className="w-3 h-3" /> Copy
                          </Button>
                          <Button size="sm" onClick={handleUseInEnquiry} className="text-[11px] h-7 bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
                            Use in Enquiry
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Safe Contact Privacy Box */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-[11px] text-slate-600">
                  <div className="flex items-start gap-2.5">
                    <PhoneOff className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-800">Safe Contact System:</span> Owner's phone number is never publicly shown. Send an in-app enquiry &rarr; Owner accepts &rarr; Contact is revealed both ways. Your privacy is protected.
                    </div>
                  </div>
                </div>

                {/* Verification Proof Detail */}
                {property.verificationStatus === "Verified" && property.verificationProof ? (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5 text-[11px]">
                    <div className="font-bold text-emerald-800 flex items-center gap-1.5 text-xs">
                      <FileCheck className="w-4 h-4 text-emerald-600" /> Verification Proof On File
                    </div>
                    <div className="text-emerald-700 space-y-0.5">
                      <div><span className="font-semibold">Document:</span> {property.verificationProof.documentType}</div>
                      <div><span className="font-semibold">Verified:</span> {property.verificationProof.verifiedDate}</div>
                      <div><span className="font-semibold">By:</span> {property.verificationProof.verifiedBy}</div>
                      {property.verificationProof.proofNotes && (
                        <div className="italic text-emerald-600 pt-0.5">{property.verificationProof.proofNotes}</div>
                      )}
                    </div>
                  </div>
                ) : property.verificationStatus !== "Verified" ? (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-rose-800">Unverified Listing:</span> Owner has not uploaded ownership proof or electricity bill. Exercise caution and insist on physical document verification before paying any deposit.
                    </div>
                  </div>
                ) : null}

                {/* Owner Info Snippet */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{property.ownerName}</div>
                    <div className="text-[10px] text-slate-400">{property.ownerResponseTime || "Replies quickly"}</div>
                  </div>
                  {property.verificationStatus === "Verified" ? (
                    <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 bg-emerald-50 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Verified Host
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-300 bg-rose-50">
                      Unverified
                    </Badge>
                  )}
                </div>
              </div>

              {/* Innovation Shortcut Widget */}
              <div className="p-4 rounded-xl bg-violet-50 border border-violet-200 text-xs space-y-2">
                <div className="font-bold text-violet-900 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-violet-600" /> Compare with other PGs?
                </div>
                <p className="text-[11px] text-violet-800">
                  Select 2-3 accommodations and view pricing, WiFi speed, and deposit side-by-side.
                </p>
                <Link to="/compare" className="text-violet-700 font-bold hover:underline inline-block text-[11px]">
                  Open Comparison Matrix →
                </Link>
              </div>
            </div>
          </div>

          {/* Tenant Reviews Section */}
          {property && (
            <div className="mt-8 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <MessageSquareQuote className="w-5 h-5 text-violet-600" />
                  Tenant Reviews & Deposit Refund History
                  <Badge variant="outline" className="text-[10px] ml-1">{propertyReviews.length} review{propertyReviews.length !== 1 ? "s" : ""}</Badge>
                </h2>
                <Button size="sm" onClick={() => setShowReviewForm(!showReviewForm)} className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-8 gap-1">
                  <Plus className="w-3.5 h-3.5" /> {showReviewForm ? "Close" : "Write Review"}
                </Button>
              </div>

              {showReviewForm && (
                <div className="mb-5 p-4 rounded-xl bg-violet-50 border border-violet-200 space-y-3 animate-fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input placeholder="Your name" value={newReview.tenantName} onChange={(e) => setNewReview({ ...newReview, tenantName: e.target.value })} className="h-8 text-xs" />
                    <Input type="month" value={newReview.movedOut} onChange={(e) => setNewReview({ ...newReview, movedOut: e.target.value })} className="h-8 text-xs" />
                    <select value={newReview.depositReturned} onChange={(e) => setNewReview({ ...newReview, depositReturned: e.target.value as any })} className="h-8 rounded-md border border-input bg-white px-2 text-xs">
                      <option value="Full">Deposit: Full refund</option>
                      <option value="Partial">Deposit: Partial</option>
                      <option value="Not Yet">Deposit: Not yet returned</option>
                      <option value="Refused">Deposit: REFUSED (warning)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Overall Rating: {newReview.rating}★</label>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map((n) => (
                        <button key={n} onClick={() => setNewReview({ ...newReview, rating: n })} className="p-1">
                          <Star className={`w-5 h-5 ${n <= newReview.rating ? "text-amber-500 fill-amber-500" : "text-slate-300"}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["cleanliness","safety","ownerBehavior","valueForMoney"] as const).map((dim) => (
                      <div key={dim}>
                        <label className="text-[9px] uppercase font-bold text-slate-500 block mb-0.5">{dim.replace(/([A-Z])/g, " $1")}</label>
                        <select value={newReview[dim]} onChange={(e) => setNewReview({ ...newReview, [dim]: Number(e.target.value) })} className="h-7 rounded-md border border-input bg-white px-1.5 text-[11px] w-full">
                          {[5,4,3,2,1].map((v) => <option key={v} value={v}>{v}★</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <Input placeholder="Review headline (e.g. Owner refunded full deposit in 12 days)" value={newReview.title} onChange={(e) => setNewReview({ ...newReview, title: e.target.value })} className="h-8 text-xs" />
                  <Textarea rows={3} placeholder="Share your experience - maintenance response, deposit refund, safety, neighbors…" value={newReview.comment} onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })} className="text-xs" />
                  <div className="flex justify-end">
                    <Button size="sm" onClick={submitReview} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">Submit Review</Button>
                  </div>
                </div>
              )}

              {propertyReviews.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No tenant reviews yet. Be the first to review this property after moving out.</p>
              ) : (
                <>
                  {/* Aggregate dimension bars */}
                  <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px]">
                    {(["cleanliness","safety","ownerBehavior","valueForMoney"] as const).map((dim) => {
                      const val = avgDimension(dim);
                      return (
                        <div key={dim} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                          <div className="uppercase font-bold text-slate-500 mb-1">{dim.replace(/([A-Z])/g, " $1")}</div>
                          <div className="flex items-center gap-1.5">
                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-600 rounded-full" style={{ width: `${(val / 5) * 100}%` }} />
                            </div>
                            <span className="font-black text-slate-800">{val}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-3">
                    {propertyReviews.map((r) => (
                      <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                        <div className="flex items-start justify-between gap-2 flex-wrap mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-violet-600 text-white grid place-items-center text-xs font-bold">{r.tenantName[0]}</div>
                            <div>
                              <div className="font-bold text-xs text-slate-900">{r.tenantName}</div>
                              <div className="text-[9px] text-slate-500">Moved out {r.movedOut} · {r.createdAt}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {[1,2,3,4,5].map((n) => <Star key={n} className={`w-3 h-3 ${n <= r.rating ? "text-amber-500 fill-amber-500" : "text-slate-300"}`} />)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <Badge variant="outline" className={`text-[9px] ${
                            r.depositReturned === "Full" ? "text-emerald-700 border-emerald-300 bg-emerald-50" :
                            r.depositReturned === "Partial" ? "text-amber-700 border-amber-300 bg-amber-50" :
                            r.depositReturned === "Refused" ? "text-rose-700 border-rose-300 bg-rose-50" :
                            "text-slate-700 border-slate-300 bg-slate-50"
                          }`}>
                            <Wallet className="w-2.5 h-2.5 mr-1" /> Deposit: {r.depositReturned}
                          </Badge>
                        </div>
                        <div className="font-bold text-xs text-slate-900">{r.title}</div>
                        <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">{r.comment}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                          <div className="text-[10px] text-slate-500">
                            Clean {r.dimensions.cleanliness}★ · Safe {r.dimensions.safety}★ · Owner {r.dimensions.ownerBehavior}★ · Value {r.dimensions.valueForMoney}★
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => markReviewHelpful(r.id)} className="h-6 text-[10px] gap-1 text-slate-600 hover:text-violet-700">
                            <ThumbsUp className="w-3 h-3" /> Helpful ({r.helpfulCount})
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Enquiry Modal */}
      <EnquiryModal
        property={property}
        isOpen={enquiryOpen}
        onClose={() => setEnquiryOpen(false)}
        initialMessage={enquiryDraft}
      />

      {/* Report Modal */}
      <ReportListingModal
        property={property}
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {/* Schedule Visit Modal */}
      <Dialog open={scheduleVisitOpen} onOpenChange={setScheduleVisitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Schedule Property Tour</DialogTitle>
            <DialogDescription className="text-xs">
              Book an in-person or virtual tour of {property.title} with the landlord.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Select Date *</label>
              <CalendarComponent
                mode="single"
                selected={visitDate}
                onSelect={setVisitDate}
                disabled={(date) => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  return date < today;
                }}
                className="rounded-lg border border-slate-200 mx-auto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Preferred Time Slot</label>
                <select
                  value={visitTimeSlot}
                  onChange={(e) => setVisitTimeSlot(e.target.value)}
                  className="w-full rounded-md border border-input p-2 text-xs"
                >
                  <option value="10:00 AM">10:00 AM (Morning)</option>
                  <option value="11:30 AM">11:30 AM (Morning)</option>
                  <option value="02:30 PM">02:30 PM (Afternoon)</option>
                  <option value="05:00 PM">05:00 PM (Evening)</option>
                  <option value="06:30 PM">06:30 PM (Evening)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tour Format</label>
                <select
                  value={visitType}
                  onChange={(e) => setVisitType(e.target.value as any)}
                  className="w-full rounded-md border border-input p-2 text-xs"
                >
                  <option value="in-person">In-Person Visit</option>
                  <option value="virtual">Virtual Video Tour</option>
                </select>
              </div>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Special Notes / Questions</label>
              <input
                type="text"
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                placeholder="e.g. Would like to inspect water pressure & WiFi speed"
                className="w-full rounded-md border border-input p-2 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setScheduleVisitOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmVisit} className="bg-violet-600 hover:bg-violet-700 text-white">
              Confirm Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating comparison drawer */}
      <CompareFloatingBar />

      <FooterSection />
    </div>
  );
};

export default PropertyDetailPage;
