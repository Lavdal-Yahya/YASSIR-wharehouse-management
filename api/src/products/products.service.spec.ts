import { ProductsService } from './products.service';
import { ProductHasHistoryError } from './errors';
import { ResourceNotFoundError } from '../common/errors/generic-errors';

// Phase 2 has no history tables yet; the hasHistory method is a placeholder
// (returns false). We still prove the delete flow that gates on it — later
// phases extend the method, but the guard shape must stay the same.
// phase-2.md DoD #3.

type ProductRow = { id: string } | null;

function makeSvc(overrides: {
  product?: ProductRow;
  hasHistoryReturns?: boolean;
  deleteImpl?: () => Promise<unknown>;
} = {}) {
  const product = 'product' in overrides ? overrides.product : { id: 'p1' };
  const prisma = {
    product: {
      findUnique: jest.fn().mockResolvedValue(product),
      delete: jest.fn().mockImplementation(overrides.deleteImpl ?? (() => Promise.resolve({}))),
    },
  } as unknown as import('../prisma/prisma.service').PrismaService;

  const svc = new ProductsService(prisma);
  if (overrides.hasHistoryReturns !== undefined) {
    jest.spyOn(svc, 'hasHistory').mockResolvedValue(overrides.hasHistoryReturns);
  }
  return { svc, prisma };
}

describe('ProductsService.remove', () => {
  it('deletes when hasHistory returns false', async () => {
    const { svc, prisma } = makeSvc({ hasHistoryReturns: false });
    await svc.remove('p1');
    expect((prisma.product.delete as jest.Mock)).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('throws PRODUCT_HAS_HISTORY when hasHistory returns true', async () => {
    const { svc, prisma } = makeSvc({ hasHistoryReturns: true });
    await expect(svc.remove('p1')).rejects.toBeInstanceOf(ProductHasHistoryError);
    expect((prisma.product.delete as jest.Mock)).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for an unknown product', async () => {
    const { svc } = makeSvc({ product: null });
    await expect(svc.remove('missing')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
