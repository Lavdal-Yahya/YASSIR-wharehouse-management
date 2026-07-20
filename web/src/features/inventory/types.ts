export type BalanceRow = {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  sku: string | null;
  barcode: string | null;
  imageUrl: string | null;
  quantity: number;
  lowStockThreshold: number | null;
  effectiveThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  suggestedSalePrice: number | null;
};

export type MovementRow = {
  id: string;
  productId: string;
  productName: string;
  movementType:
    | 'OPENING_STOCK'
    | 'ORDER_RECEIPT'
    | 'DIRECT_RECEIPT'
    | 'TRANSFER'
    | 'SALE'
    | 'SALE_CANCELLATION'
    | 'CUSTOMER_RETURN'
    | 'STOCK_CORRECTION';
  quantity: number;
  sourceLocationId: string | null;
  sourceLocationName: string | null;
  destinationLocationId: string | null;
  destinationLocationName: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  relatedEntityReference: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
};

export type StockCorrection = {
  id: string;
  referenceNumber: string;
  locationId: string;
  locationName: string;
  productId: string;
  productName: string;
  adjustmentQuantity: number;
  reason: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
};
