import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Delete gate — spec §11.4 and phase-2.md §2. Extended each phase that adds a
// history table (inventory movements, order items, sale items, ...).
export class ProductHasHistoryError extends DomainError {
  readonly code = 'PRODUCT_HAS_HISTORY';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('Product has history; archive it instead');
  }
}

export class ProductImageInvalidError extends DomainError {
  readonly code = 'PRODUCT_IMAGE_INVALID';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor(message: string) {
    super(message);
  }
}

export class ProductImageTooLargeError extends DomainError {
  readonly code = 'PRODUCT_IMAGE_TOO_LARGE';
  readonly httpStatus = HttpStatus.PAYLOAD_TOO_LARGE;
  constructor() {
    super('Image exceeds 2MB');
  }
}
