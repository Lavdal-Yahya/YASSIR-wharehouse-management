import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain rules from phase-2.md §3 (users).

export class UsernameTakenError extends DomainError {
  readonly code = 'USER_USERNAME_TAKEN';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('Username is already in use');
  }
}

export class LastOwnerProtectedError extends DomainError {
  readonly code = 'LAST_OWNER_PROTECTED';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('The last active OWNER cannot be disabled or demoted');
  }
}

export class SelfDisableForbiddenError extends DomainError {
  readonly code = 'USER_SELF_DISABLE_FORBIDDEN';
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor() {
    super('You cannot disable your own account');
  }
}

export class ShopAssignmentInvalidError extends DomainError {
  readonly code = 'USER_SHOP_ASSIGNMENT_INVALID';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor(message: string) {
    super(message);
  }
}

export class PasswordTooShortError extends DomainError {
  readonly code = 'USER_PASSWORD_TOO_SHORT';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor(min: number) {
    super(`Password must be at least ${min} characters`);
  }
}
