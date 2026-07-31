import {
  CustomerPaymentStatus,
  ExpenseStatus,
  Prisma,
  RemittanceStatus,
  SaleStatus,
} from '@prisma/client';

// The §4 "iron rule" of Phase 7: every aggregation counts only
// status = ACTIVE rows, and every allocation lookup requires BOTH
// its payment and its sale to be ACTIVE (D-013). These filters exist
// exactly once so drift is structurally impossible — every report
// composes them into its WHERE.
//
// Read: "cancelled and reversed anything is invisible to totals".

export const ACTIVE_SALE: Prisma.SaleWhereInput = {
  status: SaleStatus.ACTIVE,
};

export const ACTIVE_PAYMENT: Prisma.CustomerPaymentWhereInput = {
  status: CustomerPaymentStatus.ACTIVE,
};

export const ACTIVE_EXPENSE: Prisma.ExpenseWhereInput = {
  status: ExpenseStatus.ACTIVE,
};

export const ACTIVE_REMITTANCE: Prisma.CashRemittanceWhereInput = {
  status: RemittanceStatus.ACTIVE,
};

// An allocation is active iff its parent payment is ACTIVE AND its
// sale is ACTIVE (D-013). No status column of its own — liveness is
// derived. Use this on PaymentAllocation queries whenever the report
// asks "how much has this sale actually been paid".
export const ACTIVE_ALLOCATION_WHERE: Prisma.PaymentAllocationWhereInput = {
  payment: { status: CustomerPaymentStatus.ACTIVE },
  sale: { status: SaleStatus.ACTIVE },
};
