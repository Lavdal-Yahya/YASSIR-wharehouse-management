import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Thrown by InventoryService.applyMovement / applyMovements when a source-side
// deduction would take a balance below zero. The CHECK constraint on
// InventoryBalance is a backstop; this error is what callers actually see so
// they can turn it into a user-facing message (spec §42).
export class InsufficientStockError extends DomainError {
  readonly code = 'INSUFFICIENT_STOCK';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly productId: string;
  readonly locationId: string;
  readonly requested: number;
  readonly available: number;

  constructor(args: { productId: string; locationId: string; requested: number; available: number }) {
    super(
      `Insufficient stock for product ${args.productId} at location ${args.locationId}: ` +
        `requested ${args.requested}, available ${args.available}`,
    );
    this.productId = args.productId;
    this.locationId = args.locationId;
    this.requested = args.requested;
    this.available = args.available;
  }
}

// Thrown when the caller assembled a malformed movement (e.g. quantity <= 0,
// neither side set). This is a programmer error surfacing as a domain error
// so the exception filter still returns a clean message rather than a 500.
export class InvalidMovementError extends DomainError {
  readonly code = 'INVALID_MOVEMENT';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor(reason: string) {
    super(`Invalid movement: ${reason}`);
  }
}
