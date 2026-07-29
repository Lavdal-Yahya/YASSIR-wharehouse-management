export type OrderStatus =
  | 'ORDERED'
  | 'SHIPPED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type IncomingOrder = {
  id: string;
  referenceNumber: string;
  supplierName: string | null;
  orderDate: string;
  expectedArrivalDate: string | null;
  status: OrderStatus;
  notes: string | null;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  totalOrdered: number;
  totalReceived: number;
  totalRemaining: number;
};

export type IncomingOrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number | null;
  notes: string | null;
};

export type IncomingOrderReceiptLink = {
  id: string;
  referenceNumber: string;
  receiptDate: string;
};

export type IncomingOrderDetail = IncomingOrder & {
  items: IncomingOrderItem[];
  receipts: IncomingOrderReceiptLink[];
};

export type CreateOrderItemBody =
  | {
      productId: string;
      quantityOrdered: number;
      unitCost?: number;
      notes?: string | null;
    }
  | {
      newProduct: {
        name: string;
        categoryId: string;
        sku?: string | null;
        barcode?: string | null;
        defaultPurchaseCost?: number;
        defaultSalePrice?: number;
        lowStockThreshold?: number;
      };
      quantityOrdered: number;
      unitCost?: number;
      notes?: string | null;
    };

export type CreateOrderBody = {
  supplierName?: string | null;
  orderDate: string;
  expectedArrivalDate?: string;
  notes?: string | null;
  items: CreateOrderItemBody[];
};

export type OrdersSummary = {
  orderCount: number;
  totalUnitsOrdered: number;
  totalUnitsReceived: number;
  totalValue: number;
  itemsMissingCost: number;
};

export type ReceiveOrderBody = {
  receiptDate?: string;
  notes?: string | null;
  items: Array<{ orderItemId: string; quantity: number }>;
};
