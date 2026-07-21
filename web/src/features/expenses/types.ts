export type ExpenseStatus = 'ACTIVE' | 'CANCELLED';

// Shape matches ExpensesService.mapExpense on the API side. Money is
// whole MRU (D-004). Snapshots are read-only for now — the UI edits
// through PATCH, which restricts to ACTIVE expenses server-side.
export type Expense = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shopName: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  expenseDate: string;
  description: string;
  notes: string | null;
  status: ExpenseStatus;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateExpenseBody = {
  shopId: string;
  categoryId?: string | null;
  amount: number;
  expenseDate?: string;
  description: string;
  notes?: string | null;
};

// PATCH accepts any subset; omitting a field leaves it unchanged. shopId
// is intentionally not editable — see api/src/expenses/dto for the rule.
export type UpdateExpenseBody = {
  categoryId?: string | null;
  amount?: number;
  expenseDate?: string;
  description?: string;
  notes?: string | null;
};

export type CancelExpenseBody = { reason: string };
