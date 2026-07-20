import { Global, Module } from '@nestjs/common';
import { CorrectionsService } from './corrections.service';
import { InventoryController } from './inventory.controller';
import { InventoryReadsService } from './inventory-reads.service';
import { InventoryService } from './inventory.service';
import { OpeningStockService } from './opening-stock.service';
import { ReferenceService } from './reference.service';

// Global module so any feature module can inject ReferenceService and
// InventoryService without re-importing. The chokepoint architecture (D-008)
// only works if the whole app has exactly one InventoryService instance —
// which is what Nest's DI + @Global() gives us for free.
@Global()
@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    ReferenceService,
    OpeningStockService,
    CorrectionsService,
    InventoryReadsService,
  ],
  exports: [InventoryService, ReferenceService, InventoryReadsService],
})
export class InventoryModule {}
