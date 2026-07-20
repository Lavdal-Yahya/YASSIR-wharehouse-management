import { Global, Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { ReferenceService } from './reference.service';

// Global module so any feature module can inject ReferenceService and
// InventoryService without re-importing. The chokepoint architecture (D-008)
// only works if the whole app has exactly one InventoryService instance —
// which is what Nest's DI + @Global() gives us for free.
@Global()
@Module({
  providers: [InventoryService, ReferenceService],
  exports: [InventoryService, ReferenceService],
})
export class InventoryModule {}
