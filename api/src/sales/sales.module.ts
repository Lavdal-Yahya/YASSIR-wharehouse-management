import { Module } from '@nestjs/common';
import { SaleCancellationService } from './sale-cancellation.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

// SalesModule owns the sale lifecycle: confirmation (Phase 5),
// listing/lookup, and cancellation (Phase 6, P6-10 + P6-11 split into
// its own service, matching the transfer-reversal pattern).
// Customer-debt payments live in PaymentsModule — that's the other
// bounded area (architecture §3.2).

@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleCancellationService],
  exports: [SalesService, SaleCancellationService],
})
export class SalesModule {}
