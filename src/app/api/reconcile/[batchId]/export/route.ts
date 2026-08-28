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
        matches: true,
        settlements: true,
        ledgerEntries: true,
      }
    });

    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const payload = {
      batchId: batch.id,
      seed: batch.seed,
      createdAt: batch.createdAt,
      matches: batch.matches,
      settlements: batch.settlements,
      ledgers: batch.ledgerEntries,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="reconcilr_export_${batchId}.json"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to export results' }, { status: 500 });
  }
}
