import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

export class ShopHasActiveUsersError extends DomainError {
  readonly code = 'SHOP_HAS_ACTIVE_USERS';
  readonly httpStatus = HttpStatus.CONFLICT;
  // Users are surfaced in the response so the UI can list them for the owner.
  constructor(public readonly userIds: string[]) {
    super('Shop still has active assigned users');
  }
}
