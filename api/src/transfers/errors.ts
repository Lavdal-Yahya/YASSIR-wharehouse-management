import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain errors for stock transfers (Phase 4). Codes are stable and double as
// frontend i18n keys (architecture §3.9). INSUFFICIENT_STOCK for the source
// side is not re-declared here — it surfaces from the inventory chokepoint;
// DESTINATION_INSUFFICIENT_STOCK is a distinct code so reversal failures can
// carry a reversal-specific message.

export class TransferSameLocationError extends DomainError {
  readonly code = 'TRANSFER_SAME_LOCATION';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor() {
    super('Source and destination locations must differ');
  }
}

export class TransferNoItemsError extends DomainError {
  readonly code = 'TRANSFER_NO_ITEMS';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor() {
    super('A transfer must contain at least one item');
  }
}

export class DuplicateTransferItemError extends DomainError {
  readonly code = 'DUPLICATE_TRANSFER_ITEM';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  readonly productId: string;
  constructor(productId: string) {
    super(`Duplicate product ${productId} in transfer items — merge the lines`);
    this.productId = productId;
  }
}

export class LocationArchivedError extends DomainError {
  readonly code = 'LOCATION_ARCHIVED';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly locationId: string;
  constructor(locationId: string) {
    super(`Location ${locationId} is archived`);
    this.locationId = locationId;
  }
}

export class TransferNotReversibleError extends DomainError {
  readonly code = 'TRANSFER_NOT_REVERSIBLE';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly status: string;
  constructor(status: string) {
    super(`Transfer in status ${status} cannot be reversed`);
    this.status = status;
  }
}

// Reversal-specific insufficient-stock: the destination has since spent the
// goods (sold, transferred out, corrected down). We re-throw as a distinct
// code so the UI can render the "destination no longer holds enough" message
// (phase-4 §3) without pretending the source is the problem.
export class DestinationInsufficientStockError extends DomainError {
  readonly code = 'DESTINATION_INSUFFICIENT_STOCK';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly productId: string;
  readonly available: number;
  readonly requested: number;
  constructor(args: { productId: string; available: number; requested: number }) {
    super(
      `Destination no longer holds enough of product ${args.productId} to reverse ` +
        `(requested ${args.requested}, available ${args.available})`,
    );
    this.productId = args.productId;
    this.available = args.available;
    this.requested = args.requested;
  }
}
