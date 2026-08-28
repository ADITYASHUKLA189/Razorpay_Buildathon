import { UnresolvedSettlement, UnresolvedLedger, MatchResult } from './types';
import { normalize } from './scoring';

export function runStage1(
  settlements: UnresolvedSettlement[],
  ledgers: UnresolvedLedger[]
): {
  matches: MatchResult[];
  unresolvedSettlements: UnresolvedSettlement[];
  unresolvedLedgers: UnresolvedLedger[];
} {
  const matches: MatchResult[] = [];
  const unresolvedSettlements: UnresolvedSettlement[] = [];
  let ledgerSet = [...ledgers];

  for (const settlement of settlements) {
    let matched = false;
    for (let i = 0; i < ledgerSet.length; i++) {
      const ledger = ledgerSet[i];
      if (normalize(settlement.orderRef) === normalize(ledger.orderRef)) {
        // Fee model: fee = round(gross * 0.02 + 2, 2)
        const gross = Number(ledger.grossAmount);
        const fee = Math.round((gross * 0.02 + 2) * 100) / 100;
        const expectedSettlement = Math.round((gross - fee) * 100) / 100;
        
        if (Math.abs(Number(settlement.amountSettled) - expectedSettlement) < 0.001) {
          // Date within 1 day
          const daysDiff = Math.abs(settlement.settledDate.getTime() - ledger.orderDate.getTime()) / (1000 * 60 * 60 * 24);
          if (daysDiff <= 1.0) {
            matches.push({
              settlementId: settlement.id,
              ledgerEntryId: ledger.id,
              stage: 'exact',
              confidence: 1.0,
              note: 'Exact match'
            });
            ledgerSet.splice(i, 1);
            matched = true;
            break;
          }
        }
      }
    }
    if (!matched) {
      unresolvedSettlements.push(settlement);
    }
  }

  return {
    matches,
    unresolvedSettlements,
    unresolvedLedgers: ledgerSet
  };
}
