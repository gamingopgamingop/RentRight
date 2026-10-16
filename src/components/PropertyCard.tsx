import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Property, useProperties } from "../contexts/PropertiesContext";
import { Badge } from "@/components/ui/badge";
import { Star, ShieldCheck, Heart, Scale, MapPin, Calendar, Check, Zap, FileCheck, AlertOctagon, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropertyCardProps {
  property: Property;
  featured?: boolean;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, featured = false }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { isComparing, addToCompare, isSaved, toggleSaveProperty, reportProperty } = useProperties();

  const comparing = isComparing(property.id);
  const saved = isSaved(property.id);
  const isAvailable = property.listingStatus === "Available";

  // Expiry Auto-Downgrade detection
  const ageDays = Math.floor((Date.now() - new Date(property.listedDate).getTime()) / 86400000);
  const isStale = ageDays > Math.max(30, property.expiryDays - 15);

  const handleReportOutdated = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    reportProperty(property.id, "Listing Might Be Outdated", `Seeker flagged this listing as potentially expired after ${ageDays} days of inactivity.`);
  };

  const handleImageNav = (direction: "next" | "prev", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (direction === "next") {
      setCurrentImageIndex((prev) =>
        prev === property.images.length - 1 ? 0 : prev + 1
      );
    } else {
      setCurrentImageIndex((prev) =>
        prev === 0 ? property.images.length - 1 : prev - 1
      );
    }
  };

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCompare(property.id);
  };

  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSaveProperty(property.id);
  };

  return (
    <div className={`property-card group bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-xl hover:border-violet-300 transition-all duration-300 flex flex-col justify-between overflow-hidden ${featured ? 'ring-1 ring-violet-500/30' : ''}`}>
      <div>
        {/* Image Container */}
        <div className="relative overflow-hidden aspect-[16/10] bg-slate-100">
          <Link to={`/property/${property.id}`} className="block w-full h-full">
            <img
              src={property.images[currentImageIndex] || "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267"}
              alt={property.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>

          {/* Image navigation arrows */}
          {property.images.length > 1 && (
            <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <button
                type="button"
                onClick={(e) => handleImageNav("prev", e)}
                className="pointer-events-auto bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition text-xs"
              >
                &#10094;
              </button>
              <button
                type="button"
                onClick={(e) => handleImageNav("next", e)}
                className="pointer-events-auto bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition text-xs"
              >
                &#10095;
              </button>
            </div>
          )}

          {/* Top Left Badges: Status & Verification */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
            <div className="flex items-center gap-1.5">
              <Badge className={`${isAvailable ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'} text-[11px] font-semibold px-2 py-0.5 shadow-sm`}>
                {property.listingStatus || "Available"}
              </Badge>

              {property.verificationStatus === "Verified" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] font-semibold flex items-center gap-1 shadow-sm cursor-help">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-xs">
                    <div className="space-y-1">
                      <p className="font-bold flex items-center gap-1">
                        <FileCheck className="w-3 h-3 text-emerald-600" />
                        {property.verificationProof?.documentType || "Physically Verified"}
                      </p>
                      {property.verificationProof?.verifiedDate && (
                        <p>Verified on: {property.verificationProof.verifiedDate}</p>
                      )}
                      {property.verificationProof?.verifiedBy && (
                        <p>By: {property.verificationProof.verifiedBy}</p>
                      )}
                      <p className="text-emerald-400">Owner document proof confirmed</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Badge variant="secondary" className="bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-medium">
                  Owner Claimed
                </Badge>
              )}
            </div>
          </div>

          {/* Top Right Actions: Save Heart & Compare Matrix */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
            <button
              onClick={handleCompareClick}
              title={comparing ? "Remove from comparison" : "Add to comparison"}
              className={`p-1.5 rounded-full transition shadow-md ${
                comparing
                  ? "bg-violet-600 text-white"
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-violet-600"
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleSaveClick}
              title={saved ? "Remove from saved" : "Save property"}
              className={`p-1.5 rounded-full transition shadow-md ${
                saved
                  ? "bg-rose-600 text-white"
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-rose-600"
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${saved ? 'fill-white' : ''}`} />
            </button>
          </div>

          {/* Accommodation Type & Occupancy Banner at Bottom of Image */}
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white text-[11px] font-medium pointer-events-none">
            <span className="bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded text-white">
              {property.accommodationType} • {property.occupancyPreference} Occupancy
            </span>
            {property.billsIncluded && (
              <span className="bg-violet-900/80 backdrop-blur-sm px-2 py-0.5 rounded text-violet-200">
                Food / Bills Included
              </span>
            )}
          </div>
        </div>

        {/* Card Content */}
        <div className="p-4 space-y-2.5">
          {/* Price Header */}
          <div className="flex justify-between items-baseline">
            <div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-slate-900">
                  ₹{(property.monthlyRent || property.price || 0).toLocaleString()}
                </span>
                <span className="text-xs text-slate-500 font-medium">/month</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Deposit: ₹{(property.securityDeposit || property.monthlyRent * 2 || 0).toLocaleString()}
              </div>
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-md border border-amber-200/60">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-xs font-bold text-slate-800">{property.rating || 4.8}</span>
            </div>
          </div>

          {/* Title */}
          <Link to={`/property/${property.id}`} className="block">
            <h3 className="font-bold text-sm text-slate-900 line-clamp-1 hover:text-violet-600 transition">
              {property.title}
            </h3>
          </Link>

          {/* Locality */}
          <div className="flex items-center gap-1 text-slate-600 text-xs line-clamp-1">
            <MapPin className="w-3.5 h-3.5 text-violet-600 shrink-0" />
            <span>{property.locality || property.location?.city || "Bengaluru"}, {property.city}</span>
          </div>

          {/* Key Rental Features */}
          <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
            <div className="truncate">
              <span className="text-slate-400 block text-[10px]">Furnishing</span>
              <span className="font-medium">{property.furnishing?.split(" ")[0]}</span>
            </div>
            <div className="truncate">
              <span className="text-slate-400 block text-[10px]">For</span>
              <span className="font-medium">{property.targetAudience}</span>
            </div>
            <div className="truncate text-right">
              <span className="text-slate-400 block text-[10px]">Metro</span>
              <span className="font-medium">{property.metroDistanceKm ? `${property.metroDistanceKm} km` : "Nearby"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Card Action Footer */}
      <div className="px-4 pb-4 pt-1 flex items-center gap-2">
        <Link to={`/property/${property.id}`} className="w-full">
          <Button size="sm" variant="outline" className="w-full text-xs h-8 border-violet-200 text-violet-700 hover:bg-violet-50">
            View Details & Rules
          </Button>
        </Link>
        <Link to={`/ai-negotiator?property=${property.id}`} className="w-full">
          <Button size="sm" className="w-full text-xs h-8 gap-1 bg-fuchsia-600 hover:bg-fuchsia-700 text-white" onClick={(e) => e.stopPropagation()}>
            <Bot className="w-3.5 h-3.5" /> Negotiate Rent
          </Button>
        </Link>
      </div>

      {/* Expiry Auto-Downgrade banner */}
      {isStale && (
        <div className="mx-4 mb-3 p-2 rounded-lg bg-amber-50 border border-amber-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-900">
            <AlertOctagon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Active {ageDays}d ago – <strong>might be outdated</strong></span>
          </div>
          <Button size="sm" variant="ghost" onClick={handleReportOutdated} className="h-6 text-[10px] px-2 text-amber-800 hover:bg-amber-100 font-bold">
            Report
          </Button>
        </div>
      )}
    </div>
  );
};

export default PropertyCard;
