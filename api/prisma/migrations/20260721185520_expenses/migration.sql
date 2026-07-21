-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" INTEGER NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_referenceNumber_key" ON "Expense"("referenceNumber");

-- CreateIndex
CREATE INDEX "Expense_shopId_expenseDate_idx" ON "Expense"("shopId", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-added CHECK per schema-review §4. Zero or negative expense is
-- nonsensical and would corrupt the collected−expenses aggregation the
-- shop report shows. The service rejects it first with a specific code;
-- this CHECK is the last line of defence.
ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_positive
  CHECK ("amount" > 0);
