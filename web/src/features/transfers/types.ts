export type TransferStatus = 'COMPLETED' | 'REVERSED';

export type TransferItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
};

export type Transfer = {
  id: string;
  referenceNumber: string;
  sourceLocationId: string;
  sourceLocationName: string;
  destinationLocationId: string;
  destinationLocationName: string;
  status: TransferStatus;
  transferDate: string;
  notes: string | null;
  createdBy: string;
  reversedBy: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  itemCount: number;
  totalQuantity: number;
};

export type TransferDetail = Transfer & {
  items: TransferItem[];
};

export type CreateTransferBody = {
  sourceLocationId: string;
  destinationLocationId: string;
  transferDate: string;
  notes?: string | null;
  items: Array<{ productId: string; quantity: number }>;
};

export type ReverseTransferBody = { reason: string };
