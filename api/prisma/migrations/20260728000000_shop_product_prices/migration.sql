-- Per-shop sale price overrides. Sale price is a shop decision; the
-- warehouse only tracks purchase cost. Seed one row per (shop, product)
-- pair that has an inventory balance row today, using Product.defaultSalePrice
-- when non-null so existing stock keeps its price on rollout.

-- CreateTable
CREATE TABLE "ShopProductPrice" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopProductPrice_shopId_productId_key" ON "ShopProductPrice"("shopId", "productId");

-- CreateIndex
CREATE INDEX "ShopProductPrice_productId_idx" ON "ShopProductPrice"("productId");

-- AddForeignKey
ALTER TABLE "ShopProductPrice" ADD CONSTRAINT "ShopProductPrice_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopProductPrice" ADD CONSTRAINT "ShopProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data seed: preserve current sale prices for every product that already
-- lives at a shop. Products never touched by a shop stay unseeded — the
-- clerk will set the price the first time they sell one.
INSERT INTO "ShopProductPrice" ("id", "shopId", "productId", "salePrice", "updatedAt")
SELECT
    'seed_' || substr(md5(random()::text || l."shopId" || ib."productId"), 1, 20),
    l."shopId",
    ib."productId",
    p."defaultSalePrice",
    NOW()
FROM "InventoryBalance" ib
JOIN "Location" l ON l."id" = ib."locationId" AND l."type" = 'SHOP' AND l."shopId" IS NOT NULL
JOIN "Product" p ON p."id" = ib."productId"
WHERE p."defaultSalePrice" IS NOT NULL
ON CONFLICT ("shopId", "productId") DO NOTHING;
