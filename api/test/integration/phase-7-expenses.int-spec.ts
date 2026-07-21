import { ExpenseStatus } from '@prisma/client';
import {
  ExpenseNotCancellableError,
  ExpenseNotEditableError,
  ExpenseNotFoundError,
} from '../../src/expenses/errors';
import { ResourceNotFoundError } from '../../src/common/errors/generic-errors';
import {
  createHarness,
  makeShopLocation,
  resetDatabase,
  seedBasics,
} from './setup';
import type { SessionUser } from '../../src/common/types/session-user';

// Phase 7 · expenses — service-level integration tests (P7-01, P7-12 §8).
// Report-level tests (money separation, cancelled exclusion) live in
// their own suites next to the report they exercise.
//
// Standing invariants (ledger + sale-coherence + payment-snapshot) don't
// touch expenses, but rerun them anyway — they must stay green through
// every phase's suite.

const h = createHarness();
let ctx: { categoryId: string; warehouseId: string; userId: string };
let owner: SessionUser;
let shopUser: SessionUser;
let shopA: { shopId: string; locationId: string };
let shopB: { shopId: string; locationId: string };

beforeEach(async () => {
  await resetDatabase(h.prisma);
  ctx = await seedBasics(h.prisma);
  owner = { id: ctx.userId, name: 'Owner', role: 'OWNER', assignedShopId: null };
  shopA = await makeShopLocation(h.prisma);
  shopB = await makeShopLocation(h.prisma);
  const shopUserRow = await h.prisma.user.upsert({
    where: { username: 'test-shop-user' },
    update: { assignedShopId: shopA.shopId, role: 'SHOP' },
    create: {
      name: 'Shop User',
      username: 'test-shop-user',
      passwordHash: 'x',
      role: 'SHOP',
      assignedShopId: shopA.shopId,
    },
  });
  shopUser = {
    id: shopUserRow.id,
    name: shopUserRow.name,
    role: 'SHOP',
    assignedShopId: shopA.shopId,
  };
});

afterEach(async () => {
  const ledger = await h.inventory.verifyLedgerBalanceInvariant(h.prisma);
  expect(ledger).toEqual([]);
  const saleCoherence = await h.sales.verifySaleCoherenceInvariant();
  expect(saleCoherence).toEqual([]);
  const paymentSnapshot = await h.payments.verifyPaymentSnapshotInvariant();
  expect(paymentSnapshot).toEqual([]);
});

afterAll(async () => {
  await h.disconnect();
});

async function makeExpenseCategory(name = `cat-${Date.now()}`) {
  return h.prisma.expenseCategory.create({ data: { name } });
}

describe('P7-01 · create', () => {
  it('creates an ACTIVE expense with an EXP- reference', async () => {
    const cat = await makeExpenseCategory();
    const created = await h.expenses.create(
      {
        shopId: shopA.shopId,
        categoryId: cat.id,
        amount: 25_000,
        description: 'Diesel — generator',
        notes: 'monthly refill',
      },
      owner,
    );
    expect(created.referenceNumber).toMatch(/^EXP-/);
    expect(created.status).toBe(ExpenseStatus.ACTIVE);
    expect(created.amount).toBe(25_000);
    expect(created.categoryName).toBe(cat.name);
    expect(created.shopId).toBe(shopA.shopId);
  });

  it('accepts an expense without a category (category is optional)', async () => {
    const created = await h.expenses.create(
      {
        shopId: shopA.shopId,
        amount: 1_000,
        description: 'Cleaning supplies',
      },
      owner,
    );
    expect(created.categoryId).toBeNull();
    expect(created.categoryName).toBeNull();
  });

  it('rejects an archived category (same rule as products)', async () => {
    const cat = await makeExpenseCategory();
    await h.prisma.expenseCategory.update({
      where: { id: cat.id },
      data: { active: false },
    });
    await expect(
      h.expenses.create(
        {
          shopId: shopA.shopId,
          categoryId: cat.id,
          amount: 1_000,
          description: 'x',
        },
        owner,
      ),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('P7-01 · update (ACTIVE only)', () => {
  it('edits description, amount, and category on an ACTIVE expense', async () => {
    const cat1 = await makeExpenseCategory('cat-a-' + Date.now());
    const cat2 = await makeExpenseCategory('cat-b-' + Date.now());
    const created = await h.expenses.create(
      {
        shopId: shopA.shopId,
        categoryId: cat1.id,
        amount: 1_000,
        description: 'orig',
      },
      owner,
    );
    const updated = await h.expenses.update(
      created.id,
      { amount: 2_500, description: 'updated', categoryId: cat2.id },
      owner,
    );
    expect(updated.amount).toBe(2_500);
    expect(updated.description).toBe('updated');
    expect(updated.categoryId).toBe(cat2.id);
  });

  it('refuses to edit a CANCELLED expense (frozen for audit)', async () => {
    const created = await h.expenses.create(
      { shopId: shopA.shopId, amount: 1_000, description: 'x' },
      owner,
    );
    await h.expenses.cancel(created.id, { reason: 'wrong' }, owner);
    await expect(
      h.expenses.update(created.id, { amount: 500 }, owner),
    ).rejects.toBeInstanceOf(ExpenseNotEditableError);
  });
});

describe('P7-01 · cancel', () => {
  it('flips status to CANCELLED with cancelledBy/At/reason', async () => {
    const created = await h.expenses.create(
      { shopId: shopA.shopId, amount: 1_000, description: 'x' },
      owner,
    );
    const cancelled = await h.expenses.cancel(
      created.id,
      { reason: 'duplicate entry' },
      owner,
    );
    expect(cancelled.status).toBe(ExpenseStatus.CANCELLED);
    expect(cancelled.cancellationReason).toBe('duplicate entry');
    expect(cancelled.cancelledBy).toBe(owner.id);
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
  });

  it('double-cancel → EXPENSE_NOT_CANCELLABLE', async () => {
    const created = await h.expenses.create(
      { shopId: shopA.shopId, amount: 1_000, description: 'x' },
      owner,
    );
    await h.expenses.cancel(created.id, { reason: 'first' }, owner);
    await expect(
      h.expenses.cancel(created.id, { reason: 'second' }, owner),
    ).rejects.toBeInstanceOf(ExpenseNotCancellableError);
  });
});

describe('P7-01 · shop scoping (SHOP → own shop only)', () => {
  it('SHOP fetching a foreign expense id → 404 (no existence leak)', async () => {
    // Owner creates an expense in shopB; the SHOP user (assigned to
    // shopA) must not be able to read it, and must get 404 rather than
    // 403 so we don't confirm the id exists.
    const foreign = await h.expenses.create(
      { shopId: shopB.shopId, amount: 500, description: 'foreign' },
      owner,
    );
    await expect(h.expenses.findOne(foreign.id, shopUser)).rejects.toBeInstanceOf(
      ExpenseNotFoundError,
    );
  });

  it('SHOP list() is silently constrained to their own shop', async () => {
    await h.expenses.create(
      { shopId: shopA.shopId, amount: 100, description: 'mine' },
      shopUser, // ShopScopeGuard would have substituted body.shopId already
    );
    await h.expenses.create(
      { shopId: shopB.shopId, amount: 200, description: 'foreign' },
      owner,
    );
    // Query includes shopB, but the service overrides for SHOP roles.
    const list = await h.expenses.list(
      { shopId: shopB.shopId, page: 1, pageSize: 25 },
      shopUser,
    );
    expect(list.total).toBe(1);
    expect(list.items[0]?.description).toBe('mine');
  });
});

describe('P7-01 · DB CHECK backstops the DTO', () => {
  it('raw insert with amount = 0 → rejected by expense_amount_positive', async () => {
    await expect(
      h.prisma.$executeRaw`
        INSERT INTO "Expense"
          ("id", "referenceNumber", "shopId", "amount",
           "expenseDate", "description", "status", "createdBy", "updatedAt")
        VALUES ('raw-1', 'EXP-RAW', ${shopA.shopId}, 0,
                NOW(), 'x', 'ACTIVE', ${ctx.userId}, NOW())
      `,
    ).rejects.toThrow(/expense_amount_positive/);
  });
});
