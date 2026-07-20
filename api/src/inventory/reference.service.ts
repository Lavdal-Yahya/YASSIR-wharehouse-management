import { Injectable } from '@nestjs/common';
import type { Tx } from './tx';

// Kinds mirror the seeded ReferenceCounter rows (spec §35).
export type ReferenceKind = 'ORD' | 'REC' | 'TRF' | 'SAL' | 'PAY' | 'EXP' | 'ADJ';

// Padded width for the numeric part. Six digits gives us a million per kind
// before wrap — comfortable for a small trading business's lifetime.
const PAD = 6;

@Injectable()
export class ReferenceService {
  // SELECT ... FOR UPDATE the counter row inside the caller's transaction,
  // bump it, format it. Gaps after rolled-back transactions are acceptable
  // (architecture §3.8) — the constraint is uniqueness, not density.
  async next(tx: Tx, kind: ReferenceKind): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ value: number }>>`
      UPDATE "ReferenceCounter"
         SET "value" = "value" + 1
       WHERE "kind" = ${kind}
       RETURNING "value"
    `;
    if (rows.length === 0) {
      // The row is bootstrapped by the Phase 3 migration and re-asserted by seed.
      // Missing means someone truncated the table — treat as a programmer error.
      throw new Error(`ReferenceCounter row missing for kind=${kind}`);
    }
    return `${kind}-${String(rows[0]!.value).padStart(PAD, '0')}`;
  }
}
