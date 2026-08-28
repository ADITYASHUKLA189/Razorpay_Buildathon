import { UnresolvedSettlement, UnresolvedLedger, MatchResult } from './types';
import { runStage1 } from './stage1_exact';
import { runStage2 } from './stage2_fuzzy';
import { runStage3 } from './stage3_ai_review';

export async function runReconciliation(
  settlements: UnresolvedSettlement[],
  ledgers: UnresolvedLedger[],
  onProgress?: (match: MatchResult) => void
): Promise<{ matches: MatchResult[]; unresolvedLedgers: UnresolvedLedger[] }> {
  const allMatches: MatchResult[] = [];
  
  // Stage 1
  const s1 = runStage1(settlements, ledgers);
  for (const m of s1.matches) {
    allMatches.push(m);
    if (onProgress) onProgress(m);
  }

  // Stage 2
  const s2 = runStage2(s1.unresolvedSettlements, s1.unresolvedLedgers);
  for (const m of s2.matches) {
    allMatches.push(m);
    if (onProgress) onProgress(m);
  }

  // Stage 3
  const s3 = await runStage3(s2.stage3Queue, s2.unresolvedLedgers);
  for (const m of s3.matches) {
    allMatches.push(m);
    if (onProgress) onProgress(m);
  }

  // Exceptions for unclaimed ledgers
  for (const ledger of s3.unresolvedLedgers) {
    const orphanLedgerMatch: MatchResult = {
      settlementId: null,
      ledgerEntryId: ledger.id,
      stage: 'exception',
      confidence: 0,
      note: 'ledger entry has no counterpart settlement (likely pending payout).'
    };
    allMatches.push(orphanLedgerMatch);
    if (onProgress) onProgress(orphanLedgerMatch);
  }

  return { matches: allMatches, unresolvedLedgers: [] };
}
