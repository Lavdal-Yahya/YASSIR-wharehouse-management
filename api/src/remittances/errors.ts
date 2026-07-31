import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain errors for cash remittances. Codes double as frontend i18n keys.

export class RemittanceNotFoundError extends DomainError {
  readonly code = 'REMITTANCE_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  readonly remittanceId: string;
  constructor(remittanceId: string) {
    super(`Remittance ${remittanceId} not found`);
    this.remittanceId = remittanceId;
  }
}

export class RemittanceNotCancellableError extends DomainError {
  readonly code = 'REMITTANCE_NOT_CANCELLABLE';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly status: string;
  constructor(status: string) {
    super(`Remittance in status ${status} cannot be cancelled`);
    this.status = status;
  }
}

// Guard against remitting more than the shop actually holds. The shop
// cash-on-hand is derived (Σ cash in − Σ cash out); if the requested
// amount exceeds it we refuse — the client is expected to fetch the
// current balance before opening the form.
export class RemittanceExceedsCashOnHandError extends DomainError {
  readonly code = 'REMITTANCE_EXCEEDS_CASH_ON_HAND';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly requested: number;
  readonly available: number;
  constructor(requested: number, available: number) {
    super(`Requested ${requested} exceeds cash on hand ${available}`);
    this.requested = requested;
    this.available = available;
  }
  details() {
    return { requested: this.requested, available: this.available };
  }
}
