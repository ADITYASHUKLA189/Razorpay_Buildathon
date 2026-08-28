import { PrismaClient } from '@prisma/client';
import prisma from './prisma';
import { Prisma } from '@prisma/client';
import { addDays, subDays } from 'date-fns';

class LCG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

export async function generateBatch(seedParam?: number) {
  const seed = seedParam ?? Math.floor(Math.random() * 1000000);
  const rng = new LCG(seed);
  
  const batch = await prisma.batch.create({
    data: { seed }
  });

  const baseDate = new Date();
  
  // Helpers
  const genGross = () => 50 + Math.floor(rng.next() * 950); // $50 to $1000
  const applyFee = (gross: number) => {
    const fee = Math.round((gross * 0.02 + 2) * 100) / 100;
    return Math.round((gross - fee) * 100) / 100;
  };
  const genRef = (prefix: string, i: number) => `${prefix}${Math.floor(rng.next() * 10000).toString().padStart(4, '0')}-${i}`;

  const ledgers: any[] = [];
  const settlements: any[] = [];
  const groundTruths: any[] = [];

  let orderCount = 0;

  // 32 "clean" cases
  for (let i = 0; i < 32; i++) {
    orderCount++;
    const gross = genGross();
    const settledAmount = applyFee(gross);
    const orderRef = genRef('ORD-', orderCount);
    const orderDate = subDays(baseDate, 5 + Math.floor(rng.next() * 10));
    const settledDate = addDays(orderDate, Math.floor(rng.next() * 2)); // 0-1 days after

    const l = { id: `L${orderCount}`, ledgerRef: `LED-${orderCount}`, orderRef, grossAmount: new Prisma.Decimal(gross), orderDate };
    const s = { id: `S${orderCount}`, settlementRef: `STL-${orderCount}`, orderRef, amountSettled: new Prisma.Decimal(settledAmount), settledDate };
    
    ledgers.push(l);
    settlements.push(s);
    groundTruths.push({ settlementId: s.id, trueLedgerId: l.id });
  }

  // 10 "fuzzy" cases
  for (let i = 0; i < 10; i++) {
    orderCount++;
    const gross = genGross();
    const settledAmount = applyFee(gross);
    const orderRef = genRef('ORD-', orderCount);
    const orderDate = subDays(baseDate, 5 + Math.floor(rng.next() * 10));
    const settledDate = addDays(orderDate, 2 + Math.floor(rng.next() * 2)); // 2-3 days after

    // Mangle settlement orderRef
    let mangled = orderRef;
    const r = rng.next();
    if (r < 0.33) {
      mangled = mangled.replace('ORD-', '');
    } else if (r < 0.66) {
      mangled = mangled + '-R1';
    } else {
      // Transpose last two digits
      const lastTwo = mangled.slice(-2);
      mangled = mangled.slice(0, -2) + lastTwo[1] + lastTwo[0];
    }

    const l = { id: `L${orderCount}`, ledgerRef: `LED-${orderCount}`, orderRef, grossAmount: new Prisma.Decimal(gross), orderDate };
    const s = { id: `S${orderCount}`, settlementRef: `STL-${orderCount}`, orderRef: mangled, amountSettled: new Prisma.Decimal(settledAmount), settledDate };
    
    ledgers.push(l);
    settlements.push(s);
    groundTruths.push({ settlementId: s.id, trueLedgerId: l.id });
  }

  // 3 "ambiguous" pairs (6 orders)
  for (let i = 0; i < 3; i++) {
    const gross = genGross();
    const settledAmount = applyFee(gross);
    const orderDate = subDays(baseDate, 5 + Math.floor(rng.next() * 10));
    const settledDate = addDays(orderDate, 2);

    // Pair A
    orderCount++;
    const refA = genRef('ORD-', orderCount);
    const lA = { id: `L${orderCount}`, ledgerRef: `LED-${orderCount}`, orderRef: refA, grossAmount: new Prisma.Decimal(gross), orderDate };
    const sA = { id: `S${orderCount}`, settlementRef: `STL-${orderCount}`, orderRef: refA.replace('-', 'X'), amountSettled: new Prisma.Decimal(settledAmount), settledDate };
    
    // Pair B
    orderCount++;
    const refB = genRef('ORD-', orderCount);
    const lB = { id: `L${orderCount}`, ledgerRef: `LED-${orderCount}`, orderRef: refB, grossAmount: new Prisma.Decimal(gross), orderDate };
    const sB = { id: `S${orderCount}`, settlementRef: `STL-${orderCount}`, orderRef: refB.replace('-', 'Y'), amountSettled: new Prisma.Decimal(settledAmount), settledDate };

    ledgers.push(lA, lB);
    settlements.push(sA, sB);
    groundTruths.push(
      { settlementId: sA.id, trueLedgerId: lA.id },
      { settlementId: sB.id, trueLedgerId: lB.id }
    );
  }

  // 2 orphan settlements
  for (let i = 0; i < 2; i++) {
    orderCount++;
    const settledAmount = -Math.floor(rng.next() * 50); // negative amount adjustment
    const settledDate = subDays(baseDate, Math.floor(rng.next() * 5));
    const s = { id: `S${orderCount}`, settlementRef: `STL-${orderCount}`, orderRef: `ADJ-${Math.floor(rng.next()*1000)}`, amountSettled: new Prisma.Decimal(settledAmount), settledDate };
    
    settlements.push(s);
    groundTruths.push({ settlementId: s.id, trueLedgerId: null });
  }

  // 2 orphan ledger entries
  for (let i = 0; i < 2; i++) {
    orderCount++;
    const gross = genGross();
    const orderRef = genRef('ORD-', orderCount);
    const orderDate = subDays(baseDate, Math.floor(rng.next() * 5));
    const l = { id: `L${orderCount}`, ledgerRef: `LED-${orderCount}`, orderRef, grossAmount: new Prisma.Decimal(gross), orderDate };
    
    ledgers.push(l);
  }

  // Insert into DB
  // First clean up IDs to not use static ones, wait we can just omit id to let cuid generate
  const mappedLedgers = ledgers.map(l => ({ ...l, id: undefined, batchId: batch.id }));
  const mappedSettlements = settlements.map(s => ({ ...s, id: undefined, batchId: batch.id }));

  // We need to keep track of generated IDs for GroundTruth.
  const createId = () => Math.random().toString(36).substring(2, 15);
  
  const ledgerIdMap = new Map<string, string>();
  ledgers.forEach(l => {
    const newId = 'cuid_' + createId();
    ledgerIdMap.set(l.id, newId);
    l.id = newId;
  });

  const settlementIdMap = new Map<string, string>();
  settlements.forEach(s => {
    const newId = 'cuid_' + createId();
    settlementIdMap.set(s.id, newId);
    s.id = newId;
  });
  
  // Re-map ground truths
  const gtInserts = groundTruths.map(gt => {
    return {
      batchId: batch.id,
      settlementId: settlementIdMap.get(gt.settlementId)!,
      trueLedgerId: gt.trueLedgerId ? ledgerIdMap.get(gt.trueLedgerId) || null : null
    };
  });

  await prisma.$transaction([
    prisma.ledgerEntry.createMany({ data: ledgers.map(l => ({ ...l, batchId: batch.id })) }),
    prisma.settlement.createMany({ data: settlements.map(s => ({ ...s, batchId: batch.id })) }),
    prisma.groundTruth.createMany({ data: gtInserts })
  ]);

  return { batchId: batch.id, seed, settlementCount: settlements.length, ledgerCount: ledgers.length };
}
