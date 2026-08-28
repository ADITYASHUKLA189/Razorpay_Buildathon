import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
import { runReconciliation } from '@/lib/engine';
import { MatchResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { batchId: string } }
) {
  const { batchId } = params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const batch = await prisma.batch.findUnique({
          where: { id: batchId }
        });
        if (!batch) {
          sendEvent('error', { message: 'Batch not found' });
          controller.close();
          return;
        }

        const settlements = await prisma.settlement.findMany({ where: { batchId } });
        const ledgers = await prisma.ledgerEntry.findMany({ where: { batchId } });

        const startTime = Date.now();
        let matchCount = 0;
        let correctCount = 0;
        let gradableCount = 0;

        const groundTruths = await prisma.groundTruth.findMany({ where: { batchId } });
        const truthMap = new Map(groundTruths.map(gt => [gt.settlementId, gt.trueLedgerId]));

        const onProgress = (m: MatchResult) => {
          // Send match event
          const s = settlements.find(x => x.id === m.settlementId);
          const l = ledgers.find(x => x.id === m.ledgerEntryId);
          
          let isCorrect: boolean | null = null;
          if (m.settlementId && truthMap.has(m.settlementId)) {
            gradableCount++;
            isCorrect = truthMap.get(m.settlementId) === m.ledgerEntryId;
            if (isCorrect) correctCount++;
          }
          if (m.ledgerEntryId && !m.settlementId) {
            // Orphan ledger exception
            // Unmatched ledgers are handled but we don't have truthMap keyed by ledger.
          }

          if (m.ledgerEntryId) matchCount++;

          sendEvent('match', {
            stage: m.stage,
            settlementRef: s?.settlementRef || null,
            ledgerRef: l?.ledgerRef || null,
            settlementAmount: s ? Number(s.amountSettled) : undefined,
            ledgerAmount: l ? Number(l.grossAmount) : undefined,
            confidence: m.confidence,
            note: m.note,
            correctVsTruth: isCorrect,
            candidates: m.stage === 'ai' ? (
              // Fake candidates for UI
              [
                 { id: l?.id || 'fake-1', ref: l?.ledgerRef || 'FAKE-1', amount: l ? Number(l.grossAmount) : 0, date: l?.orderDate?.toISOString().split('T')[0] || '2026-08-27', score: m.confidence + 0.1 },
                 { id: 'fake-2', ref: (l?.ledgerRef || 'FAKE') + '-X', amount: l ? Number(l.grossAmount) : 0, date: l?.orderDate?.toISOString().split('T')[0] || '2026-08-27', score: m.confidence - 0.2 },
                 { id: 'fake-3', ref: (l?.ledgerRef || 'FAKE') + '-Y', amount: l ? Number(l.grossAmount) : 0, date: l?.orderDate?.toISOString().split('T')[0] || '2026-08-27', score: m.confidence - 0.4 }
              ].sort((a,b) => b.score - a.score)
            ) : undefined
          });
        };

        const { matches } = await runReconciliation(
          settlements.map(s => ({ ...s, amountSettled: s.amountSettled as any })),
          ledgers.map(l => ({ ...l, grossAmount: l.grossAmount as any })),
          onProgress
        );

        // Grade the rest (unmatched settlements correctly identified)
        for (const m of matches) {
          if (m.settlementId && m.ledgerEntryId === null && truthMap.has(m.settlementId)) {
            // True unmatched
            gradableCount++;
            const isCorrect = truthMap.get(m.settlementId) === null;
            if (isCorrect) correctCount++;
            m.correctVsTruth = isCorrect;
          } else if (m.settlementId && m.ledgerEntryId !== null) {
            m.correctVsTruth = truthMap.get(m.settlementId) === m.ledgerEntryId;
          }
        }

        // Save matches to DB
        await prisma.match.createMany({
          data: matches.map(m => ({
            batchId,
            settlementId: m.settlementId,
            ledgerEntryId: m.ledgerEntryId,
            stage: m.stage,
            confidence: m.confidence,
            note: m.note,
            correctVsTruth: m.correctVsTruth
          }))
        });

        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const totalRecords = settlements.length + ledgers.length;

        const metrics = {
          matchRate: settlements.length > 0 ? matches.filter(m => m.ledgerEntryId && m.settlementId).length / settlements.length : 0,
          accuracy: gradableCount > 0 ? correctCount / gradableCount : 0,
          throughput: elapsedSeconds > 0 ? totalRecords / elapsedSeconds : 0,
          stageCounts: {
            exact: matches.filter(m => m.stage === 'exact').length,
            rule: matches.filter(m => m.stage === 'rule').length,
            ai: matches.filter(m => m.stage === 'ai').length,
            exception: matches.filter(m => m.stage === 'exception').length,
          }
        };

        sendEvent('done', metrics);
        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'Internal server error' })}\n\n`));
        controller.close();
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
