import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import {
  computeShopCashOnHand,
  computeWarehouseCash,
} from './common/money-quantities';

// Point-in-time cash-on-hand across the business. Not a period report —
// no from/to. `asOf` defaults to now; passing an earlier date returns
// the balance as of that instant (useful for reconciliation).
//
// Shop cash-on-hand = Σ cash-at-sale + Σ later payments − Σ expenses − Σ remittances
// Warehouse cash    = Σ active remittances (no warehouse expenses yet)
//
// Scope semantics:
//   OWNER  — returns warehouseCash + every active shop
//   SHOP   — returns { shops: [own shop only] }; warehouseCash omitted
//   WAREHOUSE — returns warehouseCash + every active shop (visibility
//               matches their receiving role)

export type ShopCashRow = {
  shopId: string;
  shopName: string;
  cashOnHand: number;
};

export type CashOnHandOut = {
  asOf: Date;
  warehouseCash: number | null; // null when SHOP role — no warehouse view
  shops: ShopCashRow[];
};

@Injectable()
export class CashOnHandService {
  constructor(private readonly prisma: PrismaService) {}

  async build(asOfInput: string | undefined, user: SessionUser): Promise<CashOnHandOut> {
    const asOf = asOfInput ? new Date(asOfInput) : new Date();

    if (user.role === Role.SHOP) {
      if (!user.assignedShopId) {
        return { asOf, warehouseCash: null, shops: [] };
      }
      const shop = await this.prisma.shop.findUnique({
        where: { id: user.assignedShopId },
        select: { id: true, name: true },
      });
      if (!shop) return { asOf, warehouseCash: null, shops: [] };
      const cashOnHand = await computeShopCashOnHand(this.prisma, shop.id, asOf);
      return {
        asOf,
        warehouseCash: null,
        shops: [{ shopId: shop.id, shopName: shop.name, cashOnHand }],
      };
    }

    // OWNER or WAREHOUSE: everything.
    const [shops, warehouseCash] = await Promise.all([
      this.prisma.shop.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      computeWarehouseCash(this.prisma, asOf),
    ]);
    const perShop = await Promise.all(
      shops.map(async (s) => ({
        shopId: s.id,
        shopName: s.name,
        cashOnHand: await computeShopCashOnHand(this.prisma, s.id, asOf),
      })),
    );
    return { asOf, warehouseCash, shops: perShop };
  }
}
