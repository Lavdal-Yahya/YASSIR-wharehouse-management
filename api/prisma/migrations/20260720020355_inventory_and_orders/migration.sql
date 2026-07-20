-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ORDERED', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('OPENING_STOCK', 'ORDER_RECEIPT', 'DIRECT_RECEIPT', 'TRANSFER', 'SALE', 'SALE_CANCELLATION', 'CUSTOMER_RETURN', 'STOCK_CORRECTION');

-- CreateTable
CREATE TABLE "ReferenceCounter" (
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReferenceCounter_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "IncomingOrder" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "supplierName" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedArrivalDate" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'ORDERED',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomingOrderItem" (
    "id" TEXT NOT NULL,
    "incomingOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityOrdered" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "unitCost" INTEGER,
    "notes" TEXT,

    CONSTRAINT "IncomingOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "incomingOrderId" TEXT,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "supplierName" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceiptItem" (
    "id" TEXT NOT NULL,
    "stockReceiptId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" INTEGER,

    CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sourceLocationId" TEXT,
    "destinationLocationId" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCorrection" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "adjustmentQuantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomingOrder_referenceNumber_key" ON "IncomingOrder"("referenceNumber");

-- CreateIndex
CREATE INDEX "IncomingOrder_status_orderDate_idx" ON "IncomingOrder"("status", "orderDate");

-- CreateIndex
CREATE INDEX "IncomingOrder_orderDate_idx" ON "IncomingOrder"("orderDate");

-- CreateIndex
CREATE INDEX "IncomingOrderItem_incomingOrderId_idx" ON "IncomingOrderItem"("incomingOrderId");

-- CreateIndex
CREATE INDEX "IncomingOrderItem_productId_idx" ON "IncomingOrderItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_referenceNumber_key" ON "StockReceipt"("referenceNumber");

-- CreateIndex
CREATE INDEX "StockReceipt_incomingOrderId_idx" ON "StockReceipt"("incomingOrderId");

-- CreateIndex
CREATE INDEX "StockReceipt_receiptDate_idx" ON "StockReceipt"("receiptDate");

-- CreateIndex
CREATE INDEX "StockReceiptItem_productId_idx" ON "StockReceiptItem"("productId");

-- CreateIndex
CREATE INDEX "InventoryBalance_productId_idx" ON "InventoryBalance"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_locationId_productId_key" ON "InventoryBalance"("locationId", "productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_sourceLocationId_idx" ON "InventoryMovement"("sourceLocationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_destinationLocationId_idx" ON "InventoryMovement"("destinationLocationId");

-- CreateIndex
CREATE INDEX "InventoryMovement_relatedEntityType_relatedEntityId_idx" ON "InventoryMovement"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCorrection_referenceNumber_key" ON "StockCorrection"("referenceNumber");

-- CreateIndex
CREATE INDEX "StockCorrection_locationId_productId_idx" ON "StockCorrection"("locationId", "productId");

-- AddForeignKey
ALTER TABLE "IncomingOrderItem" ADD CONSTRAINT "IncomingOrderItem_incomingOrderId_fkey" FOREIGN KEY ("incomingOrderId") REFERENCES "IncomingOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingOrderItem" ADD CONSTRAINT "IncomingOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_incomingOrderId_fkey" FOREIGN KEY ("incomingOrderId") REFERENCES "IncomingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCorrection" ADD CONSTRAINT "StockCorrection_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCorrection" ADD CONSTRAINT "StockCorrection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (phase-3.md §1). Prisma cannot express these.
-- Backstop for the InventoryService chokepoint (D-008) and the received-within-
-- ordered rule (spec §11.6).
-- ---------------------------------------------------------------------------

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT balance_non_negative
  CHECK ("quantity" >= 0);

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT movement_qty_positive
  CHECK ("quantity" > 0);

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT movement_has_side
  CHECK ("sourceLocationId" IS NOT NULL OR "destinationLocationId" IS NOT NULL);

ALTER TABLE "IncomingOrderItem"
  ADD CONSTRAINT received_within_ordered
  CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= "quantityOrdered");

-- ---------------------------------------------------------------------------
-- Bootstrap the 7 reference counters (ORD/REC/TRF/SAL/PAY/EXP/ADJ). The seed
-- re-asserts these, but doing it here means a fresh migrate-deploy has them
-- before any request can call ReferenceService.next().
-- ---------------------------------------------------------------------------

INSERT INTO "ReferenceCounter" ("kind", "value") VALUES
  ('ORD', 0), ('REC', 0), ('TRF', 0),
  ('SAL', 0), ('PAY', 0), ('EXP', 0),
  ('ADJ', 0)
ON CONFLICT ("kind") DO NOTHING;
