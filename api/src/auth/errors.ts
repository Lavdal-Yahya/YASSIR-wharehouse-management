import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

export class AuthInvalidCredentialsError extends DomainError {
  readonly code = 'AUTH_INVALID_CREDENTIALS';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    // Deliberately vague so we never leak user existence.
    super('Invalid credentials');
  }
}
