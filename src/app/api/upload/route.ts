import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ledgers, settlements } = body;

    if (!ledgers || !settlements || !Array.isArray(ledgers) || !Array.isArray(settlements)) {
      return NextResponse.json({ error: 'Invalid payload format.' }, { status: 400 });
    }

    const batch = await prisma.batch.create({
      data: { seed: 0 } // Custom user uploaded batch
    });

    const parsedLedgers = ledgers.map((l: any) => ({
      batchId: batch.id,
      ledgerRef: String(l.ledgerRef),
      orderRef: String(l.orderRef),
      grossAmount: new Prisma.Decimal(l.grossAmount),
      orderDate: new Date(l.orderDate),
    }));

    const parsedSettlements = settlements.map((s: any) => ({
      batchId: batch.id,
      settlementRef: String(s.settlementRef),
      orderRef: String(s.orderRef),
      amountSettled: new Prisma.Decimal(s.amountSettled),
      settledDate: new Date(s.settledDate),
    }));

    await prisma.$transaction([
      prisma.ledgerEntry.createMany({ data: parsedLedgers }),
      prisma.settlement.createMany({ data: parsedSettlements })
    ]);

    return NextResponse.json({ batchId: batch.id });
  } catch (error: any) {
    console.error('Failed to upload data:', error);
    return NextResponse.json({ error: error.message || 'Failed to process upload' }, { status: 500 });
  }
}
