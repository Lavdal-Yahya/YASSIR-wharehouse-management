import { Global, Module } from '@nestjs/common';
import { ReferenceService } from './reference.service';

// Global module so any feature module can inject ReferenceService (and, from
// P3-03, InventoryService) without re-importing. The chokepoint architecture
// only works if the whole app has one source for these.
@Global()
@Module({
  providers: [ReferenceService],
  exports: [ReferenceService],
})
export class InventoryModule {}
