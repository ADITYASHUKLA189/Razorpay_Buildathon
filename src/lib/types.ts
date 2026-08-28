import { Prisma } from '@prisma/client';

export type UnresolvedSettlement = {
  id: string;
  settlementRef: string;
  orderRef: string;
  amountSettled: Prisma.Decimal;
  settledDate: Date;
};

export type UnresolvedLedger = {
  id: string;
  ledgerRef: string;
  orderRef: string;
  grossAmount: Prisma.Decimal;
  orderDate: Date;
};

export type MatchResult = {
  settlementId: string | null;
  settlementRef?: string;
  settlementAmount?: number;
  ledgerEntryId: string | null;
  ledgerRef?: string;
  ledgerAmount?: number;
  stage: 'exact' | 'rule' | 'ai' | 'exception';
  confidence: number;
  note: string;
  correctVsTruth?: boolean | null;
  // AI specific payload mock for UI
  candidates?: { id: string; ref: string; amount: number; date: string; score: number }[];
};
