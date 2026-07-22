export type PaymentStatus = 'ACTIVE' | 'CANCELLED';

export type PaymentAllocation = {
  id: string;
  saleId: string;
  saleReference: string;
  amountAllocated: number;
};

export type Payment = {
  id: string;
  referenceNumber: string;
  customerId: string;
  customerName: string;
  shopId: string;
  shopName: string;
  amount: number;
  paymentDate: string;
  debtBeforePayment: number;
  debtAfterPayment: number;
  notes: string | null;
  status: PaymentStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
};

export type PaymentDetail = Payment & { allocations: PaymentAllocation[] };

export type RegisterPaymentBody = {
  customerId: string;
  shopId: string;
  amount: number;
  paymentDate?: string;
  notes?: string | null;
  targetSaleId?: string;
};

export type ReversePaymentBody = {
  reason: string;
};
