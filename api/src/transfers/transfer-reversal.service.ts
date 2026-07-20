import { Injectable } from '@nestjs/common';
import { MovementType, TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResourceNotFoundError } from '../common/errors/generic-errors';
import { InsufficientStockError } from '../inventory/errors';
import { InventoryService, MovementInput } from '../inventory/inventory.service';
import { SessionUser } from '../common/types/session-user';
import type { ReverseTransferDto } from './dto/transfer.dto';
import {
  DestinationInsufficientStockError,
  TransferNotReversibleError,
} from './errors';
import { TransferDetail, TransfersService } from './transfers.service';

// Transfer reversal (P4-04). OWNER only (guarded at the controller). One
// transaction:
//   1. Lock the transfer row and check status == COMPLETED.
//   2. Emit mirrored movements (source ↔ destination swapped) through the
//      chokepoint. Insufficient destination stock — the destination has spent
//      the goods since — surfaces from the chokepoint and we retag it as
//      DESTINATION_INSUFFICIENT_STOCK so the UI can say "the destination no
//      longer holds enough" instead of a source-focused message (phase-4 §3).
//   3. Set status = REVERSED with reversedBy/At/reason. The original row and
//      its movements stay untouched — ledger shows both events, matching
//      spec §16.5 "preserve, never delete".

@Injectable()
export class TransferReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly transfers: TransfersService,
  ) {}

  async reverse(
    id: string,
    dto: ReverseTransferDto,
    user: SessionUser,
  ): Promise<TransferDetail> {
    await this.prisma.$transaction(async (tx) => {
      // Lock the transfer row so two concurrent reverse attempts serialize
      // instead of both computing "COMPLETED, go".
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          status: TransferStatus;
          sourceLocationId: string;
          destinationLocationId: string;
        }>
      >`
        SELECT "id", "status", "sourceLocationId", "destinationLocationId"
          FROM "StockTransfer"
         WHERE "id" = ${id}
         FOR UPDATE
      `;
      if (rows.length === 0) throw new ResourceNotFoundError('Transfer', id);
      const transfer = rows[0]!;
      if (transfer.status !== TransferStatus.COMPLETED) {
        throw new TransferNotReversibleError(transfer.status);
      }

      const items = await tx.stockTransferItem.findMany({
        where: { stockTransferId: id },
        select: { productId: true, quantity: true },
        orderBy: { id: 'asc' },
      });
      // Should never be empty in practice (create() enforces ≥1 item), but
      // guard anyway — nothing to do means no state to change.
      if (items.length === 0) {
        throw new TransferNotReversibleError(transfer.status);
      }

      // Mirrored movements — the original moved src→dst; reversal moves
      // dst→src. Same quantities, type TRANSFER, notes tag the direction.
      // Batch call ⇒ single sorted lock pass across every affected pair
      // (D-011), matching the create-side discipline.
      const movements: MovementInput[] = items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        movementType: MovementType.TRANSFER,
        sourceLocationId: transfer.destinationLocationId,
        destinationLocationId: transfer.sourceLocationId,
        relatedEntityType: 'StockTransfer',
        relatedEntityId: id,
        notes: 'reversal',
        createdBy: user.id,
      }));

      try {
        await this.inventory.applyMovements(tx, movements);
      } catch (err) {
        // Retag INSUFFICIENT_STOCK — for reversal it means the destination
        // has already spent the goods. Preserve the productId/available so
        // the UI can render "the destination no longer holds enough of
        // product X to reverse".
        if (err instanceof InsufficientStockError) {
          throw new DestinationInsufficientStockError({
            productId: err.productId,
            available: err.available,
            requested: err.requested,
          });
        }
        throw err;
      }

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.REVERSED,
          reversedBy: user.id,
          reversedAt: new Date(),
          reversalReason: dto.reason,
        },
      });
    });

    return this.transfers.findOne(id);
  }
}
