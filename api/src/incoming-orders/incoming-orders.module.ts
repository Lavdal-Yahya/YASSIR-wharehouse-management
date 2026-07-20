import { Module } from '@nestjs/common';
import { IncomingOrdersController } from './incoming-orders.controller';
import { IncomingOrdersService } from './incoming-orders.service';
import { ReceiveService } from './receive.service';

// Cancel service joins in P3-06.
@Module({
  controllers: [IncomingOrdersController],
  providers: [IncomingOrdersService, ReceiveService],
  exports: [IncomingOrdersService, ReceiveService],
})
export class IncomingOrdersModule {}
