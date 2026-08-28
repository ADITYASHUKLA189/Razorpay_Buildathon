import { Decimal } from '@prisma/client/runtime/library';

export type UnresolvedSettlement = {
  id: string;
  settlementRef: string;
  orderRef: string;
  amountSettled: Decimal;
  settledDate: Date;
};

export type UnresolvedLedger = {
  id: string;
  ledgerRef: string;
  orderRef: string;
  grossAmount: Decimal;
  orderDate: Date;
};

export type MatchResult = {
  settlementId: string | null;
  ledgerEntryId: string | null;
  stage: 'exact' | 'rule' | 'ai' | 'exception';
  confidence: number;
  note: string;
};
