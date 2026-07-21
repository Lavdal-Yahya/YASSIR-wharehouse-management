import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SessionUser } from '../common/types/session-user';
import { ReportFilterDto } from './dto/report-filter.dto';
import { resolveReportScope } from './common/report-scope';

// P7-08 — incoming orders report. Reads over IncomingOrder +
// IncomingOrderItem from Phase 3. No money model involvement.
//
// The core question this report answers is spec's own: "what did we
// order, what has actually arrived, what's still coming". CANCELLED
// orders drop out of active totals; they're reported in a separate
// count so the operator can see history without those distorting
// remaining/received sums.

const RECENT_LIMIT = 100;

export type IncomingOrdersReportOut = {
  scope: { from: Date | null; to: Date | null };
  byStatus: Array<{
    status: OrderStatus;
    ordersCount: number;
    orderedUnits: number;
    receivedUnits: number;
    remainingUnits: number; // orderedUnits − receivedUnits (never < 0)
  }>;
  recentOrders: Array<{
    id: string;
    referenceNumber: string;
    supplierName: string | null;
    orderDate: Date;
    expectedArrivalDate: Date | null;
    status: OrderStatus;
    orderedUnits: number;
    receivedUnits: number;
    remainingUnits: number;
  }>;
};

@Injectable()
export class IncomingOrdersReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    filter: ReportFilterDto,
    user: SessionUser,
  ): Promise<IncomingOrdersReportOut> {
    // Incoming orders are warehouse-side; no shop scoping applies.
    const scope = resolveReportScope(user, {
      from: filter.from,
      to: filter.to,
      shopId: undefined,
    });

    const dateRange: Prisma.DateTimeFilter | undefined =
      scope.from || scope.to
        ? {
            ...(scope.from ? { gte: scope.from } : {}),
            ...(scope.to ? { lte: scope.to } : {}),
          }
        : undefined;

    const where: Prisma.IncomingOrderWhereInput = {};
    if (dateRange) where.orderDate = dateRange;

    // Pull orders + items in one hop; the report is small at v1 scale.
    // If the volume ever grows past comfortable, replace the item
    // roll-up with a groupBy(IncomingOrderItem) joined via the
    // relation predicate.
    const orders = await this.prisma.incomingOrder.findMany({
      where,
      include: {
        items: {
          select: { quantityOrdered: true, quantityReceived: true },
        },
      },
      orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    });

    type Acc = {
      ordersCount: number;
      orderedUnits: number;
      receivedUnits: number;
    };
    const byStatusMap = new Map<OrderStatus, Acc>();
    const recent: IncomingOrdersReportOut['recentOrders'] = [];

    for (const o of orders) {
      let ordered = 0;
      let received = 0;
      for (const it of o.items) {
        ordered += it.quantityOrdered;
        received += it.quantityReceived;
      }
      const remaining = Math.max(0, ordered - received);
      const acc = byStatusMap.get(o.status) ?? {
        ordersCount: 0,
        orderedUnits: 0,
        receivedUnits: 0,
      };
      acc.ordersCount += 1;
      acc.orderedUnits += ordered;
      acc.receivedUnits += received;
      byStatusMap.set(o.status, acc);

      if (recent.length < RECENT_LIMIT) {
        recent.push({
          id: o.id,
          referenceNumber: o.referenceNumber,
          supplierName: o.supplierName,
          orderDate: o.orderDate,
          expectedArrivalDate: o.expectedArrivalDate,
          status: o.status,
          orderedUnits: ordered,
          receivedUnits: received,
          remainingUnits: remaining,
        });
      }
    }

    const byStatus = [...byStatusMap.entries()]
      .map(([status, acc]) => ({
        status,
        ordersCount: acc.ordersCount,
        orderedUnits: acc.orderedUnits,
        receivedUnits: acc.receivedUnits,
        remainingUnits: Math.max(0, acc.orderedUnits - acc.receivedUnits),
      }))
      .sort((a, b) => (a.status < b.status ? -1 : 1));

    return {
      scope: { from: scope.from, to: scope.to },
      byStatus,
      recentOrders: recent,
    };
  }
}
