import { Injectable } from '@nestjs/common';
import { LocationType, MovementType, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { InventoryService, MovementInput } from '../inventory/inventory.service';
import { ReferenceService } from '../inventory/reference.service';
import { SessionUser } from '../common/types/session-user';
import {
  IncomingOrderDetail,
  IncomingOrdersService,
} from './incoming-orders.service';
import {
  OrderNotEditableError,
  ReceiveEmptyError,
  ReceiveExceedsRemainingError,
} from './errors';
import type { ReceiveIncomingOrderDto } from './dto/incoming-order.dto';

// The receive transaction (P3-05). All 15-ish steps live in one
// prisma.$transaction; a failure at any point rolls back stock, movements,
// receipt, and item updates together — spec §36, architecture §3.4.

@Injectable()
export class ReceiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly refs: ReferenceService,
    private readonly orders: IncomingOrdersService,
  ) {}

  async receive(
    orderId: string,
    dto: ReceiveIncomingOrderDto,
    user: SessionUser,
  ): Promise<IncomingOrderDetail> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Lock the order. This serializes concurrent receives on the same
      //    order — two employees receiving the same shipment at once cannot
      //    corrupt quantityReceived.
      const orderRows = await tx.$queryRaw<
        Array<{ id: string; status: OrderStatus }>
      >`
        SELECT "id", "status"
          FROM "IncomingOrder"
         WHERE "id" = ${orderId}
         FOR UPDATE
      `;
      if (orderRows.length === 0) throw new ResourceNotFoundError('Order', orderId);
      const order = orderRows[0]!;
      if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.RECEIVED) {
        throw new OrderNotEditableError(order.status);
      }

      // 2. Load the order's items + the warehouse location in parallel.
      const [items, warehouse] = await Promise.all([
        tx.incomingOrderItem.findMany({
          where: { incomingOrderId: orderId },
          select: {
            id: true,
            productId: true,
            quantityOrdered: true,
            quantityReceived: true,
            unitCost: true,
          },
        }),
        tx.location.findFirst({
          where: { type: LocationType.WAREHOUSE, shopId: null },
          select: { id: true },
        }),
      ]);
      if (!warehouse) {
        // Seeded on install (phase-1); missing here means the DB was tampered.
        throw new ResourceNotFoundError('Location', 'central-warehouse');
      }

      // 3. Validate the receive lines. Any invalid line aborts the entire
      //    receive — half-receives are not a state we allow.
      const itemsById = new Map(items.map((it) => [it.id, it]));
      const nonZero: Array<{
        item: (typeof items)[number];
        quantity: number;
      }> = [];
      for (const line of dto.items) {
        const it = itemsById.get(line.orderItemId);
        if (!it) throw new ResourceNotFoundError('OrderItem', line.orderItemId);
        if (line.quantity < 0 || !Number.isInteger(line.quantity)) {
          throw new ReceiveExceedsRemainingError(
            line.orderItemId,
            it.quantityOrdered - it.quantityReceived,
          );
        }
        if (line.quantity === 0) continue;
        const remaining = it.quantityOrdered - it.quantityReceived;
        if (line.quantity > remaining) {
          throw new ReceiveExceedsRemainingError(line.orderItemId, remaining);
        }
        nonZero.push({ item: it, quantity: line.quantity });
      }
      if (nonZero.length === 0) throw new ReceiveEmptyError();

      // 4. Create the StockReceipt + items, carrying each line's unitCost
      //    forward from the order item (cost tracking pipeline for Phase 7).
      const receiptRef = await this.refs.next(tx, 'REC');
      const receiptDate = dto.receiptDate ? new Date(dto.receiptDate) : new Date();
      const receipt = await tx.stockReceipt.create({
        data: {
          referenceNumber: receiptRef,
          incomingOrderId: orderId,
          receiptDate,
          notes: dto.notes ?? null,
          createdBy: user.id,
          items: {
            create: nonZero.map(({ item, quantity }) => ({
              productId: item.productId,
              quantity,
              unitCost: item.unitCost,
            })),
          },
        },
        select: { id: true },
      });

      // 5. Bump quantityReceived per item. Range check is redundant with the
      //    received_within_ordered CHECK constraint (P3-01) but explicit here
      //    keeps the invariant visible in code.
      for (const { item, quantity } of nonZero) {
        await tx.incomingOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: item.quantityReceived + quantity },
        });
      }

      // 6. Apply stock movements — one call, one sorted lock pass across
      //    every affected (warehouse, product) pair (D-011). ORDER_RECEIPT
      //    means destination-only.
      const movements: MovementInput[] = nonZero.map(({ item, quantity }) => ({
        productId: item.productId,
        quantity,
        movementType: MovementType.ORDER_RECEIPT,
        destinationLocationId: warehouse.id,
        relatedEntityType: 'StockReceipt',
        relatedEntityId: receipt.id,
        createdBy: user.id,
      }));
      await this.inventory.applyMovements(tx, movements);

      // 7. Recompute order status from current item state (spec §11.5).
      const nextStatus = deriveOrderStatus(
        items.map((it) => {
          const applied = nonZero.find((n) => n.item.id === it.id);
          return {
            quantityOrdered: it.quantityOrdered,
            quantityReceived: it.quantityReceived + (applied?.quantity ?? 0),
          };
        }),
      );
      if (nextStatus !== order.status) {
        await tx.incomingOrder.update({
          where: { id: orderId },
          data: { status: nextStatus },
        });
      }
    });

    // Read outside the transaction — returns the fresh detail with computed
    // totals and the new receipt in `receipts[]`.
    return this.orders.findOne(orderId);
  }
}

// PARTIALLY_RECEIVED as soon as anything is in, RECEIVED once every line is
// full. ORDERED/SHIPPED are pre-receive states and never re-appear.
function deriveOrderStatus(
  items: Array<{ quantityOrdered: number; quantityReceived: number }>,
): OrderStatus {
  const allFull = items.every((it) => it.quantityReceived >= it.quantityOrdered);
  if (allFull) return OrderStatus.RECEIVED;
  const anyReceived = items.some((it) => it.quantityReceived > 0);
  return anyReceived ? OrderStatus.PARTIALLY_RECEIVED : OrderStatus.ORDERED;
}
