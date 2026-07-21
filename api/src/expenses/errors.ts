import { HttpStatus } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';

// Domain errors for expenses (Phase 7). Codes double as frontend i18n
// keys (architecture §3.9). Editing/cancelling anything but an ACTIVE
// expense is a hard 409 so a double-cancel from an out-of-date UI
// surfaces as a clear "already cancelled" rather than silent success.

export class ExpenseNotFoundError extends DomainError {
  readonly code = 'EXPENSE_NOT_FOUND';
  readonly httpStatus = HttpStatus.NOT_FOUND;
  readonly expenseId: string;
  constructor(expenseId: string) {
    super(`Expense ${expenseId} not found`);
    this.expenseId = expenseId;
  }
}

export class ExpenseNotCancellableError extends DomainError {
  readonly code = 'EXPENSE_NOT_CANCELLABLE';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly status: string;
  constructor(status: string) {
    super(`Expense in status ${status} cannot be cancelled`);
    this.status = status;
  }
}

// Editing a cancelled expense is disallowed for the same reason: the
// record is frozen for the audit trail. Reopen via a new expense
// rather than mutating the cancelled row.
export class ExpenseNotEditableError extends DomainError {
  readonly code = 'EXPENSE_NOT_EDITABLE';
  readonly httpStatus = HttpStatus.CONFLICT;
  readonly status: string;
  constructor(status: string) {
    super(`Expense in status ${status} cannot be edited`);
    this.status = status;
  }
}
