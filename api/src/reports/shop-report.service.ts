import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import {
  computeCashCollected,
  computeExpenses,
  computeNewDebt,
  computeOutstanding,
  computeRemittancesSent,
  computeSalesValue,
} from './common/money-quantities';
import { resolveOutstandingScope, resolveReportScope } from './common/report-scope';

// P7-04 — the shop report. This is the spec §22 signature distinction
// made real: sales value, cash collected, and outstanding debt appear
// as three visibly separate numbers, computed by the shared primitives
// in common/money-quantities.ts so no report re-derives them.
//
// Shape mirrors phase-7 §5 exactly:
//   sales value / cash at sale / later payments / total collected /
//   new debt / outstanding / expenses / (collected − expenses)
//
// Scope semantics: OWNER may pass shopId (or leave it null → aggregates
// across every shop); SHOP has assignedShopId substituted by
// resolveReportScope. Date range applies to every quantity EXCEPT
// outstanding, which uses resolveOutstandingScope (as-of).

export type ShopReportOut = {
  scope: {
    shopId: string | null;
    from: Date | null;
    to: Date | null;
  };
  salesValue: number;
  cashAtSale: number;
  laterPayments: number;
  totalCollected: number;
  newDebt: number;
  outstanding: number;
  expenses: number;
  netCollected: number; // totalCollected − expenses
  remittances: number; // cash drops shop → warehouse in the window (info)
};

@Injectable()
export class ShopReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filter: ReportFilterDto, user: SessionUser): Promise<ShopReportOut> {
    const scope = resolveReportScope(user, filter);
    const outstandingScope = resolveOutstandingScope(user, filter);

    // All five aggregations are independent; issue them in parallel.
    // Even so, this is the shape of the report — not a tight loop —
    // and each primitive is a single aggregate query, so the total
    // latency is one round-trip pair (sales-side + payments-side).
    const [salesValue, cash, newDebt, outstanding, expenses, remittances] =
      await Promise.all([
        computeSalesValue(this.prisma, scope),
        computeCashCollected(this.prisma, scope),
        computeNewDebt(this.prisma, scope),
        computeOutstanding(this.prisma, outstandingScope),
        computeExpenses(this.prisma, scope),
        computeRemittancesSent(this.prisma, scope),
      ]);

    return {
      scope: { shopId: scope.shopId, from: scope.from, to: scope.to },
      salesValue,
      cashAtSale: cash.cashAtSale,
      laterPayments: cash.laterPayments,
      totalCollected: cash.total,
      newDebt,
      outstanding,
      expenses,
      netCollected: cash.total - expenses,
      remittances,
    };
  }
}
