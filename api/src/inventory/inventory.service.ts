import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InsufficientStockError, InvalidMovementError } from './errors';
import type { Tx } from './tx';

// The one and only path that writes InventoryBalance or InventoryMovement
// (D-008). Grep the repo for tx.inventoryBalance.update or tx.inventoryMovement.create
// outside this file — that grep must return empty (phase-3 §6 DoD item 3).
//
// Movement direction (D-011):
//   stock in  → destinationLocationId set (receipt, opening, +correction)
//   stock out → sourceLocationId set (sale, -correction)
//   move      → both set (transfer, one row, two balance changes)
// quantity on the row is always positive; direction is encoded by which
// side(s) are present.

export type MovementInput = {
  productId: string;
  quantity: number; // integer, > 0
  movementType: MovementType;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  notes?: string | null;
  createdBy: string;
};

// Aggregated per (location, product) delta collected across a batch. Negative
// delta = source side (deduction); positive delta = destination side (add).
type Pair = { locationId: string; productId: string };
type PairKey = string; // `${locationId}|${productId}`

function pairKey(p: Pair): PairKey {
  return `${p.locationId}|${p.productId}`;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Single-movement convenience. Fine for one-line operations (a single
  // correction, a one-item direct receipt). Multi-item operations MUST use
  // applyMovements so all (location, product) pairs are locked in one sorted
  // pass — see D-011 for why (crossed-lock deadlocks between concurrent
  // sales/transfers of the same two products in different orders).
  async applyMovement(tx: Tx, input: MovementInput): Promise<void> {
    await this.applyMovements(tx, [input]);
  }

  async applyMovements(tx: Tx, inputs: MovementInput[]): Promise<void> {
    if (inputs.length === 0) return;

    // 1. Validate every input shape up front — cheap, and any rejection here
    //    means nothing has been written yet.
    for (const m of inputs) this.validate(m);

    // 2. Collect per-pair signed deltas. A single input may contribute to two
    //    pairs (transfer: -qty on source, +qty on destination). We sum
    //    everything because a batch can legitimately touch the same pair
    //    twice (rare but real — a correction plus a sale in one atomic op).
    const deltas = new Map<PairKey, { pair: Pair; delta: number }>();
    for (const m of inputs) {
      if (m.sourceLocationId) {
        const pair: Pair = { locationId: m.sourceLocationId, productId: m.productId };
        this.addDelta(deltas, pair, -m.quantity);
      }
      if (m.destinationLocationId) {
        const pair: Pair = { locationId: m.destinationLocationId, productId: m.productId };
        this.addDelta(deltas, pair, m.quantity);
      }
    }

    // 3. Sort pairs by (locationId, productId) and lock/apply in that order.
    //    Deterministic global ordering is what prevents crossed-lock deadlocks
    //    between concurrent batch operations (D-011).
    const ordered = [...deltas.values()].sort((a, b) => {
      if (a.pair.locationId !== b.pair.locationId)
        return a.pair.locationId < b.pair.locationId ? -1 : 1;
      return a.pair.productId < b.pair.productId ? -1 : 1;
    });

    for (const { pair, delta } of ordered) {
      // Ensure the balance row exists. randomUUID() supplies the surrogate
      // PK since raw INSERT skips Prisma's @default(cuid()). Unique identity
      // is (locationId, productId); id is just a PK.
      await tx.$executeRaw`
        INSERT INTO "InventoryBalance" ("id", "locationId", "productId", "quantity", "updatedAt")
        VALUES (${randomUUID()}, ${pair.locationId}, ${pair.productId}, 0, NOW())
        ON CONFLICT ("locationId", "productId") DO NOTHING
      `;

      // Lock the row and read current quantity. FOR UPDATE holds the lock for
      // the rest of the caller's transaction, which is what serializes
      // concurrent applyMovements against the same pair.
      const rows = await tx.$queryRaw<Array<{ quantity: number }>>`
        SELECT "quantity"
          FROM "InventoryBalance"
         WHERE "locationId" = ${pair.locationId}
           AND "productId" = ${pair.productId}
         FOR UPDATE
      `;
      // We just upserted; the row must exist.
      const current = rows[0]!.quantity;
      const next = current + delta;
      if (next < 0) {
        // Domain error before the CHECK constraint would ever fire. The
        // caller's transaction rolls back everything we've done so far.
        throw new InsufficientStockError({
          productId: pair.productId,
          locationId: pair.locationId,
          requested: -delta, // delta is negative here; requested is the deduction size
          available: current,
        });
      }

      await tx.$executeRaw`
        UPDATE "InventoryBalance"
           SET "quantity" = ${next}, "updatedAt" = NOW()
         WHERE "locationId" = ${pair.locationId}
           AND "productId" = ${pair.productId}
      `;
    }

    // 4. Insert movement rows. Order within the batch is preserved so tests
    //    reading the ledger see the caller's intended sequence.
    for (const m of inputs) {
      await tx.inventoryMovement.create({
        data: {
          productId: m.productId,
          movementType: m.movementType,
          quantity: m.quantity,
          sourceLocationId: m.sourceLocationId ?? null,
          destinationLocationId: m.destinationLocationId ?? null,
          relatedEntityType: m.relatedEntityType ?? null,
          relatedEntityId: m.relatedEntityId ?? null,
          notes: m.notes ?? null,
          createdBy: m.createdBy,
        },
      });
    }
  }

  // Standing invariant test #1 (architecture §3.5, phase-3 §2). For every
  // (location, product), Σ movements(destination=loc) − Σ movements(source=loc)
  // must equal balance.quantity. Returns rows that violate this — an empty
  // array means the ledger is healthy. Called in test teardowns to catch any
  // code path that bypassed the chokepoint.
  async verifyLedgerBalanceInvariant(
    tx: Tx | PrismaService = this.prisma,
  ): Promise<
    Array<{ locationId: string; productId: string; balance: number; ledger: number }>
  > {
    return tx.$queryRaw`
      WITH ledger AS (
        SELECT loc AS "locationId", "productId", SUM(signed_qty)::int AS qty
          FROM (
            SELECT "destinationLocationId" AS loc, "productId",  "quantity" AS signed_qty
              FROM "InventoryMovement" WHERE "destinationLocationId" IS NOT NULL
            UNION ALL
            SELECT "sourceLocationId" AS loc,  "productId", -"quantity" AS signed_qty
              FROM "InventoryMovement" WHERE "sourceLocationId" IS NOT NULL
          ) t
         GROUP BY loc, "productId"
      )
      SELECT b."locationId",
             b."productId",
             b."quantity"::int AS balance,
             COALESCE(l.qty, 0)::int AS ledger
        FROM "InventoryBalance" b
        LEFT JOIN ledger l
          ON l."locationId" = b."locationId" AND l."productId" = b."productId"
       WHERE b."quantity" <> COALESCE(l.qty, 0)
    `;
  }

  private validate(m: MovementInput): void {
    if (!Number.isInteger(m.quantity) || m.quantity <= 0) {
      throw new InvalidMovementError(`quantity must be a positive integer (got ${m.quantity})`);
    }
    if (!m.sourceLocationId && !m.destinationLocationId) {
      throw new InvalidMovementError('at least one of sourceLocationId or destinationLocationId is required');
    }
    if (m.sourceLocationId && m.destinationLocationId && m.sourceLocationId === m.destinationLocationId) {
      throw new InvalidMovementError('source and destination must differ when both are set');
    }
  }

  private addDelta(
    map: Map<PairKey, { pair: Pair; delta: number }>,
    pair: Pair,
    delta: number,
  ): void {
    const key = pairKey(pair);
    const existing = map.get(key);
    if (existing) existing.delta += delta;
    else map.set(key, { pair, delta });
  }
}

