import { describe, it, expect, vi } from 'vitest';
import { runStage3 } from './stage3_ai_review';
import { Stage3Candidate } from './stage2_fuzzy';
import { Prisma } from '@prisma/client';

// Mock Gemini
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class {
      models = {
        generateContent: vi.fn().mockRejectedValue(new Error('API Error'))
      };
    }
  };
});

describe('Stage 3 AI Review - Fallback', () => {
  it('falls back to rule-based candidate if AI API fails', async () => {
    const queue: Stage3Candidate[] = [
      {
        settlement: {
          id: 'S1',
          settlementRef: 'STL-1',
          orderRef: 'AMB',
          amountSettled: new Prisma.Decimal(96),
          settledDate: new Date()
        },
        topCandidates: [
          {
            ledger: {
              id: 'L1',
              ledgerRef: 'LED-1',
              orderRef: 'AMB-1',
              grossAmount: new Prisma.Decimal(100),
              orderDate: new Date()
            },
            score: 0.5 // above 0.4 floor
          }
        ]
      },
      {
        settlement: {
          id: 'S2',
          settlementRef: 'STL-2',
          orderRef: 'BAD',
          amountSettled: new Prisma.Decimal(96),
          settledDate: new Date()
        },
        topCandidates: [
          {
            ledger: {
              id: 'L2',
              ledgerRef: 'LED-2',
              orderRef: 'BAD-1',
              grossAmount: new Prisma.Decimal(100),
              orderDate: new Date()
            },
            score: 0.3 // below 0.4 floor
          }
        ]
      }
    ];

    const result = await runStage3(queue, []);
    
    expect(result.matches).toHaveLength(2);
    
    const m1 = result.matches.find(m => m.settlementId === 'S1');
    expect(m1?.stage).toBe('ai');
    expect(m1?.ledgerEntryId).toBe('L1');
    expect(m1?.note).toBe('AI unavailable — rule-based fallback');

    const m2 = result.matches.find(m => m.settlementId === 'S2');
    expect(m2?.stage).toBe('exception');
    expect(m2?.ledgerEntryId).toBeNull();
    expect(m2?.note).toBe('AI unavailable and no reliable candidate');
  });
});
