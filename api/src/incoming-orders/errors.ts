import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain errors specific to the incoming-orders module. Codes are stable and
// double as the frontend i18n keys (architecture §3.9).

export class OrderNotEditableError extends DomainError {
  readonly code = 'ORDER_NOT_EDITABLE';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor(status: string) {
    super(`Order in status ${status} cannot be edited or acted on`);
  }
}

export class OrderNoItemsError extends DomainError {
  readonly code = 'ORDER_NO_ITEMS';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor() {
    super('An order must contain at least one item');
  }
}

export class ReceiveExceedsRemainingError extends DomainError {
  readonly code = 'RECEIVE_EXCEEDS_REMAINING';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly orderItemId: string;
  readonly remaining: number;
  constructor(orderItemId: string, remaining: number) {
    super(
      `Cannot receive more than the outstanding quantity (${remaining}). ` +
        `Use a direct receipt for extra units.`,
    );
    this.orderItemId = orderItemId;
    this.remaining = remaining;
  }
}

export class ReceiveEmptyError extends DomainError {
  readonly code = 'RECEIVE_EMPTY';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor() {
    super('At least one item with quantity > 0 must be received');
  }
}
