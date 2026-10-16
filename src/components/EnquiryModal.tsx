import React, { useEffect, useState } from "react";
import { Property, useProperties } from "../contexts/PropertiesContext";
import { useAuth } from "../contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldCheck, Lock, Send, CheckCircle2, PhoneOff, Eye } from "lucide-react";
import { toast } from "sonner";

interface EnquiryModalProps {
  property: Property;
  isOpen: boolean;
  onClose: () => void;
  /** Optional pre-filled message (e.g. an AI-negotiation draft) applied on open. */
  initialMessage?: string;
}

export const EnquiryModal: React.FC<EnquiryModalProps> = ({
  property,
  isOpen,
  onClose,
  initialMessage,
}) => {
  const { user } = useAuth();
  const { addEnquiry } = useProperties();

  const [name, setName] = useState(user?.name || "Rahul Verma");
  const [email, setEmail] = useState(user?.email || "rahul.seeker@example.com");
  const [phone, setPhone] = useState(user?.phone || "+91 98765 43210");
  const [shareContactPermission, setShareContactPermission] = useState(false);
  const [moveInDate, setMoveInDate] = useState(property.availableFrom || "2026-11-01");
  const [stayDuration, setStayDuration] = useState(6);
  const [occupantType, setOccupantType] = useState<"Student" | "Working Professional" | "Other">(
    user?.occupation?.toLowerCase().includes("student") ? "Student" : "Working Professional"
  );
  const [message, setMessage] = useState(
    initialMessage ||
      `Hi ${property.ownerName}, I am interested in your ${property.accommodationType} at ${property.locality}. Could you please confirm if room availability is open for move-in around ${property.availableFrom}?`
  );
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  // When opened with a drafted message (e.g. from the inline negotiator), seed
  // it so the seeker sends exactly what they reviewed. Ordinary enquiries
  // (no initialMessage) keep their current text.
  useEffect(() => {
    if (isOpen && initialMessage) setMessage(initialMessage);
  }, [isOpen, initialMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !moveInDate) {
      toast.error("Please fill in all mandatory fields");
      return;
    }

    const refId = addEnquiry({
      propertyId: property.id,
      propertyTitle: property.title,
      ownerId: property.ownerId,
      seekerId: user?.id,
      seekerName: name,
      seekerEmail: email,
      seekerPhone: phone,
      shareContactPermission,
      moveInDate,
      stayDurationMonths: Number(stayDuration),
      occupantType,
      message,
    });

    setSubmittedId(refId);
  };

  const handleResetAndClose = () => {
    setSubmittedId(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleResetAndClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {submittedId ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <DialogTitle className="text-2xl font-bold text-slate-900">
              Enquiry Transmitted Securely!
            </DialogTitle>
            <div className="inline-block px-3 py-1 bg-violet-100 text-violet-800 font-mono text-sm font-semibold rounded-full">
              Reference #{submittedId}
            </div>
            <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
              Your inquiry has been relayed to <span className="font-semibold text-slate-900">{property.ownerName}</span>.
              <span className="block mt-1.5 text-xs text-violet-700 font-medium">Your phone number is stored securely but <strong>remains hidden</strong> until the owner explicitly accepts your enquiry. Once accepted, you can choose to reveal contact details both ways.</span>
            </p>
            <div className="pt-4">
              <Button onClick={handleResetAndClose} className="bg-violet-600 hover:bg-violet-700 text-white w-full">
                Done & View Dashboard
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-violet-100 text-violet-800">
                  {property.accommodationType} • {property.occupancyPreference} Occupancy
                </span>
                {property.verificationStatus === "Verified" ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Verified Listing
                  </span>
                ) : (
                  <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded">
                    Owner Claimed
                  </span>
                )}
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 line-clamp-1">
                Contact & Enquiry: {property.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                ₹{property.monthlyRent?.toLocaleString()}/month • Security Deposit: ₹{property.securityDeposit?.toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {/* Safe Contact Privacy Banner */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5 text-xs text-slate-600">
              <PhoneOff className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900">Safe Contact System:</span> Your phone number is never shown to the owner publicly. After you send this enquiry, the owner must <strong>Accept</strong> it first. Only then does your contact get revealed. This protects you from spam calls and unsolicited messages.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="enq-name" className="text-xs font-medium text-slate-700">Your Full Name *</Label>
                <Input
                  id="enq-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  required
                />
              </div>
              <div>
                <Label htmlFor="enq-email" className="text-xs font-medium text-slate-700">Your Email *</Label>
                <Input
                  id="enq-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="enq-phone" className="text-xs font-medium text-slate-700">Phone Number</Label>
                <Input
                  id="enq-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91..."
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="enq-date" className="text-xs font-medium text-slate-700">Move-in Date *</Label>
                <Input
                  id="enq-date"
                  type="date"
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  required
                />
              </div>
              <div>
                <Label htmlFor="enq-duration" className="text-xs font-medium text-slate-700">Stay Duration</Label>
                <select
                  id="enq-duration"
                  value={stayDuration}
                  onChange={(e) => setStayDuration(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value={1}>1 Month</option>
                  <option value={3}>3 Months</option>
                  <option value={6}>6 Months</option>
                  <option value={11}>11 Months</option>
                  <option value={12}>1+ Year</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium text-slate-700">Profile / Occupation</Label>
              <div className="flex gap-4 mt-1.5 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="occupantType"
                    checked={occupantType === "Student"}
                    onChange={() => setOccupantType("Student")}
                    className="accent-violet-600"
                  />
                  <span>Student (College/Intern)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="occupantType"
                    checked={occupantType === "Working Professional"}
                    onChange={() => setOccupantType("Working Professional")}
                    className="accent-violet-600"
                  />
                  <span>Working Professional</span>
                </label>
              </div>
            </div>

            <div>
              <Label htmlFor="enq-message" className="text-xs font-medium text-slate-700">Message to Owner / Questions</Label>
              <Textarea
                id="enq-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="mt-1 text-sm"
                placeholder="Ask about meal timings, gate curfew, vehicle parking, sub-meter rates..."
              />
            </div>

            {/* Permission Checkbox for early contact sharing */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-violet-50/60 border border-violet-100">
              <Checkbox
                id="shareContact"
                checked={shareContactPermission}
                onCheckedChange={(checked) => setShareContactPermission(Boolean(checked))}
                className="mt-0.5 data-[state=checked]:bg-violet-600"
              />
              <label htmlFor="shareContact" className="text-xs text-slate-700 leading-normal cursor-pointer">
                <span className="font-medium text-slate-900 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Optional: Accelerate contact sharing
                </span>
                <span className="text-[11px] text-slate-600 mt-0.5 block">Check this to authorize the owner to see your phone number <strong>immediately upon accepting</strong> (skip the reveal step). Leave unchecked for full privacy control.</span>
              </label>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={handleResetAndClose}>
                Cancel
              </Button>
              <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5">
                <Send className="w-3.5 h-3.5" /> Send Enquiry Request
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EnquiryModal;
