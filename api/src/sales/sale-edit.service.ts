import { Injectable } from '@nestjs/common';
import { SaleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSaleDto } from './dto/sale.dto';
import {
  SaleEditItemMismatchError,
  SaleEditWouldOrphanPaymentError,
  SaleNotEditableError,
  SaleNotFoundError,
} from './errors';
import { derivePaymentStatus } from './payment-status';
import { SaleDetail, SalesService } from './sales.service';

// OWNER-only sale edit (P6-13). The physical goods already moved — this
// is purely a book correction so the recorded sale matches what the
// shopkeeper actually did. Consequences:
//
//   - NO stock movements. quantity edits change the recorded amount but
//     do not touch InventoryBalance. The user picked this posture
//     explicitly ("without affecting the remaining quantity of the item
//     in the stock") on the assumption that physical inventory has
//     already drifted from the paper trail.
//
//   - Money is recomputed from scratch: line totals, totalAmount,
//     amountDue, paymentStatus. amountPaid and amountPaidAtSale are
//     preserved.
//
//   - If the new totalAmount would fall below amountPaid, we refuse
//     with SALE_EDIT_WOULD_ORPHAN_PAYMENT. Same posture as cancel: the
//     owner must reverse the customer payment allocations first, then
//     re-issue the edit.
//
//   - Cancelled sales are frozen (SaleNotEditableError) — a cancelled
//     sale is history, editing it would silently rewrite audit trail.

@Injectable()
export class SaleEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  async edit(id: string, dto: UpdateSaleDto): Promise<SaleDetail> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string; status: SaleStatus }>
      >`
        SELECT "id", "status"
          FROM "Sale"
         WHERE "id" = ${id}
         FOR UPDATE
      `;
      if (rows.length === 0) throw new SaleNotFoundError(id);
      const locked = rows[0]!;
      if (locked.status !== SaleStatus.ACTIVE) {
        throw new SaleNotEditableError(locked.status);
      }

      const current = await tx.sale.findUnique({
        where: { id },
        include: { items: { orderBy: { id: 'asc' } } },
      });
      if (!current) throw new SaleNotFoundError(id);

      // Item patches (if any). The DTO enforces "at least one" if the
      // array is present, and set-equality with existing itemIds is
      // checked here — no adds, no removes, and every existing item
      // must show up exactly once.
      let newTotal = current.totalAmount;
      const itemPatches = new Map<
        string,
        { quantity: number; unitPrice: number }
      >();
      if (dto.items) {
        const existingIds = new Set(current.items.map((i) => i.id));
        const patchIds = new Set<string>();
        for (const p of dto.items) {
          if (!existingIds.has(p.itemId)) {
            throw new SaleEditItemMismatchError(
              `item ${p.itemId} does not belong to sale ${id}`,
            );
          }
          if (patchIds.has(p.itemId)) {
            throw new SaleEditItemMismatchError(
              `item ${p.itemId} appears twice in the patch`,
            );
          }
          patchIds.add(p.itemId);
          itemPatches.set(p.itemId, {
            quantity: p.quantity,
            unitPrice: p.unitPrice,
          });
        }
        for (const existing of current.items) {
          if (!patchIds.has(existing.id)) {
            throw new SaleEditItemMismatchError(
              `item ${existing.id} missing from the patch`,
            );
          }
        }
        // Recompute total from patched lines.
        newTotal = 0;
        for (const it of current.items) {
          const patch = itemPatches.get(it.id)!;
          newTotal += patch.quantity * patch.unitPrice;
        }
      }

      // Amount-paid must not exceed the new total. Reject before any
      // write — the DB CHECK would trip too (sale_paid_le_total), but
      // this returns a specific code the UI can localize.
      if (newTotal < current.amountPaid) {
        throw new SaleEditWouldOrphanPaymentError(
          newTotal,
          current.amountPaid,
        );
      }
      // Same check for amountPaidAtSale (schema CHECK backstop).
      if (newTotal < current.amountPaidAtSale) {
        throw new SaleEditWouldOrphanPaymentError(
          newTotal,
          current.amountPaidAtSale,
        );
      }

      // Apply item patches.
      for (const it of current.items) {
        const patch = itemPatches.get(it.id);
        if (!patch) continue;
        if (
          patch.quantity === it.quantity &&
          patch.unitPrice === it.unitPrice
        ) {
          continue;
        }
        await tx.saleItem.update({
          where: { id: it.id },
          data: {
            quantity: patch.quantity,
            unitPrice: patch.unitPrice,
            lineTotal: patch.quantity * patch.unitPrice,
          },
        });
      }

      // Header patch.
      const newPaymentStatus = derivePaymentStatus(
        newTotal,
        current.amountPaid,
      );
      await tx.sale.update({
        where: { id },
        data: {
          totalAmount: newTotal,
          amountDue: newTotal - current.amountPaid,
          paymentStatus: newPaymentStatus,
          saleDate:
            dto.saleDate === undefined ? undefined : new Date(dto.saleDate),
          notes: dto.notes === undefined ? undefined : dto.notes,
        },
      });
    });

    return this.sales.findOne(id);
  }
}
