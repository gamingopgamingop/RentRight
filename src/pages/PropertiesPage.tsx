import React, { useEffect, useState } from "react";
import HeaderSection from "../components/HeaderSection";
import FooterSection from "../components/FooterSection";
import FilterBar from "../components/FilterBar";
import PropertyCard from "../components/PropertyCard";
import CompareFloatingBar from "../components/CompareFloatingBar";
import { useProperties, FilterParams } from "../contexts/PropertiesContext";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Building2, ShieldCheck, Scale, Calculator, Bot } from "lucide-react";
import { Link } from "react-router-dom";
import VoiceSearchBar from "../components/VoiceSearchBar";
import { parseVoiceQuery } from "../utils/voiceSearch";
import { toast } from "sonner";

export const PropertiesPage: React.FC = () => {
  const { filteredProperties, filterProperties, loading } = useProperties();
  const [visibleProperties, setVisibleProperties] = useState<number>(9);
  const [isFiltering, setIsFiltering] = useState<boolean>(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleFilter = (filters: FilterParams) => {
    setIsFiltering(true);
    filterProperties(filters);
    setVisibleProperties(9);
    setTimeout(() => {
      setIsFiltering(false);
    }, 300);
  };

  const loadMoreProperties = () => {
    setVisibleProperties((prev) => prev + 6);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <HeaderSection />

      <main className="flex-grow pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-7xl">
          {/* Header */}
          <div className="text-center mb-8 max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-semibold uppercase tracking-wider mb-2">
              <Building2 className="w-3.5 h-3.5" /> Verified Student & Professional Accommodations
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Discover Transparent Rental Housing
            </h1>
            <p className="text-slate-600 mt-2 text-xs sm:text-sm">
              Filter by budget, locality, private room, or PG twin-sharing with complete rent & deposit breakdown.
            </p>
          </div>

          {/* Voice Search Bar */}
          <div className="mb-4 p-3 rounded-xl bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-[10px] uppercase font-bold text-violet-800 tracking-wider">Try Voice Search (Hindi / English)</span>
            </div>
            <VoiceSearchBar
              placeholder="Say: 2 BHK under 15000 Koramangala  ·  या कहें: कोरमंगला में 15000 से कम का मकान"
              onTranscript={(text) => {
                handleFilter(parseVoiceQuery(text));
                toast.success(`Voice query applied: "${text}"`);
              }}
            />
          </div>

          {/* Filter Bar */}
          <FilterBar onFilter={handleFilter} />

          {/* Status & Results Count */}
          <div className="flex items-center justify-between mb-6 text-xs text-slate-500 font-medium">
            <span>
              Showing <strong className="text-slate-900">{Math.min(visibleProperties, filteredProperties.length)}</strong> of <strong className="text-slate-900">{filteredProperties.length}</strong> rental listings
            </span>
            <div className="flex items-center gap-3">
              <Link to="/affordability" className="text-emerald-700 hover:underline flex items-center gap-1 font-semibold">
                <Calculator className="w-3.5 h-3.5" /> 30% Budget Calculator
              </Link>
              <Link to="/compare" className="text-violet-700 hover:underline flex items-center gap-1 font-semibold">
                <Scale className="w-3.5 h-3.5" /> Comparison Matrix
              </Link>
              <Link to="/ai-negotiator" className="text-fuchsia-700 hover:underline flex items-center gap-1 font-semibold">
                <Bot className="w-3.5 h-3.5" /> AI Rent Negotiator
              </Link>
            </div>
          </div>

          {/* Properties Grid */}
          <div className="min-h-[400px]">
            {isFiltering || loading ? (
              <div className="flex flex-col items-center justify-center h-[400px]">
                <Loader2 className="h-10 w-10 text-violet-600 animate-spin mb-3" />
                <p className="text-slate-600 text-sm">Filtering transparent accommodations...</p>
              </div>
            ) : filteredProperties.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <Building2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">No Accommodations Found</h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  No listings matched your exact search filters. Try widening your budget slider or clearing occupancy filters.
                </p>
                <Button
                  onClick={() => handleFilter({})}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
                >
                  Reset All Filters
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProperties.slice(0, visibleProperties).map((property, index) => (
                    <div
                      key={property.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${0.05 * (index % 6)}s` }}
                    >
                      <PropertyCard property={property} />
                    </div>
                  ))}
                </div>

                {visibleProperties < filteredProperties.length && (
                  <div className="text-center mt-12">
                    <Button
                      onClick={loadMoreProperties}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs px-6 h-10 font-medium rounded-xl shadow-sm"
                    >
                      Load More Accommodations
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Floating comparison drawer if any property selected */}
      <CompareFloatingBar />

      <FooterSection />
    </div>
  );
};

export default PropertiesPage;
