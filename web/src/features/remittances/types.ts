export type RemittanceStatus = 'ACTIVE' | 'CANCELLED';

// Mirrors RemittancesService.mapRemittance on the API side.
export type Remittance = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shopName: string;
  amount: number;
  remittanceDate: string;
  notes: string | null;
  status: RemittanceStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateRemittanceBody = {
  shopId: string;
  amount: number;
  remittanceDate?: string;
  notes?: string | null;
};

export type CancelRemittanceBody = { reason: string };

// Point-in-time cash-on-hand snapshot from GET /reports/cash-on-hand.
export type CashOnHand = {
  asOf: string;
  warehouseCash: number | null; // null for SHOP role
  shops: Array<{ shopId: string; shopName: string; cashOnHand: number }>;
};
