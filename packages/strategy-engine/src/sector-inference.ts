import type {
  CorporateEvent,
  SectorInference,
  UpstoxFundamentalsSnapshot,
  UpstoxInstrumentProfile,
} from "@tradeai/domain";

interface SectorRule {
  slug: string;
  name: string;
  keywords: readonly string[];
}

const sectorRules: readonly SectorRule[] = [
  { slug: "banking-financial-services", name: "Banking & Financial Services", keywords: ["bank", "finance", "capital", "insurance", "nbfc", "asset management"] },
  { slug: "information-technology", name: "Information Technology", keywords: ["software", "technologies", "systems", "tech", "infotech", "digital"] },
  { slug: "pharmaceuticals-healthcare", name: "Pharmaceuticals & Healthcare", keywords: ["pharma", "laboratories", "health", "hospital", "medical", "lifesciences"] },
  { slug: "energy-oil-gas", name: "Energy, Oil & Gas", keywords: ["energy", "oil", "gas", "petro", "power", "renewable"] },
  { slug: "metals-mining", name: "Metals & Mining", keywords: ["steel", "mining", "aluminium", "copper", "metal"] },
  { slug: "consumer-retail", name: "Consumer & Retail", keywords: ["retail", "consumer", "jewellers", "foods", "beverages", "lifestyle"] },
  { slug: "real-estate-infrastructure", name: "Real Estate & Infrastructure", keywords: ["realty", "real estate", "infra", "infrastructure", "lifespace", "developers"] },
  { slug: "defence-industrials", name: "Defence & Industrials", keywords: ["defence", "shipyard", "aerospace", "industrial", "engineering"] },
  { slug: "automotive", name: "Automotive", keywords: ["motor", "auto", "motors", "vehicles", "automotive"] },
];

const scoreTextAgainstRule = (text: string, rule: SectorRule): number => {
  const normalized = text.toLowerCase();
  return rule.keywords.reduce(
    (score, keyword) => score + (normalized.includes(keyword) ? 1 : 0),
    0,
  );
};

export const inferSectorFromEvidence = (
  profile: UpstoxInstrumentProfile,
  fundamentals?: UpstoxFundamentalsSnapshot,
  events: readonly CorporateEvent[] = [],
): SectorInference => {
  const evidenceTexts = [
    profile.name,
    profile.shortName ?? "",
    ...events.slice(0, 5).flatMap((event) => [event.title, event.description]),
  ];

  const ruleScores = sectorRules.map((rule) => ({
    rule,
    score: evidenceTexts.reduce((sum, text) => sum + scoreTextAgainstRule(text, rule), 0),
  }));

  let best = ruleScores.sort((left, right) => right.score - left.score)[0];

  // Use certain fundamentals as tie-breakers or weak priors.
  if (
    fundamentals &&
    (profile.name.toLowerCase().includes("bank") ||
      fundamentals.fundamentalMetrics.some((metric) =>
        ["Net Interest Margin (NIM)", "Gross NPA", "Net NPA", "CASA"].includes(metric.label),
      ))
  ) {
    best = {
      rule: sectorRules.find((rule) => rule.slug === "banking-financial-services")!,
      score: Math.max(best?.score ?? 0, 2),
    };
  }

  if (!best || best.score <= 0) {
    return {
      slug: "unclassified",
      name: "Unclassified",
      confidence: 0.2,
      evidence: ["No strong sector keywords were found in the currently available profile or event data."],
    };
  }

  const evidence = evidenceTexts
    .filter((text) => scoreTextAgainstRule(text, best.rule) > 0)
    .slice(0, 3)
    .map((text) => `Matched sector keywords in: ${text}`);

  return {
    slug: best.rule.slug,
    name: best.rule.name,
    confidence: Math.min(0.95, 0.35 + best.score * 0.15),
    evidence,
  };
};
