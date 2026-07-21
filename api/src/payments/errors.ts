import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain errors for customer payments (Phase 6). Codes double as
// frontend i18n keys (architecture §3.9) and are the ONLY conflict
// codes this module raises — bare HttpException is banned so every
// failure the UI hits is localizable.

// Registering a payment above what the customer actually owes.
// Carries the actual outstanding so the UI can say
// "The customer only owes 7,000 MRU" without a second round-trip.
// v1 has no credit balances (spec §21.2) — overpay is a hard reject.
export class PaymentExceedsDebtError extends DomainError {
  readonly code = 'PAYMENT_EXCEEDS_DEBT';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly outstanding: number;
  readonly attempted: number;
  constructor(outstanding: number, attempted: number) {
    super(
      `Payment ${attempted} exceeds the customer's outstanding debt ${outstanding}`,
    );
    this.outstanding = outstanding;
    this.attempted = attempted;
  }
}

// Reversal is idempotent by refusal, not by silence — a second reverse
// on an already-CANCELLED payment must fail loudly so the UI shows the
// operator the payment is already reversed, rather than pretending the
// second reversal took effect.
export class PaymentNotReversibleError extends DomainError {
  readonly code = 'PAYMENT_NOT_REVERSIBLE';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly status: string;
  constructor(status: string) {
    super(`Payment in status ${status} cannot be reversed`);
    this.status = status;
  }
}

// Admin-only path (P6-03): the owner may direct a payment at a
// specific sale. If that sale isn't the customer's or isn't ACTIVE,
// something is out of sync with the account page — surface it rather
// than silently falling back to oldest-first.
export class InvalidTargetSaleError extends DomainError {
  readonly code = 'INVALID_TARGET_SALE';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly saleId: string;
  readonly reason: string;
  constructor(saleId: string, reason: string) {
    super(`Sale ${saleId} is not a valid allocation target: ${reason}`);
    this.saleId = saleId;
    this.reason = reason;
  }
}

// Customer with amountDue = 0 cannot receive a payment — nothing to
// allocate. Distinct code from OVER because the UI hides the register
// button in this state; a request that lands here is a genuine race
// (a concurrent payment settled the last sale) and should say so.
export class NoOutstandingDebtError extends DomainError {
  readonly code = 'NO_OUTSTANDING_DEBT';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly customerId: string;
  constructor(customerId: string) {
    super(`Customer ${customerId} has no outstanding debt to allocate against`);
    this.customerId = customerId;
  }
}

export class PaymentNotFoundError extends DomainError {
  readonly code = 'PAYMENT_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  readonly paymentId: string;
  constructor(paymentId: string) {
    super(`Payment ${paymentId} not found`);
    this.paymentId = paymentId;
  }
}
