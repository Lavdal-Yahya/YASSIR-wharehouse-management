import { Module } from '@nestjs/common';

// ReportsModule aggregates read-only projections over the money and
// stock model (phase-7 §4). Every report goes through the shared
// `common/` primitives — active-only filters (D-013 for allocations),
// resolveReportScope (shop-scoping + UTC date bounds per D-015), and
// the four money-quantity functions (sales value, cash collected,
// new debt, outstanding) so no report re-derives them.
//
// Providers get added one at a time as their services land in
// subsequent commits (P7-04 shop report first).

@Module({
  controllers: [],
  providers: [],
  exports: [],
})
export class ReportsModule {}
