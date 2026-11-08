// Reliability scoring (spec section 7). Weights are ASUMSI, stored in `settings` (key "scoring").
export interface ScoringSettings {
  oldScoreWeight: number; // default 0.7
  deliveryScoreWeight: number; // default 0.3
  deliveredKgWeight: number; // default 0.5
  onTimeWeight: number; // default 0.3
  gradeOkWeight: number; // default 0.2
}

export interface DeliveryOutcome {
  committedKg: number;
  deliveredKg: number;
  onTime: boolean;
  gradeOk: boolean;
}

export function scoreDelivery(outcome: DeliveryOutcome, s: ScoringSettings): number {
  if (outcome.committedKg <= 0) return 0;
  const fillRatio = Math.min(outcome.deliveredKg / outcome.committedKg, 1);
  return (
    s.deliveredKgWeight * fillRatio +
    s.onTimeWeight * (outcome.onTime ? 1 : 0) +
    s.gradeOkWeight * (outcome.gradeOk ? 1 : 0)
  );
}

export function nextReliabilityScore(oldScore: number, outcome: DeliveryOutcome | "FAILED", s: ScoringSettings): number {
  const deliveryScore = outcome === "FAILED" ? 0 : scoreDelivery(outcome, s);
  return s.oldScoreWeight * oldScore + s.deliveryScoreWeight * deliveryScore;
}
