-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIALLY_PAID', 'UNPAID');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerNameSnapshot" TEXT,
    "customerPhoneSnapshot" TEXT,
    "status" "SaleStatus" NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" "PaymentStatus" NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "amountPaidAtSale" INTEGER NOT NULL DEFAULT 0,
    "amountPaid" INTEGER NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productNameSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "unitCostSnapshot" INTEGER,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_referenceNumber_key" ON "Sale"("referenceNumber");

-- CreateIndex
CREATE INDEX "Sale_shopId_saleDate_idx" ON "Sale"("shopId", "saleDate");

-- CreateIndex
CREATE INDEX "Sale_customerId_paymentStatus_idx" ON "Sale"("customerId", "paymentStatus");

-- CreateIndex
CREATE INDEX "Sale_saleDate_idx" ON "Sale"("saleDate");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added CHECKs per schema-review §2. These put the coherence rules
-- into the database itself: a debt sale without a customer, an over-paid
-- sale, or a line where lineTotal ≠ quantity × unitPrice becomes
-- unrepresentable rather than merely validated.
ALTER TABLE "Sale" ADD CONSTRAINT sale_amounts_coherent
  CHECK ("amountPaid" >= 0 AND "amountPaid" <= "totalAmount"
     AND "amountDue" = "totalAmount" - "amountPaid"
     AND "amountPaidAtSale" >= 0 AND "amountPaidAtSale" <= "amountPaid");
ALTER TABLE "Sale" ADD CONSTRAINT sale_debt_requires_customer
  CHECK ("amountDue" = 0 OR "customerId" IS NOT NULL);
ALTER TABLE "SaleItem" ADD CONSTRAINT sale_item_coherent
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineTotal" = "quantity" * "unitPrice");
