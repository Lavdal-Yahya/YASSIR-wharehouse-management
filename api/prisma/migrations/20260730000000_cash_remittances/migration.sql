-- Cash remittances: shop → central warehouse cash drops. Cash-on-hand
-- is derived, no persistent balance row. ACTIVE rows debit shop cash and
-- credit warehouse cash; CANCELLED rows are frozen in history and drop
-- out of every active total, same pattern as Sale / Expense / Payment.

-- CreateEnum
CREATE TYPE "RemittanceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "CashRemittance" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remittanceDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "RemittanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashRemittance_referenceNumber_key" ON "CashRemittance"("referenceNumber");

-- CreateIndex
CREATE INDEX "CashRemittance_shopId_remittanceDate_idx" ON "CashRemittance"("shopId", "remittanceDate");

-- CreateIndex
CREATE INDEX "CashRemittance_status_idx" ON "CashRemittance"("status");

-- AddForeignKey
ALTER TABLE "CashRemittance" ADD CONSTRAINT "CashRemittance_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bootstrap the remittance reference counter so ReferenceService.next('RMT')
-- resolves on the very first request.
INSERT INTO "ReferenceCounter" ("kind", "value") VALUES ('RMT', 0)
ON CONFLICT ("kind") DO NOTHING;
