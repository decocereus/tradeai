import type { InstrumentSnapshot, ScoreBreakdown, SectorSnapshot } from "@tradeai/domain";

const clampScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const toLabel = (score: number): ScoreBreakdown["label"] => {
  if (score >= 80) return "favored";
  if (score >= 60) return "research_further";
  if (score >= 40) return "watch";
  return "avoid";
};

export const scoreSector = (sector: SectorSnapshot): ScoreBreakdown => {
  const total = clampScore(
    sector.macroTailwind * 0.2 +
      sector.policySupport * 0.2 +
      sector.geopoliticalEffect * 0.15 +
      sector.upcomingCatalysts * 0.15 +
      sector.sectorSentiment * 0.1 +
      sector.structuralDurability * 0.1 +
      (100 - sector.regulatoryRisk) * 0.1,
  );

  return {
    total,
    label: toLabel(total),
    reasons: [
      `Macro tailwind scored ${sector.macroTailwind}/100`,
      `Policy support scored ${sector.policySupport}/100`,
      `Structural durability scored ${sector.structuralDurability}/100`,
    ],
  };
};

export const scoreInstrument = (instrument: InstrumentSnapshot): ScoreBreakdown => {
  const total = clampScore(
    instrument.financialQuality * 0.25 +
      instrument.businessQuality * 0.15 +
      instrument.managementGovernance * 0.2 +
      instrument.sectorAlignment * 0.1 +
      instrument.stabilityProfile * 0.1 +
      instrument.upsidePotential * 0.1 +
      instrument.currentEventContext * 0.1,
  );

  return {
    total,
    label: toLabel(total),
    reasons: [
      `Financial quality scored ${instrument.financialQuality}/100`,
      `Management and governance scored ${instrument.managementGovernance}/100`,
      `Sector alignment scored ${instrument.sectorAlignment}/100`,
    ],
  };
};

