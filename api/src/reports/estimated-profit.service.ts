import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import { ACTIVE_SALE } from './common/active-filters';
import { resolveReportScope } from './common/report-scope';

// P7-09 — the estimated gross profit block. spec §27 and phase-7 §5
// are a labeling requirement, not just a calculation:
//   * COGS is summed ONLY over sale lines where unitCostSnapshot is
//     non-null. Lines without a cost snapshot contribute 0 (not NaN,
//     not "unknown"), so the number is deterministic and comparable
//     across periods — but the coverage figure tells the operator
//     how honest the underlying data is.
//   * The response NEVER carries a "net profit" — the caller renders
//     "estimated gross profit" (or, if coverage < 1, "estimated" with
//     the coverage percentage next to it). "Net profit" is
//     unrepresentable in this shape by design.
//   * Coverage denominator is line count (advisor: matches the UX
//     phrasing "costs known for N% of items"). A "% of revenue with
//     known cost" alternative would diverge widely when a single big
//     line lacks its snapshot — line count is the honest catalog
//     measure.

export type EstimatedProfitOut = {
  scope: {
    shopId: string | null;
    from: Date | null;
    to: Date | null;
  };
  salesValue: number;
  cogs: number;
  grossEstimated: number; // salesValue − cogs
  coverage: {
    lineCount: number;
    linesWithCost: number;
    ratio: number; // 0..1; 1 means every line had a snapshot
  };
  // When ratio < 1, the caller MUST label the figure as estimated
  // and render the coverage next to it. This flag exists so the UI
  // can't accidentally skip that label.
  isEstimated: boolean;
};

@Injectable()
export class EstimatedProfitService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filter: ReportFilterDto, user: SessionUser): Promise<EstimatedProfitOut> {
    const scope = resolveReportScope(user, filter);

    const saleWhere: Prisma.SaleWhereInput = { ...ACTIVE_SALE };
    if (scope.shopId) saleWhere.shopId = scope.shopId;
    if (scope.from || scope.to) {
      saleWhere.saleDate = {
        ...(scope.from ? { gte: scope.from } : {}),
        ...(scope.to ? { lte: scope.to } : {}),
      };
    }

    // Sales value from the sale rows themselves. Matches
    // computeSalesValue precisely so a shop report and this block
    // never disagree on the "sold" number.
    const salesAgg = await this.prisma.sale.aggregate({
      where: saleWhere,
      _sum: { totalAmount: true },
    });
    const salesValue = salesAgg._sum.totalAmount ?? 0;

    // Pull every sale item in scope; we need the individual snapshot
    // presence for coverage and the (qty, snapshot) pair for COGS.
    // This is fine at v1 scale (a shop-month is thousands of lines
    // at most); if it ever bites, replace with a $queryRaw that does
    // both SUMs in one pass.
    const items = await this.prisma.saleItem.findMany({
      where: { sale: saleWhere },
      select: { quantity: true, unitCostSnapshot: true },
    });

    let lineCount = 0;
    let linesWithCost = 0;
    let cogs = 0;
    for (const it of items) {
      lineCount += 1;
      if (it.unitCostSnapshot !== null) {
        linesWithCost += 1;
        cogs += it.unitCostSnapshot * it.quantity;
      }
    }
    const ratio = lineCount === 0 ? 1 : linesWithCost / lineCount;
    // "Estimated" iff any line was missing its cost snapshot. The
    // zero-line case (empty window) is treated as fully covered —
    // there's nothing to be uncertain about.
    const isEstimated = lineCount > 0 && linesWithCost < lineCount;

    return {
      scope: { shopId: scope.shopId, from: scope.from, to: scope.to },
      salesValue,
      cogs,
      grossEstimated: salesValue - cogs,
      coverage: { lineCount, linesWithCost, ratio },
      isEstimated,
    };
  }
}
