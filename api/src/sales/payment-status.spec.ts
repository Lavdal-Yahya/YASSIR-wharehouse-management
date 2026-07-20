import { PaymentStatus } from '@prisma/client';
import { derivePaymentStatus } from './payment-status';

describe('derivePaymentStatus', () => {
  it('paid nothing → UNPAID', () => {
    expect(derivePaymentStatus(10_000, 0)).toBe(PaymentStatus.UNPAID);
  });

  it('paid the full amount → PAID', () => {
    expect(derivePaymentStatus(10_000, 10_000)).toBe(PaymentStatus.PAID);
  });

  it('paid part → PARTIALLY_PAID', () => {
    expect(derivePaymentStatus(10_000, 4_000)).toBe(PaymentStatus.PARTIALLY_PAID);
  });

  // Zero-total edge: a fully free sale (all lines at unitPrice 0). The
  // "amount paid" is trivially the total; PAID is the correct label.
  it('zero total → PAID (fully free sale)', () => {
    expect(derivePaymentStatus(0, 0)).toBe(PaymentStatus.PAID);
  });
});
