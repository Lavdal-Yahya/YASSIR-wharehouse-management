// Wire-format mirrors of the API sale shapes (api/src/sales/sales.service.ts).
// Money is whole MRU (D-004). Snapshots are read-only for the UI —
// the receipts and history render exactly what was written at sale time.

export type SaleStatus = 'ACTIVE' | 'CANCELLED';
export type PaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';

export type SaleItem = {
  id: string;
  productId: string;
  productName: string; // snapshot at sale time
  quantity: number;
  unitPrice: number;
  unitCostSnapshot: number | null;
  lineTotal: number;
};

export type Sale = {
  id: string;
  referenceNumber: string;
  shopId: string;
  shopName: string;
  customerId: string | null;
  customerName: string | null; // snapshot
  customerPhone: string | null; // snapshot
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  amountPaidAtSale: number;
  amountPaid: number;
  amountDue: number;
  saleDate: string;
  notes: string | null;
  createdBy: string;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  itemCount: number;
};

export type SaleDetail = Sale & { items: SaleItem[] };

export type CreateSaleItemBody = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export type CreateSaleBody = {
  shopId: string;
  saleDate?: string;
  // Exactly one of customerId or newCustomer, or neither (only legal when
  // amountPaidAtSale >= totalAmount — the server rejects otherwise).
  customerId?: string;
  newCustomer?: { name: string; phone?: string | null };
  amountPaidAtSale: number;
  notes?: string | null;
  items: CreateSaleItemBody[];
};

export type CancelSaleBody = { reason: string };
