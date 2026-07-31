import { Module } from '@nestjs/common';
import { SaleCancellationService } from './sale-cancellation.service';
import { SaleEditService } from './sale-edit.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

// SalesModule owns the sale lifecycle: confirmation (Phase 5),
// listing/lookup, cancellation (Phase 6, P6-10 + P6-11 split into its
// own service, matching the transfer-reversal pattern), and the OWNER
// book-correction edit (P6-13). Customer-debt payments live in
// PaymentsModule — that's the other bounded area (architecture §3.2).

@Module({
  controllers: [SalesController],
  providers: [SalesService, SaleCancellationService, SaleEditService],
  exports: [SalesService, SaleCancellationService, SaleEditService],
})
export class SalesModule {}
