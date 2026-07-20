import { ReferenceService } from './reference.service';
import type { Tx } from './tx';

// Unit-level: the SQL statement and the padding/format contract.
// Concurrency (parallel next() serializes on the same kind) is proven in
// the P3-13 integration suite against a real Postgres.

function makeTx(returnValue: number) {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ value: returnValue }]),
  } as unknown as Tx;
}

describe('ReferenceService.next', () => {
  const svc = new ReferenceService();

  it('formats value as KIND-000001', async () => {
    const tx = makeTx(1);
    await expect(svc.next(tx, 'ORD')).resolves.toBe('ORD-000001');
  });

  it('pads to six digits', async () => {
    const tx = makeTx(42);
    await expect(svc.next(tx, 'SAL')).resolves.toBe('SAL-000042');
  });

  it('handles large values without truncating', async () => {
    const tx = makeTx(1_000_000);
    await expect(svc.next(tx, 'REC')).resolves.toBe('REC-1000000');
  });

  it('throws when counter row is missing (truncated table)', async () => {
    const tx = { $queryRaw: jest.fn().mockResolvedValue([]) } as unknown as Tx;
    await expect(svc.next(tx, 'ADJ')).rejects.toThrow(/ReferenceCounter row missing/);
  });
});
