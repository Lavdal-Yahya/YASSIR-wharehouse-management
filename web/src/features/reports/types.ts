// Wire-format mirrors of the API report shapes. Kept in this feature
// (not /shared) because they belong to the reports domain and never
// travel to other features. Money is whole MRU (D-004).

export type ReportFilter = {
  shopId?: string;
  from?: string;
  to?: string;
};

export type ShopReport = {
  scope: {
    shopId: string | null;
    from: string | null;
    to: string | null;
  };
  salesValue: number;
  cashAtSale: number;
  laterPayments: number;
  totalCollected: number;
  newDebt: number;
  outstanding: number;
  expenses: number;
  netCollected: number;
};

export type WarehouseReport = {
  scope: {
    warehouseId: string;
    from: string | null;
    to: string | null;
  };
  currentStock: number;
  distinctProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  received: {
    orderReceipts: number;
    directReceipts: number;
    total: number;
  };
  transferredOut: number;
  corrections: { up: number; down: number; net: number };
};

export type SalesReport = {
  scope: { shopId: string | null; from: string | null; to: string | null };
  byStatus: Array<{
    paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
    salesCount: number;
    salesValue: number;
    amountPaidAtSale: number;
    amountDue: number;
  }>;
  byShop: Array<{
    shopId: string;
    shopName: string;
    salesCount: number;
    salesValue: number;
    cashAtSale: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    unitsSold: number;
    revenue: number;
  }>;
  byDate: Array<{
    date: string;
    salesCount: number;
    salesValue: number;
    cashAtSale: number;
  }>;
};

export type DebtReport = {
  scope: { shopId: string | null; from: string | null; to: string | null };
  outstandingByCustomer: Array<{
    customerId: string;
    customerName: string;
    customerPhone: string | null;
    outstanding: number;
    unpaidSalesCount: number;
    partialSalesCount: number;
  }>;
  outstandingByShop: Array<{
    shopId: string;
    shopName: string;
    outstanding: number;
    debtorsCount: number;
  }>;
  paymentsInPeriod: Array<{
    paymentId: string;
    referenceNumber: string;
    customerId: string;
    customerName: string;
    shopId: string;
    shopName: string;
    amount: number;
    paymentDate: string;
  }>;
};

export type IncomingOrdersReport = {
  scope: { from: string | null; to: string | null };
  byStatus: Array<{
    status:
      | 'ORDERED'
      | 'SHIPPED'
      | 'PARTIALLY_RECEIVED'
      | 'RECEIVED'
      | 'CANCELLED';
    ordersCount: number;
    orderedUnits: number;
    receivedUnits: number;
    remainingUnits: number;
  }>;
  recentOrders: Array<{
    id: string;
    referenceNumber: string;
    supplierName: string | null;
    orderDate: string;
    expectedArrivalDate: string | null;
    status:
      | 'ORDERED'
      | 'SHIPPED'
      | 'PARTIALLY_RECEIVED'
      | 'RECEIVED'
      | 'CANCELLED';
    orderedUnits: number;
    receivedUnits: number;
    remainingUnits: number;
  }>;
};

export type EstimatedProfit = {
  scope: { shopId: string | null; from: string | null; to: string | null };
  salesValue: number;
  cogs: number;
  grossEstimated: number;
  coverage: {
    lineCount: number;
    linesWithCost: number;
    ratio: number;
  };
  // Response NEVER carries netProfit; spec §27. The UI shows
  // "estimated" whenever isEstimated is true.
  isEstimated: boolean;
};
