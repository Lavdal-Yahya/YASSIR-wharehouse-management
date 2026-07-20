import { Module } from '@nestjs/common';
import { IncomingOrdersController } from './incoming-orders.controller';
import { IncomingOrdersService } from './incoming-orders.service';

// Receive and cancel services join this module in P3-05 and P3-06 respectively.
@Module({
  controllers: [IncomingOrdersController],
  providers: [IncomingOrdersService],
  exports: [IncomingOrdersService],
})
export class IncomingOrdersModule {}
