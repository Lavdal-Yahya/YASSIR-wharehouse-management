import { Injectable } from '@nestjs/common';
import {
  CustomerPaymentStatus,
  MovementType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { SessionUser } from '../common/types/session-user';
import { InventoryService, MovementInput } from '../inventory/inventory.service';
import type { CancelSaleDto } from './dto/sale.dto';
import {
  SaleHasActivePaymentsError,
  SaleNotCancellableError,
  SaleNotFoundError,
} from './errors';
import { SaleDetail, SalesService } from './sales.service';

// Sale cancellation (P6-10 + P6-11). OWNER only (guarded at the
// controller). One transaction:
//
//   1. Lock the sale row and check status = ACTIVE. Double-cancel is
//      a hard 409 (SALE_NOT_CANCELLABLE) — silent success would mask
//      operator confusion about which sale they intended to cancel.
//
//   2. Look up any ACTIVE payment allocations pointing at this sale
//      (payment.status = ACTIVE ∧ sale.status = ACTIVE; D-013). If
//      any exist, refuse with SALE_HAS_ACTIVE_PAYMENTS and hand back
//      the blocking payment references. We do NOT auto-cascade the
//      reversals — money movements should never be implicit (spec
//      §24.2, phase-6 §5). The owner reverses each payment
//      deliberately, then re-cancels.
//
//   3. Batch applyMovements one SALE_CANCELLATION per item with
//      destination = the shop's location — the mirror of the original
//      SALE (D-011). Stock lands back on the same balance the sale
//      deducted from.
//
//   4. Set status = CANCELLED with cancelledBy/At/reason. The sale's
//      amountDue and amountPaidAtSale rows are NOT patched — active
//      totals (Phase 7 reports, customer outstanding, cash-collected)
//      all filter status = ACTIVE, so a cancelled sale simply drops
//      out. Preserving the last recorded state means history stays
//      auditable (spec §16.5, §25).

@Injectable()
export class SaleCancellationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly sales: SalesService,
  ) {}

  async cancel(
    id: string,
    dto: CancelSaleDto,
    user: SessionUser,
  ): Promise<SaleDetail> {
    await this.prisma.$transaction(async (tx) => {
      // Lock the sale. Two concurrent cancels must serialize so the
      // second sees status = CANCELLED and refuses.
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: SaleStatus;
          shopId: string;
        }>
      >`
        SELECT "id", "status", "shopId"
          FROM "Sale"
         WHERE "id" = ${id}
         FOR UPDATE
      `;
      if (rows.length === 0) throw new SaleNotFoundError(id);
      const sale = rows[0]!;
      if (sale.status !== SaleStatus.ACTIVE) {
        throw new SaleNotCancellableError(sale.status);
      }

      // Refuse cancellation while any ACTIVE payment allocation points at
      // this sale. Read the blocking payment refs and hand them to the UI
      // so the operator can reverse each one explicitly.
      const blocking = await tx.paymentAllocation.findMany({
        where: {
          saleId: id,
          payment: { status: CustomerPaymentStatus.ACTIVE },
        },
        select: {
          payment: { select: { referenceNumber: true } },
        },
      });
      if (blocking.length > 0) {
        const refs = [
          ...new Set(blocking.map((b) => b.payment.referenceNumber)),
        ].sort();
        throw new SaleHasActivePaymentsError(id, refs);
      }

      // Return stock. The sale was deducted from the shop's paired
      // Location — mirror that with SALE_CANCELLATION destined for the
      // same location.
      const shop = await tx.shop.findUnique({
        where: { id: sale.shopId },
        include: { location: { select: { id: true } } },
      });
      if (!shop || !shop.location) {
        // Data invariant: every Shop has a paired Location (P2-07). If
        // we ever land here the DB is in a broken state — surface as a
        // 404 so the operator retries rather than crashes.
        throw new ResourceNotFoundError('Location', sale.shopId);
      }

      const items = await tx.saleItem.findMany({
        where: { saleId: id },
        select: { productId: true, quantity: true },
        orderBy: { id: 'asc' },
      });
      // A confirmed sale always has ≥1 item (the confirmation service
      // rejects empty carts). Guard anyway — nothing to return means
      // nothing to do on the stock side.
      const movements: MovementInput[] = items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        movementType: MovementType.SALE_CANCELLATION,
        destinationLocationId: shop.location!.id,
        relatedEntityType: 'Sale',
        relatedEntityId: id,
        createdBy: user.id,
      }));
      if (movements.length > 0) {
        await this.inventory.applyMovements(tx, movements);
      }

      await tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledBy: user.id,
          cancelledAt: new Date(),
          cancellationReason: dto.reason,
        },
      });
    });

    // findOne (no user) — the caller was OWNER (controller guard); a
    // future SHOP-triggered cancel path would need to re-check scope.
    return this.sales.findOne(id);
  }
}
