import { MovementType } from '@prisma/client';
import { InventoryService, MovementInput } from './inventory.service';
import { InvalidMovementError } from './errors';

// Unit-level: shape validation is the only pure logic in this service.
// Row-locking, insufficient-stock throws, batch lock ordering, and the
// ledger-Σ = balance invariant are proven against real Postgres in the
// P3-13 integration suite (mocking Prisma FOR UPDATE would test the mock).

const svc = new InventoryService(null as never);
const base: MovementInput = {
  productId: 'p1',
  quantity: 3,
  movementType: MovementType.OPENING_STOCK,
  destinationLocationId: 'loc-warehouse',
  createdBy: 'user1',
};

describe('InventoryService input validation', () => {
  it('rejects zero quantity', async () => {
    await expect(svc.applyMovement({} as never, { ...base, quantity: 0 })).rejects.toBeInstanceOf(
      InvalidMovementError,
    );
  });

  it('rejects negative quantity', async () => {
    await expect(svc.applyMovement({} as never, { ...base, quantity: -1 })).rejects.toBeInstanceOf(
      InvalidMovementError,
    );
  });

  it('rejects non-integer quantity', async () => {
    await expect(
      svc.applyMovement({} as never, { ...base, quantity: 1.5 }),
    ).rejects.toBeInstanceOf(InvalidMovementError);
  });

  it('rejects when neither side is set', async () => {
    await expect(
      svc.applyMovement({} as never, {
        ...base,
        destinationLocationId: undefined,
        sourceLocationId: undefined,
      }),
    ).rejects.toBeInstanceOf(InvalidMovementError);
  });

  it('rejects when source and destination are the same location', async () => {
    await expect(
      svc.applyMovement({} as never, {
        ...base,
        sourceLocationId: 'same',
        destinationLocationId: 'same',
        movementType: MovementType.TRANSFER,
      }),
    ).rejects.toBeInstanceOf(InvalidMovementError);
  });

  it('empty batch is a no-op (does not throw, does not touch tx)', async () => {
    const tx = {} as never;
    await expect(svc.applyMovements(tx, [])).resolves.toBeUndefined();
  });
});
