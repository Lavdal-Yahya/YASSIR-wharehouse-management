// Base class for all domain-level errors. Subclasses supply a stable `code` that
// doubles as the frontend i18n translation key (architecture.md §3.9).
// Never wrap a domain error into HttpException by hand — the global
// DomainExceptionFilter maps `code` + `httpStatus` to the response shape.

export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
