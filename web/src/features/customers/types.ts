export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerWriteBody = {
  name: string;
  phone?: string | null;
  notes?: string | null;
};

export type CustomerSummary = {
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
};
