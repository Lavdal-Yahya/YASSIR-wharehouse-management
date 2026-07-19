export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string;
  categoryName: string;
  description: string | null;
  imageUrl: string | null;
  defaultPurchaseCost: number | null;
  defaultSalePrice: number | null;
  lowStockThreshold: number | null;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductWriteBody = {
  name: string;
  categoryId: string;
  sku?: string | null;
  barcode?: string | null;
  description?: string | null;
  defaultPurchaseCost?: number | null;
  defaultSalePrice?: number | null;
  lowStockThreshold?: number | null;
};
