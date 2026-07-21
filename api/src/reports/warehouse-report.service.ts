import { Injectable } from '@nestjs/common';
import { LocationType, MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import { resolveReportScope } from './common/report-scope';

// P7-05 — the warehouse-side report. Scope is always the central
// warehouse (spec §43: v1 has exactly one). Reads over the movement
// ledger + InventoryBalance from Phase 3; no money model involvement.
//
// Numbers (over the date window unless noted):
//   * currentStock     — Σ InventoryBalance.quantity for the warehouse
//                        (as-of; date window ignored, same as-of shape
//                        as the money-side outstanding).
//   * received         — units flowing IN to the warehouse via
//                        ORDER_RECEIPT or DIRECT_RECEIPT movements.
//   * transferredOut   — units flowing OUT to shops via TRANSFER.
//   * corrections      — +/- from STOCK_CORRECTION movements.
//   * distinctProducts — count of products with any balance row
//                        (as-of); the catalog denominator for
//                        low/out-of-stock ratios.
//   * lowStockCount    — products where balance ≤ effective threshold
//                        (product-specific or the settings default).
//   * outOfStockCount  — products at exactly zero.
//
// Roles: OWNER (all warehouse ops) · WAREHOUSE (their remit); SHOP
// never appears — the shop's own inventory page is at /inventory,
// scoped by their assignedShopId.

const DEFAULT_LOW_STOCK_KEY = 'defaultLowStockThreshold';

export type WarehouseReportOut = {
  scope: {
    warehouseId: string;
    from: Date | null;
    to: Date | null;
  };
  currentStock: number;
  distinctProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  received: {
    orderReceipts: number; // via IncomingOrder → ReceiveService
    directReceipts: number; // direct-to-warehouse (P3-07)
    total: number;
  };
  transferredOut: number; // units leaving via TRANSFER
  corrections: {
    up: number; // absolute units added by +corrections
    down: number; // absolute units removed by -corrections
    net: number; // up − down
  };
};

@Injectable()
export class WarehouseReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filter: ReportFilterDto, user: SessionUser): Promise<WarehouseReportOut> {
    // Warehouse reports ignore filter.shopId (there's no shop scope
    // here) but the resolver still normalises the date window to UTC
    // and enforces the OutstandingScope's no-from rule where needed.
    const scope = resolveReportScope(user, {
      from: filter.from,
      to: filter.to,
      shopId: undefined,
    });

    const warehouse = await this.prisma.location.findFirst({
      where: { type: LocationType.WAREHOUSE, shopId: null },
      select: { id: true },
    });
    if (!warehouse) throw new ResourceNotFoundError('Location', 'central-warehouse');
    const warehouseId = warehouse.id;

    // Date range for movements — reused across all "flow" numbers.
    const dateRange: Prisma.DateTimeFilter | undefined =
      scope.from || scope.to
        ? {
            ...(scope.from ? { gte: scope.from } : {}),
            ...(scope.to ? { lte: scope.to } : {}),
          }
        : undefined;

    // Current stock is as-of, not date-bound (same shape as
    // computeOutstanding — a truckload received in March is still on
    // the shelf in June regardless of the report window).
    const [stockAgg, distinctAgg, balances, defaultThresholdRow] =
      await Promise.all([
        this.prisma.inventoryBalance.aggregate({
          where: { locationId: warehouseId },
          _sum: { quantity: true },
        }),
        this.prisma.inventoryBalance.count({
          where: { locationId: warehouseId, quantity: { gt: 0 } },
        }),
        this.prisma.inventoryBalance.findMany({
          where: { locationId: warehouseId },
          select: {
            quantity: true,
            product: { select: { lowStockThreshold: true, active: true } },
          },
        }),
        this.prisma.appSetting.findUnique({
          where: { key: DEFAULT_LOW_STOCK_KEY },
        }),
      ]);
    const defaultThreshold = defaultThresholdRow
      ? parseInt(defaultThresholdRow.value, 10) || 0
      : 0;

    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const b of balances) {
      if (!b.product.active) continue; // archived products don't count
      if (b.quantity === 0) {
        outOfStockCount += 1;
        continue;
      }
      const threshold = b.product.lowStockThreshold ?? defaultThreshold;
      if (b.quantity <= threshold) lowStockCount += 1;
    }

    // Inflows: destination = warehouse, ORDER_RECEIPT or DIRECT_RECEIPT.
    // Sum via one grouped query so we get both types in a single round-trip.
    const inflowAgg = await this.prisma.inventoryMovement.groupBy({
      by: ['movementType'],
      where: {
        destinationLocationId: warehouseId,
        movementType: {
          in: [MovementType.ORDER_RECEIPT, MovementType.DIRECT_RECEIPT],
        },
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      _sum: { quantity: true },
    });
    let orderReceipts = 0;
    let directReceipts = 0;
    for (const row of inflowAgg) {
      const q = row._sum.quantity ?? 0;
      if (row.movementType === MovementType.ORDER_RECEIPT) orderReceipts = q;
      else if (row.movementType === MovementType.DIRECT_RECEIPT) directReceipts = q;
    }

    // Transfers out: source = warehouse, type TRANSFER.
    const outflowAgg = await this.prisma.inventoryMovement.aggregate({
      where: {
        sourceLocationId: warehouseId,
        movementType: MovementType.TRANSFER,
        ...(dateRange ? { createdAt: dateRange } : {}),
      },
      _sum: { quantity: true },
    });
    const transferredOut = outflowAgg._sum.quantity ?? 0;

    // Corrections: same table, direction encoded by source/destination
    // (D-011). +correction has destinationLocationId set; -correction
    // has sourceLocationId set.
    const [correctionsUp, correctionsDown] = await Promise.all([
      this.prisma.inventoryMovement.aggregate({
        where: {
          destinationLocationId: warehouseId,
          movementType: MovementType.STOCK_CORRECTION,
          ...(dateRange ? { createdAt: dateRange } : {}),
        },
        _sum: { quantity: true },
      }),
      this.prisma.inventoryMovement.aggregate({
        where: {
          sourceLocationId: warehouseId,
          movementType: MovementType.STOCK_CORRECTION,
          ...(dateRange ? { createdAt: dateRange } : {}),
        },
        _sum: { quantity: true },
      }),
    ]);
    const up = correctionsUp._sum.quantity ?? 0;
    const down = correctionsDown._sum.quantity ?? 0;

    return {
      scope: { warehouseId, from: scope.from, to: scope.to },
      currentStock: stockAgg._sum.quantity ?? 0,
      distinctProducts: distinctAgg,
      lowStockCount,
      outOfStockCount,
      received: {
        orderReceipts,
        directReceipts,
        total: orderReceipts + directReceipts,
      },
      transferredOut,
      corrections: { up, down, net: up - down },
    };
  }
}
