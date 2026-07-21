import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

// SalesModule owns confirmation, listing, and lookup. Cancellation and
// customer-payment allocation belong to Phase 6; when that arrives the
// cancellation service will live here too so the "one sale, one place"
// discipline holds.

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
