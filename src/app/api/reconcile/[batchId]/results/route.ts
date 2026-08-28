import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { batchId: string } }
) {
  const { batchId } = params;

  try {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: {
        matches: {
          include: {
            batch: false // avoid circular
          }
        },
        settlements: true,
        ledgerEntries: true,
        _count: {
          select: { settlements: true, ledgerEntries: true }
        }
      }
    });

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const groundTruths = await prisma.groundTruth.findMany({ where: { batchId } });

    // Join data for frontend
    const enrichedMatches = batch.matches.map(m => {
      const s = batch.settlements.find(x => x.id === m.settlementId);
      const l = batch.ledgerEntries.find(x => x.id === m.ledgerEntryId);
      return {
        ...m,
        settlement: s ? { ref: s.settlementRef, amount: s.amountSettled, date: s.settledDate } : null,
        ledger: l ? { ref: l.ledgerRef, amount: l.grossAmount, date: l.orderDate } : null
      };
    });

    return NextResponse.json({
      matches: enrichedMatches,
      metrics: {
         // simplified metrics computation, full metrics computed during run
         matchCount: batch.matches.filter(m => m.ledgerEntryId).length,
         totalSettlements: batch._count.settlements,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}
