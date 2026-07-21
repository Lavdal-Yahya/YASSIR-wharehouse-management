// Base class for all domain-level errors. Subclasses supply a stable `code` that
// doubles as the frontend i18n translation key (architecture.md §3.9).
// Never wrap a domain error into HttpException by hand — the global
// DomainExceptionFilter maps `code` + `httpStatus` to the response shape.
//
// Subclasses may override `details()` to expose structured payload the UI
// needs beyond the message — e.g. SaleHasActivePaymentsError returns the
// list of blocking payment references so the confirmation dialog can render
// them as reversal links. Keep `details` translation-safe: return only
// stable ids and numbers, not localized text (the client i18n renders any
// localized wrapping).
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }

  details(): Record<string, unknown> | undefined {
    return undefined;
  }
}
