import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain-error';

// Generic domain errors reused across modules. Feature-specific errors
// (e.g. LAST_OWNER_PROTECTED, PRODUCT_HAS_HISTORY) live in their own module.

export class ResourceNotFoundError extends DomainError {
  readonly code: string;
  readonly httpStatus = HttpStatus.NOT_FOUND;
  constructor(resource: string, id?: string) {
    super(id ? `${resource} ${id} not found` : `${resource} not found`);
    this.code = `${resource.toUpperCase()}_NOT_FOUND`;
  }
}

export class UniqueConflictError extends DomainError {
  readonly code: string;
  readonly httpStatus = HttpStatus.CONFLICT;
  constructor(resource: string, field: string) {
    super(`${resource} already exists with this ${field}`);
    this.code = `${resource.toUpperCase()}_${field.toUpperCase()}_TAKEN`;
  }
}
