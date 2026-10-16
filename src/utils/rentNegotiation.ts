import type { Property } from "../contexts/PropertiesContext";

/**
 * Shared, framework-free logic behind the AI Rent Negotiator. Used by both the
 * full /ai-negotiator page and the inline negotiator on each property card, so
 * the locality benchmark math and the drafted message stay identical everywhere.
 */

export type Tone = "polite" | "data-driven" | "friendly" | "firm";

export const TONE_LABEL: Record<Tone, string> = {
  polite: "Polite & Respectful",
  "data-driven": "Data-Driven & Direct",
  friendly: "Friendly Student Vibe",
  firm: "Firm but Fair",
};

export interface NegotiationStats {
  locAvg: number;
  cityAvg: number;
  diff: number;
  diffPct: number;
  suggestedCounter: number;
  sampleSize: number;
}

/** Compute locality/city rent averages and a recommended counter-offer. */
export function computeNegotiationStats(
  property: Property | undefined,
  allProperties: Property[]
): NegotiationStats | null {
  if (!property) return null;
  const sameLocality = allProperties.filter((p) => p.locality === property.locality);
  const sameCity = allProperties.filter((p) => p.city === property.city);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const locAvg = Math.round(avg(sameLocality.map((p) => p.monthlyRent)));
  const cityAvg = Math.round(avg(sameCity.map((p) => p.monthlyRent)));
  const diff = property.monthlyRent - locAvg;
  const diffPct = locAvg > 0 ? Math.round((diff / locAvg) * 100) : 0;
  const suggestedCounter =
    diff > 0
      ? Math.max(locAvg, Math.round((property.monthlyRent + locAvg) / 2))
      : property.monthlyRent;
  return { locAvg, cityAvg, diff, diffPct, suggestedCounter, sampleSize: sameLocality.length };
}

/**
 * Build the data-backed negotiation message. `counterRent` lets the seeker tune
 * the offer; when omitted (or non-positive) the recommended counter is used.
 */
export function buildNegotiationMessage(params: {
  property: Property;
  stats: NegotiationStats;
  tone: Tone;
  yourName?: string;
  extraNote?: string;
  counterRent?: number;
}): string {
  const { property, stats, tone, extraNote } = params;
  const yourName = params.yourName?.trim() || "Prospective Tenant";
  const counter =
    params.counterRent && params.counterRent > 0 ? params.counterRent : stats.suggestedCounter;

  const over = stats.diff > 0;
  const daysCommitment = 11; // 11-month lock-in is a common student/pro offer

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
    : `Your asking rent of ₹${property.monthlyRent.toLocaleString()} is already ₹${Math.abs(
        stats.diff
      ).toLocaleString()} below the ${property.locality} average (₹${
        stats.locAvg
      }) — quite fair, and I would still appreciate a small courtesy adjustment.`;

  const ask = `Would you consider a revised monthly rent of ₹${counter.toLocaleString()}? In exchange I can offer:
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

  const signature = `\n\nWarm regards,\n${yourName}\nRentRight Verified Seeker`;

  return `${opener}\n\n${context}\n\n${dataLine}\n\n${ask}\n\n${closer}${signature}${
    extraNote ? `\n\n[P.S. ${extraNote}]` : ""
  }`;
}
