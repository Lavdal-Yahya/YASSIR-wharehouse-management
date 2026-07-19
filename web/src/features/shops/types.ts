export type Shop = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  locationId: string | null;
};

export type ShopWriteBody = {
  name: string;
  address?: string | null;
  phone?: string | null;
};
