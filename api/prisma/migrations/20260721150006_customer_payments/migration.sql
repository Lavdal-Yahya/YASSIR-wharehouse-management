-- CreateEnum
CREATE TYPE "CustomerPaymentStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "debtBeforePayment" INTEGER NOT NULL,
    "debtAfterPayment" INTEGER NOT NULL,
    "notes" TEXT,
    "status" "CustomerPaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "customerPaymentId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amountAllocated" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_referenceNumber_key" ON "CustomerPayment"("referenceNumber");

-- CreateIndex
CREATE INDEX "CustomerPayment_customerId_paymentDate_idx" ON "CustomerPayment"("customerId", "paymentDate");

-- CreateIndex
CREATE INDEX "CustomerPayment_shopId_paymentDate_idx" ON "CustomerPayment"("shopId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentAllocation_saleId_idx" ON "PaymentAllocation"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_customerPaymentId_saleId_key" ON "PaymentAllocation"("customerPaymentId", "saleId");

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added CHECKs per schema-review §3. These put the two coherence
-- rules into the database itself:
--   * payment_amount_positive: no zero or negative debt payments.
--   * payment_debt_snapshot_coherent: the receipt snapshot must actually
--     equal debtBefore − amount, and debtAfter never goes below zero
--     (overpay is rejected as a service error before we ever try to
--     insert; the CHECK is a last-line-of-defense against any bypass).
--   * allocation_positive: an allocation carrying zero has no meaning
--     and would blur "who was actually touched" during reversal
--     (D-013 recomputes affected sales).
ALTER TABLE "CustomerPayment" ADD CONSTRAINT payment_amount_positive
  CHECK ("amount" > 0);
ALTER TABLE "CustomerPayment" ADD CONSTRAINT payment_debt_snapshot_coherent
  CHECK ("debtAfterPayment" = "debtBeforePayment" - "amount"
     AND "debtAfterPayment" >= 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT allocation_positive
  CHECK ("amountAllocated" > 0);
