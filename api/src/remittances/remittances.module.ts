import { Module } from '@nestjs/common';
import { RemittancesController } from './remittances.controller';
import { RemittancesService } from './remittances.service';

// Cash remittances (shop → central warehouse). Reads live in the
// reports module (cash-on-hand endpoint); this module owns the write
// path only.

@Module({
  controllers: [RemittancesController],
  providers: [RemittancesService],
  exports: [RemittancesService],
})
export class RemittancesModule {}
