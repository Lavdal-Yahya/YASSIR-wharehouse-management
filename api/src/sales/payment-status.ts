import { PaymentStatus } from '@prisma/client';

// One shared derivation, used by SalesService.confirm (Phase 5) and by
// Phase 6's payment-allocation recomputation. The rule is intentionally
// small — a single branch table so that ranking stays trivially
// verifiable, and so tests exercise every leg (spec §37.8).
//
// Preconditions checked by the caller (schema CHECK + service DTO):
//   totalAmount ≥ 0, 0 ≤ amountPaid ≤ totalAmount.

export function derivePaymentStatus(
  totalAmount: number,
  amountPaid: number,
): PaymentStatus {
  // Zero-total sale (all lines at unitPrice 0) — nothing is owed, so it's
  // trivially paid. Guard first so amountPaid=0 doesn't flip us to UNPAID.
  if (amountPaid >= totalAmount) return PaymentStatus.PAID;
  if (amountPaid <= 0) return PaymentStatus.UNPAID;
  return PaymentStatus.PARTIALLY_PAID;
}
