-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "destinationLocationId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "transferDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "reversedBy" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "stockTransferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockTransfer_referenceNumber_key" ON "StockTransfer"("referenceNumber");

-- CreateIndex
CREATE INDEX "StockTransfer_sourceLocationId_transferDate_idx" ON "StockTransfer"("sourceLocationId", "transferDate");

-- CreateIndex
CREATE INDEX "StockTransfer_destinationLocationId_transferDate_idx" ON "StockTransfer"("destinationLocationId", "transferDate");

-- CreateIndex
CREATE INDEX "StockTransferItem_productId_idx" ON "StockTransferItem"("productId");

-- CreateIndex
CREATE INDEX "StockTransferItem_stockTransferId_idx" ON "StockTransferItem"("stockTransferId");

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_destinationLocationId_fkey" FOREIGN KEY ("destinationLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_stockTransferId_fkey" FOREIGN KEY ("stockTransferId") REFERENCES "StockTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-added CHECK constraints (schema-review §1). Prisma cannot express these.
-- Backstops the transfer service's "source != destination" validation and
-- guarantees no item can carry a zero/negative quantity even if the service
-- were bypassed.
-- ---------------------------------------------------------------------------

ALTER TABLE "StockTransfer"
  ADD CONSTRAINT transfer_distinct_locations
  CHECK ("sourceLocationId" <> "destinationLocationId");

ALTER TABLE "StockTransferItem"
  ADD CONSTRAINT transfer_item_qty_positive
  CHECK ("quantity" > 0);
