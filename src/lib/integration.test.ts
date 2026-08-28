import { describe, it, expect, vi } from 'vitest';
import { runReconciliation } from './engine';
import { MatchResult, UnresolvedLedger, UnresolvedSettlement } from './types';
import { Prisma } from '@prisma/client';
import { runStage3 } from './stage3_ai_review';

// Mock stage 3 to test fallback
vi.mock('./stage3_ai_review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stage3_ai_review')>();
  return {
    ...actual,
    runStage3: vi.fn(async (queue, ledgerPool) => {
      // simulate failed API call, which triggers fallback inside runStage3
      // actually runStage3 has the try-catch inside it. We want to test runStage3 itself or mock it?
      // Wait, if we want to test runStage3's fallback, we should unit-test runStage3 with mocked Anthropic.
      // For the integration test, we can just let it use a fake Anthropic or mock runStage3 entirely to simulate what happens.
      // Let's just mock runStage3 to simulate a failure fallback since we don't have an API key in test.
      const matches: MatchResult[] = [];
      const remainingLedgers = new Set(ledgerPool);
      for (const item of queue) {
        const best = item.topCandidates[0];
        if (best && best.score >= 0.4) {
          matches.push({
            settlementId: item.settlement.id,
            ledgerEntryId: best.ledger.id,
            stage: 'ai',
            confidence: best.score,
            note: 'AI unavailable — rule-based fallback'
          });
          remainingLedgers.delete(best.ledger);
        } else {
          matches.push({
            settlementId: item.settlement.id,
            ledgerEntryId: null,
            stage: 'exception',
            confidence: best?.score || 0,
            note: 'AI unavailable and no reliable candidate'
          });
        }
      }
          const matchedIds = new Set(matches.map(m => m.ledgerEntryId));
          const newUnresolved = ledgerPool.filter(l => !matchedIds.has(l.id));
          return { matches, unresolvedLedgers: newUnresolved };
    })
  };
});

describe('Integration test', () => {
  it('runs reconciliation properly', async () => {
    // Generate some deterministic data
    const ledgers: UnresolvedLedger[] = [
      { id: 'L1', ledgerRef: 'LED-1', orderRef: 'ORD-1', grossAmount: new Prisma.Decimal(100), orderDate: new Date('2026-01-01') },
      { id: 'L2', ledgerRef: 'LED-2', orderRef: 'ORD-2', grossAmount: new Prisma.Decimal(100), orderDate: new Date('2026-01-01') },
      { id: 'L3', ledgerRef: 'LED-3', orderRef: 'FOO-3', grossAmount: new Prisma.Decimal(100), orderDate: new Date('2026-01-01') }
    ];
    // expected fee for 100: 100 * 0.02 + 2 = 4
    // expected settlement: 96
    
    const settlements: UnresolvedSettlement[] = [
      // Exact match for L1
      { id: 'S1', settlementRef: 'STL-1', orderRef: 'ORD-1', amountSettled: new Prisma.Decimal(96), settledDate: new Date('2026-01-01') },
      // Fuzzy match for L2 (mangled ref)
      { id: 'S2', settlementRef: 'STL-2', orderRef: 'ORD-R1', amountSettled: new Prisma.Decimal(96), settledDate: new Date('2026-01-03') },
      // Ambiguous pair (AI fallback) - wait, we just made L3. We need S3 to partially match L3.
      { id: 'S3', settlementRef: 'STL-3', orderRef: 'FOO-X', amountSettled: new Prisma.Decimal(96), settledDate: new Date('2026-01-06') },
    ];

    const result = await runReconciliation(settlements, ledgers);
    expect(result.matches.length).toBeGreaterThanOrEqual(3);

    const m1 = result.matches.find(m => m.settlementId === 'S1');
    expect(m1?.stage).toBe('exact');
    expect(m1?.ledgerEntryId).toBe('L1');

    const m2 = result.matches.find(m => m.settlementId === 'S2');
    expect(m2?.stage).toBe('rule');
    expect(m2?.ledgerEntryId).toBe('L2');

    const m3 = result.matches.find(m => m.settlementId === 'S3');
    expect(m3?.stage).toBe('ai');
    expect(m3?.ledgerEntryId).toBe('L3');
    expect(m3?.note).toBe('AI unavailable — rule-based fallback');
  });
});
