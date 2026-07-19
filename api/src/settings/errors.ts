import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Defense-in-depth: forbidNonWhitelisted on the DTO catches these first, but
// if a future DTO field is added by mistake we still want a mapped domain
// error, not an anonymous 500.
export class SettingKeyNotWritableError extends DomainError {
  readonly code = 'SETTING_KEY_NOT_WRITABLE';
  readonly httpStatus = HttpStatus.BAD_REQUEST;
  constructor(key: string) {
    super(`Setting '${key}' is not writable`);
  }
}
