import { UnresolvedSettlement, UnresolvedLedger, MatchResult } from './types';
import { normalize, bigrams, diceCoefficient } from './scoring';

export type Stage3Candidate = {
  settlement: UnresolvedSettlement;
  topCandidates: { ledger: UnresolvedLedger; score: number }[];
};

export function runStage2(
  settlements: UnresolvedSettlement[],
  ledgers: UnresolvedLedger[]
): {
  matches: MatchResult[];
  unresolvedLedgers: UnresolvedLedger[];
  stage3Queue: Stage3Candidate[];
} {
  const matches: MatchResult[] = [];
  const stage3Queue: Stage3Candidate[] = [];
  let ledgerSet = [...ledgers];

  for (const settlement of settlements) {
    const scoredCandidates: { ledger: UnresolvedLedger; score: number }[] = [];

    for (const ledger of ledgerSet) {
      const gross = Number(ledger.grossAmount);
      const fee = Math.round((gross * 0.02 + 2) * 100) / 100;
      const expectedSettlement = Math.round((gross - fee) * 100) / 100;
      
      const amtDiff = Math.abs(Number(settlement.amountSettled) - expectedSettlement);
      const amountScore = amtDiff <= 1 ? 1 : amtDiff >= 15 ? 0 : 1 - (amtDiff - 1) / 14;

      const refScore = diceCoefficient(
        bigrams(normalize(settlement.orderRef)),
        bigrams(normalize(ledger.orderRef))
      );

      const daysDiff = Math.abs(settlement.settledDate.getTime() - ledger.orderDate.getTime()) / (1000 * 60 * 60 * 24);
      const dateScore = daysDiff <= 1 ? 1 : daysDiff <= 2 ? 0.7 : daysDiff <= 3 ? 0.4 : daysDiff <= 4 ? 0.15 : 0;

      const score = 0.5 * amountScore + 0.3 * refScore + 0.2 * dateScore;
      scoredCandidates.push({ ledger, score });
    }

    scoredCandidates.sort((a, b) => b.score - a.score);

    if (scoredCandidates.length > 0) {
      const best = scoredCandidates[0];
      const secondBest = scoredCandidates.length > 1 ? scoredCandidates[1] : null;

      if (best.score >= 0.72 && (!secondBest || best.score - secondBest.score >= 0.15)) {
        matches.push({
          settlementId: settlement.id,
          ledgerEntryId: best.ledger.id,
          stage: 'rule',
          confidence: best.score,
          note: `Rule-based match (Score: ${best.score.toFixed(2)})`
        });
        ledgerSet = ledgerSet.filter(l => l.id !== best.ledger.id);
      } else if (best.score >= 0.40) {
        stage3Queue.push({
          settlement,
          topCandidates: scoredCandidates.slice(0, 3)
        });
      } else {
        matches.push({
          settlementId: settlement.id,
          ledgerEntryId: null,
          stage: 'exception',
          confidence: best.score,
          note: 'no plausible counterpart found'
        });
      }
    } else {
      matches.push({
        settlementId: settlement.id,
        ledgerEntryId: null,
        stage: 'exception',
        confidence: 0,
        note: 'no plausible counterpart found'
      });
    }
  }

  return {
    matches,
    unresolvedLedgers: ledgerSet,
    stage3Queue
  };
}
