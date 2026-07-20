export type StockReceipt = {
  id: string;
  referenceNumber: string;
  incomingOrderId: string | null;
  incomingOrderReference: string | null;
  supplierName: string | null;
  receiptDate: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  itemCount: number;
  totalQuantity: number;
};

export type StockReceiptItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number | null;
};

export type StockReceiptDetail = StockReceipt & { items: StockReceiptItem[] };

export type CreateDirectReceiptBody = {
  receiptDate?: string;
  supplierName?: string | null;
  notes?: string | null;
  items: Array<{ productId: string; quantity: number; unitCost?: number }>;
};
