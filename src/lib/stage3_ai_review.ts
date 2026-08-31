import { MatchResult, UnresolvedLedger } from './types';
import { Stage3Candidate } from './stage2_fuzzy';
import { GoogleGenAI } from '@google/genai';

export async function runStage3(
  queue: Stage3Candidate[],
  ledgerPool: UnresolvedLedger[]
): Promise<{ matches: MatchResult[]; unresolvedLedgers: UnresolvedLedger[] }> {
  const matches: MatchResult[] = [];
  const remainingLedgers = [...ledgerPool];

  if (queue.length === 0) {
    return { matches, unresolvedLedgers: remainingLedgers };
  }

  // Cap ~15 per call
  const BATCH_SIZE = 15;
  
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    
    // Prepare the payload
    const payload = batch.map(c => ({
      settlement: {
        id: c.settlement.id,
        amount: Number(c.settlement.amountSettled),
        date: c.settlement.settledDate.toISOString(),
        ref: c.settlement.orderRef
      },
      candidates: c.topCandidates.map(tc => ({
        id: tc.ledger.id,
        amount: Number(tc.ledger.grossAmount),
        date: tc.ledger.orderDate.toISOString(),
        ref: tc.ledger.orderRef,
        score: tc.score
      }))
    }));

    const prompt = `
You are an AI financial reconciliation controller.
Fee model: fee = round(gross * 0.02 + 2, 2)
Therefore, expected settlement amount = round(gross - fee, 2).

Review the following ambiguous settlement records. For each settlement, I provide its top 3 rule-based matching candidates.
If a candidate is a genuinely plausible match (considering amounts, dates, and references), select it. If none are plausible or it is too ambiguous, return null.

You MUST return STRICT JSON output only. The JSON must be an array matching the input order exactly.
Each object in the array MUST have this format:
{
  "matched_ledger_id": "string or null",
  "confidence": number between 0 and 1,
  "reasoning": "string under 20 words"
}

Input Batch:
${JSON.stringify(payload, null, 2)}
`;

    let apiFailed = false;
    let aiResults: { matched_ledger_id: string | null; confidence: number; reasoning: string }[] = [];

    try {
      if (!ai) {
        throw new Error('API key missing');
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = response.text || '';
      
      // parse JSON
      const jsonStr = text.substring(text.indexOf('['), text.lastIndexOf(']') + 1);
      if (!jsonStr) throw new Error('No JSON array found');
      
      aiResults = JSON.parse(jsonStr);
      if (!Array.isArray(aiResults) || aiResults.length !== batch.length) {
        throw new Error('Invalid JSON array length or format');
      }
    } catch (err) {
      console.error('AI Stage 3 Error:', err);
      apiFailed = true;
    }

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const settlementId = item.settlement.id;
      const bestRuleScore = item.topCandidates[0]?.score || 0;
      const bestRuleLedgerId = item.topCandidates[0]?.ledger.id || null;

      if (apiFailed) {
        // Fallback
        if (bestRuleScore >= 0.4 && bestRuleLedgerId) {
          matches.push({
            settlementId,
            ledgerEntryId: bestRuleLedgerId,
            stage: 'ai',
            confidence: bestRuleScore,
            note: 'AI unavailable — rule-based fallback'
          });
        } else {
          matches.push({
            settlementId,
            ledgerEntryId: null,
            stage: 'exception',
            confidence: bestRuleScore,
            note: 'AI unavailable and no reliable candidate'
          });
        }
      } else {
        const result = aiResults[j];
        if (result && result.matched_ledger_id) {
          matches.push({
            settlementId,
            ledgerEntryId: result.matched_ledger_id,
            stage: 'ai',
            confidence: result.confidence || 0,
            note: result.reasoning || 'AI match'
          });
        } else {
          matches.push({
            settlementId,
            ledgerEntryId: null,
            stage: 'exception',
            confidence: result?.confidence || 0,
            note: result?.reasoning || 'AI rejected candidates'
          });
        }
      }
    }
  }

  // filter remainingLedgers based on matches
  const matchedLedgerIds = new Set(matches.map(m => m.ledgerEntryId).filter(Boolean));
  const newUnresolved = remainingLedgers.filter(l => !matchedLedgerIds.has(l.id));

  return { matches, unresolvedLedgers: newUnresolved };
}
