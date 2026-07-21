import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

// PaymentsModule owns customer-debt payments and their reversal
// (phase-6 PR-A). Sale cancellation lives in SalesModule where the
// confirmation transaction already sits — one bounded area, one module
// (architecture §3.2). ReferenceService comes from InventoryModule
// which is @Global(), so no explicit import is needed.

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
